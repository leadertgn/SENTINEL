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

LiquidCrystal_I2C lcd(0x27, 16, 2);
static unsigned long lastPublishMs = 0;
bool lcdAvailable = false;
unsigned long activityFlashUntil = 0;

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

    // Test I2C pour le LCD
    Wire.begin(21, 22);
    Wire.beginTransmission(0x27);
    if (Wire.endTransmission() == 0) {
        Serial.println("📺 LCD Détecté sur 0x27");
        lcdAvailable = true;
        lcd.init();
        lcd.backlight();
        lcd.print("SENTINEL INIT...");
    } else {
        Serial.println("⚠️ LCD non détecté (Vérifier câblage/adresse)");
    }

    pzem_init();
    mqtt_setup();
    timeClient.begin();
    
    if (lcdAvailable) {
        lcd.clear();
        lcd.print("SYSTEME PRET");
    }
}

void loop() {
    mqtt_loop();
    handle_leds();
    
    unsigned long now = millis();
    
    // On met à jour l'heure NTP seulement toutes les minutes
    // Cela évite que l'échec DNS (timeout de 15s) ne bloque la boucle
    // et ne provoque la déconnexion du client MQTT !
    static unsigned long lastNtpUpdate = 0;
    if (now - lastNtpUpdate >= 60000) {
        lastNtpUpdate = now;
        timeClient.update();
    }
    
    unsigned long currentInterval = mqtt_connected() ? PUBLISH_INTERVAL_MS : OFFLINE_INTERVAL_MS;

    if (now - lastPublishMs >= currentInterval) {
        lastPublishMs = now;
        SensorData data = read_sensor();
        if (data.valid) {
            publish_telemetry(data, timeClient.getEpochTime());
            activityFlashUntil = millis() + 100; // Flash de 100ms
            
            if (lcdAvailable) {
                lcd.setCursor(0,0);
                lcd.print("U:"); lcd.print((int)data.voltage_v); lcd.print("V ");
                lcd.print("P:"); lcd.print((int)data.power_w); lcd.print("W   ");
                lcd.setCursor(0,1);
                lcd.print("E:"); lcd.print(data.energy_kwh, 3); lcd.print("kWh");
            }
        }
    }
}