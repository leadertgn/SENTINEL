#include "mqtt_handler.h"
#include "config.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ── Clients réseau (statiques = une seule instance) ───────────────
static WiFiClient   wifiClient;
static PubSubClient mqttClient(wifiClient);

// ── Identifiants dynamiques (générés depuis le MAC WiFi) ──────────
static String s_deviceMac;
static String s_topicData;
static String s_topicCmd;
static String s_topicStatus;

// ─────────────────────────────────────────────────────────────────
//  Callback — Messages MQTT entrants (commandes relais)
// ─────────────────────────────────────────────────────────────────
static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    String cmd = "";
    for (unsigned int i = 0; i < length; i++) cmd += (char)payload[i];

    Serial.printf("📩 [MQTT CMD] Topic: %s | Payload: %s\n", topic, cmd.c_str());

    // Le MASTER ne pilote pas de relais.
    // Cette règle est aussi garantie côté backend (HTTP 403).
    // On log et on ignore — comportement documenté et intentionnel.
    Serial.println("⛔ [MASTER] Commande relais ignorée : le maître ne coupe pas lui-même.");
}

// ─────────────────────────────────────────────────────────────────
//  WiFi — Connexion avec timeout et redémarrage ESP32 si échec
// ─────────────────────────────────────────────────────────────────
void wifi_connect() {
    Serial.printf("📶 Connexion WiFi → SSID : %s\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int retries = 0;
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
        retries++;
        if (retries >= WIFI_MAX_RETRIES) {
            Serial.println("\n❌ WiFi timeout — redémarrage ESP32...");
            ESP.restart();  // Redémarre proprement
        }
    }

    Serial.printf("\n✅ WiFi connecté — IP : %s\n", WiFi.localIP().toString().c_str());

    // ── Identifiant unique : adresse MAC WiFi ────────────────────
    // En LOCAL_MODE, on utilise un MAC fictif pour ne pas polluer la DB réelle
    // En PROD, on lit le vrai MAC hardware (immuable, gravé en ROM)
#if LOCAL_MODE
    s_deviceMac = DEVICE_MAC_LOCAL;
#else
    s_deviceMac = WiFi.macAddress();
    s_deviceMac.replace(":", "");  // "AA:BB:CC:DD:EE:FF" → "AABBCCDDEEFF"
#endif

    // Construction des topics MQTT depuis le MAC
    s_topicData   = "sbee/devices/" + s_deviceMac + "/data";
    s_topicCmd    = "sbee/devices/" + s_deviceMac + "/cmd";
    s_topicStatus = "sbee/devices/" + s_deviceMac + "/status";

    Serial.printf("🔖 Identifiant appareil : %s\n", s_deviceMac.c_str());
    Serial.printf("📡 Topics MQTT : %s\n", s_topicData.c_str());
}

// ─────────────────────────────────────────────────────────────────
//  MQTT — Connexion (et reconnexion automatique)
// ─────────────────────────────────────────────────────────────────
static void mqtt_connect() {
    while (!mqttClient.connected()) {
        Serial.printf("🔌 Connexion MQTT → %s:%d\n", MQTT_BROKER, MQTT_PORT);

        String clientId = "SENTINEL_MASTER_" + s_deviceMac;
        bool connected;

        // Auth MQTT (optionnel — configurable dans secrets.h)
        if (strlen(MQTT_USER) > 0) {
            connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
        } else {
            connected = mqttClient.connect(clientId.c_str());
        }

        if (connected) {
            Serial.println("✅ MQTT connecté !");

            // Publication du statut ONLINE (sécurisé)
            String statusPayload = "{\"state\":\"ONLINE\",\"role\":\"MASTER\",\"mac_address\":\"" + s_deviceMac + "\",\"secret_key\":\"" + String(DEVICE_SECRET) + "\"}";
            mqttClient.publish(s_topicStatus.c_str(), statusPayload.c_str(), true);  // retain=true

            // Abonnement aux commandes (ignorées par le Master, mais on écoute quand même)
            mqttClient.subscribe(s_topicCmd.c_str());
            Serial.printf("📬 Abonné à : %s\n", s_topicCmd.c_str());
        } else {
            Serial.printf("❌ Échec MQTT (code: %d) — nouvelle tentative dans %dms\n",
                          mqttClient.state(), MQTT_RECONNECT_MS);
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
    mqttClient.setBufferSize(512);  // Augmenter si payload > 256 bytes
    mqtt_connect();
}

void mqtt_loop() {
    if (!mqttClient.connected()) {
        Serial.println("⚠️  MQTT déconnecté — tentative de reconnexion...");
        mqtt_connect();
    }
    mqttClient.loop();
}

void publish_telemetry(const SensorData& data) {
    if (!mqttClient.connected()) {
        Serial.println("⚠️  Envoi ignoré : MQTT non connecté");
        return;
    }

    // ── Construction du payload JSON ──────────────────────────────
    // Contrat strict avec le backend SENTINEL (mqtt_client.py)
    // Champs attendus : mac_address, role, voltage_v, current_a,
    //                   power_w, energy_kwh, frequency_hz, power_factor
    // Champ additionnel : energy_delta_wh (ignoré par le backend actuel,
    //                     utile pour les évolutions V2)
    JsonDocument doc;
    doc["mac_address"]      = s_deviceMac;
    doc["secret_key"]       = DEVICE_SECRET;
    doc["role"]             = DEVICE_ROLE;
    doc["voltage_v"]        = round(data.voltage_v    * 10)   / 10.0;  // 1 décimale
    doc["current_a"]        = round(data.current_a    * 1000) / 1000.0;// 3 décimales
    doc["power_w"]          = round(data.power_w      * 10)   / 10.0;  // 1 décimale
    doc["energy_kwh"]       = round(data.energy_kwh   * 10000)/ 10000.0;// 4 décimales
    doc["frequency_hz"]     = round(data.frequency_hz * 100)  / 100.0; // 2 décimales
    doc["pf"]               = round(data.power_factor  * 100) / 100.0; // 2 décimales

    char payload[512];
    serializeJson(doc, payload, sizeof(payload));

    bool ok = mqttClient.publish(s_topicData.c_str(), payload);
    if (ok) {
        Serial.printf("📤 [MQTT] %s\n    └→ %s\n", s_topicData.c_str(), payload);
    } else {
        Serial.println("❌ [MQTT] Échec de publication — vérifier taille buffer");
    }
}
