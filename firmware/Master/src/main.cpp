#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <LittleFS.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include "config.h"
#include "pzem_reader.h"
#include "mqtt_handler.h"
#include <WiFi.h>

// Le LCD est instancié dynamiquement une fois son adresse détectée (0x27 ou 0x3F).
static LiquidCrystal_I2C* lcd = nullptr;
static uint8_t lcdAddr = 0;
static unsigned long lastPublishMs = 0;
bool lcdAvailable = false;
unsigned long activityFlashUntil = 0;

// ─────────────────────────────────────────────────────────────────
//  Scan du bus I2C + initialisation automatique du LCD
//  Journalise toutes les adresses présentes puis sélectionne le LCD.
// ─────────────────────────────────────────────────────────────────
void i2c_scan_and_init_lcd() {
    Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

    Serial.println("🔎 Scan du bus I2C (SDA=21, SCL=22)...");
    int found = 0;
    bool has27 = false, has3F = false;
    for (uint8_t addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.printf("   ✓ Périphérique I2C trouvé à 0x%02X\n", addr);
            found++;
            if (addr == LCD_ADDR)     has27 = true;
            if (addr == LCD_ADDR_ALT) has3F = true;
        }
    }
    if (found == 0) {
        Serial.println("   ✗ Aucun périphérique I2C détecté.");
        Serial.println("     → Vérifier : GND commun ESP32/convertisseur/LCD, LCD alimenté en 5V,");
        Serial.println("       SDA/SCL non croisés, convertisseur bidirectionnel (I2C).");
    }

    // Sélection de l'adresse du LCD : 0x27 en priorité, sinon 0x3F
    if (has27)      lcdAddr = LCD_ADDR;
    else if (has3F) lcdAddr = LCD_ADDR_ALT;

    if (lcdAddr != 0) {
        Serial.printf("📺 LCD détecté sur 0x%02X — initialisation.\n", lcdAddr);
        lcd = new LiquidCrystal_I2C(lcdAddr, LCD_COLS, LCD_ROWS);
        lcd->init();
        lcd->backlight();
        lcd->clear();
        lcd->setCursor(0, 0);
        lcd->print("SENTINEL INIT...");
        lcdAvailable = true;
    } else {
        Serial.println("⚠️ LCD non détecté (ni 0x27 ni 0x3F). Poursuite sans afficheur.");
        lcdAvailable = false;
    }
}

void handle_leds() {
    unsigned long now = millis();
    
    if (now < activityFlashUntil) {
        digitalWrite(LED_ACTIVITY_PIN, HIGH);
    } else {
        digitalWrite(LED_ACTIVITY_PIN, LOW);
    }
    
    if (mqtt_connected()) {
        digitalWrite(LED_NETWORK_PIN, HIGH);
    } else if (WiFi.status() == WL_CONNECTED) {
        digitalWrite(LED_NETWORK_PIN, (now / 1000) % 2 == 0 ? HIGH : LOW);
    } else {
        digitalWrite(LED_NETWORK_PIN, (now / 200) % 2 == 0 ? HIGH : LOW);
    }
}

WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 3600); // 3600 = GMT+1

static unsigned long lastGoodEpoch = 0;
static unsigned long millisAtSync = 0;

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n🛡️ SENTINEL MASTER STARTING...");

    pinMode(LED_NETWORK_PIN, OUTPUT);
    pinMode(LED_ACTIVITY_PIN, OUTPUT);

    if (!LittleFS.begin(true)) {
        Serial.println("❌ Erreur de montage LittleFS");
    } else {
        Serial.println("📂 LittleFS initialisé");
    }

    // Scan I2C + détection automatique de l'adresse du LCD (0x27 / 0x3F)
    i2c_scan_and_init_lcd();

    pzem_init();
    mqtt_setup();
    timeClient.begin();

    // Synchro NTP initiale (si WiFi déjà connecté) pour horodater dès le départ
    if (WiFi.status() == WL_CONNECTED && timeClient.update()) {
        unsigned long e = timeClient.getEpochTime();
        if (e > 1600000000) {
            lastGoodEpoch = e;
            millisAtSync = millis();
        }
    }

    if (lcdAvailable && lcd) {
        lcd->clear();
        lcd->print("SYSTEME PRET");
    }
}

// Affiché sur le LCD quand le portail de configuration WiFi s'ouvre (mode AP) :
// l'opérateur voit le nom du réseau auquel se connecter avec son téléphone.
void net_on_portal_open(const char* apName) {
    Serial.printf("🛜 Portail WiFi ouvert — réseau : %s (mdp: %s)\n", apName, WIFI_AP_PASSWORD);
    if (lcdAvailable && lcd) {
        lcd->clear();
        lcd->setCursor(0, 0);
        lcd->print("CONFIG WIFI:");
        lcd->setCursor(0, 1);
        lcd->print(apName);
    }
}

// Reconnexion WiFi en arrière-plan (NON bloquante) : si la liaison tombe, on
// relance une association toutes les 15 s sans figer la boucle (l'écran, les
// LEDs et le PZEM continuent de tourner). On utilise reconnect() (identifiants
// mémorisés) pour ne PAS écraser un réseau configuré via le portail.
void wifi_maintain() {
    static unsigned long lastTry = 0;
    if (WiFi.status() == WL_CONNECTED) return;
    if (lastTry != 0 && (millis() - lastTry) < 15000) return;
    lastTry = millis();
    Serial.println("📶 WiFi absent — nouvelle tentative en arrière-plan...");
    WiFi.reconnect();
}

void loop() {
    wifi_maintain();
    mqtt_loop();
    handle_leds();
    
    unsigned long now = millis();
    
    // On met à jour l'heure NTP seulement toutes les minutes
    // Cela évite que l'échec DNS (timeout de 15s) ne bloque la boucle
    // et ne provoque la déconnexion du client MQTT !
    // Synchro NTP en tâche de fond (toutes les 60s) — hors du chemin de publication.
    // On met à jour l'ancre glissante (lastGoodEpoch / millisAtSync) uniquement ici,
    // pour ne JAMAIS bloquer l'envoi MQTT avec une requête UDP potentiellement lente.
    static unsigned long lastNtpUpdate = 0;
    if (now - lastNtpUpdate >= 60000) {
        lastNtpUpdate = now;
        if (WiFi.status() == WL_CONNECTED && timeClient.update()) {
            unsigned long e = timeClient.getEpochTime();
            if (e > 1600000000) {
                lastGoodEpoch = e;
                millisAtSync = millis();
            }
        }
    }

    unsigned long currentInterval = mqtt_connected() ? PUBLISH_INTERVAL_MS : OFFLINE_INTERVAL_MS;

    if (now - lastPublishMs >= currentInterval) {
        lastPublishMs = now;
        SensorData data = read_sensor();
        if (data.valid) {
            // Timestamp glissant, non bloquant : ancre NTP + temps écoulé depuis la synchro.
            unsigned long epochToSend = 0;
            if (lastGoodEpoch > 0) {
                epochToSend = lastGoodEpoch + (millis() - millisAtSync) / 1000;
            }

            publish_telemetry(data, epochToSend);
            activityFlashUntil = millis() + 100; // Flash de 100ms
            
            if (lcdAvailable && lcd) {
                lcd->setCursor(0,0);
                lcd->print("U:"); lcd->print((int)data.voltage_v); lcd->print("V ");
                lcd->print("P:"); lcd->print((int)data.power_w); lcd->print("W   ");
                lcd->setCursor(0,1);
                lcd->print("E:"); lcd->print(data.energy_kwh, 3); lcd->print("kWh   ");
            }
        }
    }
}