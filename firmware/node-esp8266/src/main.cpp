#include <Arduino.h>
#include <LittleFS.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include "config.h"
#include "pzem_reader.h"
#include "mqtt_handler.h"
#include <ESP8266WiFi.h>

unsigned long lastPublishMs = 0;
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

static unsigned long lastGoodEpoch = 0;
static unsigned long millisAtSync = 0;

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n🛡️ SENTINEL NODE STARTING...");

    if (!LittleFS.begin()) {
        Serial.println("❌ Erreur de montage LittleFS");
    } else {
        Serial.println("📂 LittleFS initialisé");
    }

    pinMode(LED_NETWORK_PIN, OUTPUT);
    pinMode(LED_ACTIVITY_PIN, OUTPUT);

    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, RELAY_OFF);

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

    Serial.println("✅ SYSTEME PRET");
}

// Affiché quand le portail de configuration WiFi s'ouvre (le Node n'a pas de LCD,
// on se contente du moniteur série).
void net_on_portal_open(const char* apName) {
    Serial.printf("🛜 Portail WiFi ouvert — connectez-vous au réseau : %s (mdp: %s)\n",
                  apName, WIFI_AP_PASSWORD);
}

// Reconnexion WiFi en arrière-plan (NON bloquante) : si la liaison tombe ou
// n'a jamais abouti, on relance une association toutes les 15 s sans figer la
// boucle. reconnect() réutilise les identifiants mémorisés (domicile ou portail)
// sans les écraser.
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
        SensorData data = read_sensor(get_relay_state());
        if (data.valid) {
            // Timestamp glissant, non bloquant : ancre NTP + temps écoulé depuis la synchro.
            unsigned long epochToSend = 0;
            if (lastGoodEpoch > 0) {
                epochToSend = lastGoodEpoch + (millis() - millisAtSync) / 1000;
            }

            publish_telemetry(data, epochToSend);
            activityFlashUntil = millis() + 100; // Flash de 100ms
        }
    }
}
