#include "mqtt_handler.h"
#include "config.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>

// ── Clients réseau (statiques = une seule instance) ───────────────
static WiFiClient   wifiClient;
static PubSubClient mqttClient(wifiClient);

// ── Identifiants dynamiques (générés depuis le MAC WiFi) ──────────
static String s_deviceMac;
static String s_topicData;
static String s_topicCmd;
static String s_topicStatus;

bool mqtt_connected() {
    return mqttClient.connected();
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
            mqttClient.publish(s_topicData.c_str(), line.c_str());
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

// ─────────────────────────────────────────────────────────────────
//  Callback — Messages MQTT entrants (commandes relais)
// ─────────────────────────────────────────────────────────────────
static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    String cmd = "";
    for (unsigned int i = 0; i < length; i++) cmd += (char)payload[i];
    Serial.printf("📩 [MQTT CMD] Topic: %s | Payload: %s\n", topic, cmd.c_str());
    Serial.println("⛔ [MASTER] Commande relais ignorée : le maître ne coupe pas lui-même.");
}

// ─────────────────────────────────────────────────────────────────
//  WiFi — Connexion avec timeout et redémarrage ESP32 si échec
// ─────────────────────────────────────────────────────────────────
void wifi_connect() {
    Serial.printf("📶 Connexion WiFi → SSID : %s\n", WIFI_SSID);
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
            break; // On ne redémarre plus, on passe en mode hors-ligne
        }
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n✅ WiFi connecté — IP : %s\n", WiFi.localIP().toString().c_str());
    }

#if LOCAL_MODE
    s_deviceMac = DEVICE_MAC_LOCAL;
#else
    s_deviceMac = WiFi.macAddress();
    s_deviceMac.replace(":", "");
#endif

    s_topicData   = "sbee/devices/" + s_deviceMac + "/data";
    s_topicCmd    = "sbee/devices/" + s_deviceMac + "/cmd";
    s_topicStatus = "sbee/devices/" + s_deviceMac + "/status";
}

// ─────────────────────────────────────────────────────────────────
//  MQTT — Connexion (et reconnexion automatique)
// ─────────────────────────────────────────────────────────────────
static void mqtt_connect() {
    if (WiFi.status() != WL_CONNECTED) return; // Pas de WiFi = Pas de MQTT

    while (!mqttClient.connected() && WiFi.status() == WL_CONNECTED) {
        Serial.printf("🔌 Connexion MQTT → %s:%d\n", MQTT_BROKER, MQTT_PORT);
        String clientId = "SENTINEL_MASTER_" + s_deviceMac;
        String willPayload = "{\"state\":\"OFFLINE\",\"mac_address\":\"" + s_deviceMac + "\",\"secret_key\":\"" + String(DEVICE_SECRET) + "\"}";
        bool connected = false;

        if (strlen(MQTT_USER) > 0) {
            connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS, s_topicStatus.c_str(), 0, true, willPayload.c_str());
        } else {
            connected = mqttClient.connect(clientId.c_str(), "", "", s_topicStatus.c_str(), 0, true, willPayload.c_str());
        }

        if (connected) {
            Serial.println("✅ MQTT connecté !");
            String statusPayload = "{\"state\":\"ONLINE\",\"role\":\"MASTER\",\"mac_address\":\"" + s_deviceMac + "\",\"secret_key\":\"" + String(DEVICE_SECRET) + "\"}";
            mqttClient.publish(s_topicStatus.c_str(), statusPayload.c_str(), true);
            mqttClient.subscribe(s_topicCmd.c_str());
            
            // Vidage de la file d'attente (si données hors-ligne)
            flush_queue();
        } else {
            Serial.printf("❌ Échec MQTT (code: %d) — nouvelle tentative dans %dms\n", mqttClient.state(), MQTT_RECONNECT_MS);
            delay(MQTT_RECONNECT_MS);
        }
    }
}

// ─────────────────────────────────────────────────────────────────
//  API publique
// ─────────────────────────────────────────────────────────────────
void mqtt_setup() {
    wifi_connect();
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setCallback(onMqttMessage);
    mqttClient.setBufferSize(512);
    if (WiFi.status() == WL_CONNECTED) mqtt_connect();
}

void mqtt_loop() {
    if (WiFi.status() != WL_CONNECTED) {
        return; // Hors-ligne, auto-reconnect géré en tâche de fond
    }
    if (!mqttClient.connected()) {
        mqtt_connect();
    }
    mqttClient.loop();
}

void publish_telemetry(const SensorData& data, unsigned long timestamp) {
    JsonDocument doc;
    doc["mac_address"]      = s_deviceMac;
    doc["secret_key"]       = DEVICE_SECRET;
    doc["role"]             = DEVICE_ROLE;
    doc["timestamp"]        = timestamp; // Ajout de l'heure
    doc["voltage_v"]        = round(data.voltage_v    * 10)   / 10.0;
    doc["current_a"]        = round(data.current_a    * 1000) / 1000.0;
    doc["power_w"]          = round(data.power_w      * 10)   / 10.0;
    doc["energy_kwh"]       = round(data.energy_kwh   * 10000)/ 10000.0;
    doc["frequency_hz"]     = round(data.frequency_hz * 100)  / 100.0;
    doc["pf"]               = round(data.power_factor * 100)  / 100.0;

    char payload[512];
    serializeJson(doc, payload, sizeof(payload));

    if (!mqttClient.connected()) {
        // HORS-LIGNE : Sauvegarde dans LittleFS
        if (!LittleFS.exists("/queue.jsonl")) {
            File initFile = LittleFS.open("/queue.jsonl", FILE_WRITE);
            if (initFile) initFile.close();
        }
        File file = LittleFS.open("/queue.jsonl", FILE_APPEND);
        if (file) {
            file.println(payload);
            file.close();
            Serial.println("💾 [HORS-LIGNE] Sauvegarde en Flash réussie.");
        } else {
            Serial.println("❌ [ERREUR] Impossible d'écrire dans LittleFS.");
        }
        return;
    }

    // EN LIGNE : Envoi normal
    bool ok = mqttClient.publish(s_topicData.c_str(), payload);
    if (ok) {
        Serial.printf("📤 [MQTT] %s\n    └→ %s\n", s_topicData.c_str(), payload);
    } else {
        Serial.println("❌ [MQTT] Échec de publication");
    }
}
