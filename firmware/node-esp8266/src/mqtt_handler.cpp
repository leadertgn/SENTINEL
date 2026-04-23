#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "mqtt_handler.h"
#include "config.h"

static WiFiClient espClient;
static PubSubClient mqttClient(espClient);
static String s_mac;
static bool s_relayState = false;

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    JsonDocument doc;
    deserializeJson(doc, payload, length);
    
    if (doc["action"].is<const char*>()) {
        String action = doc["action"];
        if (action == "ON") {
            s_relayState = true;
            digitalWrite(RELAY_PIN, RELAY_ON);
        } else if (action == "OFF") {
            s_relayState = false;
            digitalWrite(RELAY_PIN, RELAY_OFF);
        }
        
        JsonDocument res;
        res["mac_address"] = s_mac;
        res["secret_key"] = DEVICE_SECRET;
        res["is_active"] = s_relayState;
        res["state"] = "ONLINE";
        char buffer[128];
        serializeJson(res, buffer);
        mqttClient.publish(("sbee/devices/" + s_mac + "/status").c_str(), buffer);
    }
}

void mqtt_setup() {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) { delay(500); }
    
    s_mac = WiFi.macAddress();
    s_mac.replace(":", "");

    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setCallback(onMqttMessage);
}

void mqtt_loop() {
    if (!mqttClient.connected()) {
        Serial.printf("🔌 Tentative connexion MQTT Node (%s)...\n", s_mac.c_str());
        if (mqttClient.connect(s_mac.c_str())) {
            Serial.println("✅ MQTT Connecté");
            mqttClient.subscribe(("sbee/devices/" + s_mac + "/cmd").c_str());
        } else {
            delay(5000);
        }
    }
    mqttClient.loop();
}

bool get_relay_state() { return s_relayState; }

void publish_telemetry(const SensorData& data) {
    JsonDocument doc;
    doc["mac_address"] = s_mac;
    doc["secret_key"]  = DEVICE_SECRET;
    doc["role"]        = DEVICE_ROLE;
    doc["is_active"]   = s_relayState;
    doc["voltage_v"]   = data.voltage_v;
    doc["current_a"]   = data.current_a;
    doc["power_w"]     = data.power_w;
    doc["energy_kwh"]  = data.energy_kwh;
    doc["frequency_hz"]= data.frequency_hz;
    doc["pf"]          = data.power_factor;

    char buffer[512];
    serializeJson(doc, buffer);
    
    // CORRECTION DU TOPIC : Ajout du MAC pour matcher sbee/devices/+/data
    String topic = "sbee/devices/" + s_mac + "/data";
    bool ok = mqttClient.publish(topic.c_str(), buffer);
    
    if (ok) {
        Serial.printf("📤 [MQTT] %s | P: %.1fW\n", topic.c_str(), data.power_w);
    } else {
        Serial.println("❌ Échec envoi MQTT");
    }
}
