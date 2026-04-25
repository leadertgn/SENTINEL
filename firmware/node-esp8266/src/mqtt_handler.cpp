#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include "mqtt_handler.h"
#include "config.h"

static WiFiClient espClient;
static PubSubClient mqttClient(espClient);
static String s_mac;
static bool s_relayState = false;
extern unsigned long lastPublishMs; // Expose la variable de main.cpp

bool mqtt_connected() {
    return mqttClient.connected();
}

bool get_relay_state() { 
    return s_relayState; 
}

// ─────────────────────────────────────────────────────────────────
//  Vidage de la file d'attente hors-ligne (LittleFS)
// ─────────────────────────────────────────────────────────────────
void flush_queue() {
    if (!LittleFS.exists("/queue.jsonl")) return;
    
    File file = LittleFS.open("/queue.jsonl", "r");
    if (!file) return;

    Serial.println("📤 Vidage de la file d'attente hors-ligne...");
    int count = 0;
    
    // On bloque le flux normal pour vider la mémoire
    while(file.available()) {
        String line = file.readStringUntil('\n');
        line.trim();
        if (line.length() > 5) {
            mqttClient.publish(("sbee/devices/" + s_mac + "/data").c_str(), line.c_str());
            delay(10); // Petit délai pour laisser respirer le broker
            mqttClient.loop();
            yield(); // Reset du Watchdog Timer
            count++;
        }
    }
    file.close();
    LittleFS.remove("/queue.jsonl");
    Serial.printf("✅ File d'attente vidée (%d messages envoyés).\n", count);
}

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
        
        // Force la boucle principale à publier la nouvelle télémétrie immédiatement
        // Cela supprime la latence de 3 à 6 secondes perçue sur l'interface !
        lastPublishMs = 0; 
    }
}

void mqtt_setup() {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    int retries = 0;
    while (WiFi.status() != WL_CONNECTED) { 
        delay(500); 
        Serial.print(".");
        retries++;
        if (retries >= WIFI_MAX_RETRIES) {
            Serial.println("\n❌ WiFi timeout — mode hors-ligne activé...");
            break; // Mode hors-ligne
        }
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n✅ WiFi connecté — IP : %s\n", WiFi.localIP().toString().c_str());
    }
    
    s_mac = WiFi.macAddress();
    s_mac.replace(":", "");

    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setCallback(onMqttMessage);
    mqttClient.setBufferSize(512);
}

void mqtt_loop() {
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

    if (!mqttClient.connected()) {
        Serial.printf("🔌 Tentative connexion MQTT Node (%s)...\n", s_mac.c_str());
        
        String willTopic = "sbee/devices/" + s_mac + "/status";
        String willPayload = "{\"state\":\"OFFLINE\",\"mac_address\":\"" + s_mac + "\",\"secret_key\":\"" + String(DEVICE_SECRET) + "\"}";
        
        if (mqttClient.connect(s_mac.c_str(), "", "", willTopic.c_str(), 0, true, willPayload.c_str())) {
            Serial.println("✅ MQTT Connecté");
            mqttClient.subscribe(("sbee/devices/" + s_mac + "/cmd").c_str());
            flush_queue(); // Vidage dès la connexion réussie
        } else {
            delay(5000);
        }
    }
    mqttClient.loop();
}

void publish_telemetry(const SensorData& data, unsigned long timestamp) {
    // ── Construction du payload JSON ──────────────────────────────
    // Contrat strict avec le backend SENTINEL (mqtt_client.py)
    // Champs attendus : mac_address, secret_key, role, is_active, timestamp,
    //                   voltage_v, current_a, power_w, energy_kwh, frequency_hz, pf
    // Le calcul du delta d'énergie (energy_delta_wh) est directement délégué
    // au Backend pour soulager la mémoire RAM limitée de l'ESP8266.
    JsonDocument doc;
    doc["mac_address"] = s_mac;
    doc["secret_key"]  = DEVICE_SECRET;
    doc["role"]        = DEVICE_ROLE;
    doc["is_active"]   = s_relayState;
    doc["timestamp"]   = timestamp;
    doc["voltage_v"]   = data.voltage_v;
    doc["current_a"]   = data.current_a;
    doc["power_w"]     = data.power_w;
    doc["energy_kwh"]  = data.energy_kwh;
    doc["frequency_hz"]= data.frequency_hz;
    doc["pf"]          = data.power_factor;

    char buffer[512];
    serializeJson(doc, buffer);
    
    String topic = "sbee/devices/" + s_mac + "/data";
    
    if (!mqttClient.connected()) {
        // HORS-LIGNE : Sauvegarde dans LittleFS
        // Note: Sur ESP8266, le mode d'ajout est "a" et non FILE_APPEND
        File file = LittleFS.open("/queue.jsonl", "a");
        if (file) {
            file.println(buffer);
            file.close();
            Serial.println("💾 [HORS-LIGNE] Sauvegarde en Flash (Node) réussie.");
        } else {
            Serial.println("❌ [ERREUR] Impossible d'écrire dans LittleFS.");
        }
        return;
    }

    // EN LIGNE : Envoi normal
    bool ok = mqttClient.publish(topic.c_str(), buffer);
    if (ok) {
        Serial.printf("📤 [MQTT] %s | P: %.1fW\n", topic.c_str(), data.power_w);
    } else {
        Serial.println("❌ Échec envoi MQTT");
    }
}
