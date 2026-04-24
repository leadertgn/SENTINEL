#include <Arduino.h>
#include <LittleFS.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include "config.h"
#include "pzem_reader.h"
#include "mqtt_handler.h"

unsigned long lastPublishMs = 0;

WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 3600); // 3600 = GMT+1

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n🛡️ SENTINEL NODE STARTING...");

    if (!LittleFS.begin()) {
        Serial.println("❌ Erreur de montage LittleFS");
    } else {
        Serial.println("📂 LittleFS initialisé");
    }

    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, RELAY_OFF);

    pzem_init();
    mqtt_setup();
    timeClient.begin();
    
    Serial.println("✅ SYSTEME PRET");
}

void loop() {
    mqtt_loop();
    
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
        SensorData data = read_sensor(get_relay_state());
        if (data.valid) {
            publish_telemetry(data, timeClient.getEpochTime());
        }
    }
}
