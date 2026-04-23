#include <Arduino.h>
#include "config.h"
#include "pzem_reader.h"
#include "mqtt_handler.h"

static unsigned long lastPublishMs = 0;

void setup() {
    Serial.begin(115200);
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, RELAY_OFF);

    pzem_init();
    mqtt_setup();
    Serial.println("🛡️ SENTINEL NODE PRÊT");
}

void loop() {
    mqtt_loop();
    unsigned long now = millis();

    if (now - lastPublishMs >= PUBLISH_INTERVAL_MS) {
        lastPublishMs = now;
        
        // On passe l'état du relais pour la simulation cohérente
        SensorData data = read_sensor(get_relay_state());
        
        if (data.valid) {
            publish_telemetry(data);
        }
    }
}
