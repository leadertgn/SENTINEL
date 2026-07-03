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
    
    Serial.println("✅ SYSTEME PRET");
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
        if (WiFi.status() == WL_CONNECTED) {
            timeClient.update();
        }
    }

    unsigned long currentInterval = mqtt_connected() ? PUBLISH_INTERVAL_MS : OFFLINE_INTERVAL_MS;

    if (now - lastPublishMs >= currentInterval) {
        lastPublishMs = now;
        SensorData data = read_sensor(get_relay_state());
        if (data.valid) {
            unsigned long epochToSend = 0;
            if (mqtt_connected()) {
                timeClient.update(); // Mettre à jour l'heure juste avant l'envoi
                unsigned long currentEpoch = timeClient.getEpochTime();
                if (currentEpoch > 1600000000) {
                    lastGoodEpoch = currentEpoch;
                    millisAtSync = millis();
                }
            }

            if (lastGoodEpoch > 0) {
                epochToSend = lastGoodEpoch + (millis() - millisAtSync) / 1000;
            }

            publish_telemetry(data, epochToSend);
            activityFlashUntil = millis() + 100; // Flash de 100ms
        }
    }
}
