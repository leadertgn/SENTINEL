#include "mqtt_handler.h"
#include "config.h"
#include <WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>

// ── Clients réseau (statiques = une seule instance) ───────────────
static WiFiClient   wifiClient;
static PubSubClient mqttClient(wifiClient);

// ── Adresse du broker MQTT en RUNTIME ─────────────────────────────
// Valeur par défaut = celle de secrets.h, mais écrasable depuis le
// portail de configuration (champ dédié) et persistée dans LittleFS.
// Fini le reflash quand l'IP du PC change (ex: 192.168.100.12 → .58).
static char mqttBroker[40] = MQTT_BROKER;

static void load_net_config() {
    if (!LittleFS.exists("/netcfg.json")) return;
    File f = LittleFS.open("/netcfg.json", "r");
    if (!f) return;
    JsonDocument doc;
    if (deserializeJson(doc, f) == DeserializationError::Ok) {
        const char* b = doc["broker"] | "";
        if (strlen(b) > 6) {
            strncpy(mqttBroker, b, sizeof(mqttBroker) - 1);
            mqttBroker[sizeof(mqttBroker) - 1] = '\0';
            Serial.printf("🗄️ Broker chargé depuis la Flash : %s\n", mqttBroker);
        }
    }
    f.close();
}

static void save_net_config() {
    File f = LittleFS.open("/netcfg.json", "w");
    if (!f) return;
    JsonDocument doc;
    doc["broker"] = mqttBroker;
    serializeJson(doc, f);
    f.close();
}

static bool s_shouldSave = false;

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
//  Réseau — identifiants "domicile" d'abord, sinon portail captif AP
// ─────────────────────────────────────────────────────────────────
// 1) Essai rapide (8s) des identifiants connus de secrets.h (NON persistés,
//    pour ne pas écraser un réseau configuré sur place lors d'une démo).
// 2) Échec → WiFiManager : identifiants déjà sauvegardés puis, à défaut,
//    ouverture d'un point d'accès listant les réseaux + un champ « IP broker ».
// 3) Le choix (réseau + broker) est mémorisé en Flash pour les prochains boots.
// Ne redémarre jamais l'ESP : au pire, mode hors-ligne (file d'attente Flash).
void net_begin() {
    load_net_config();

    // 1) Tentative rapide avec le réseau "domicile" (identifiants de secrets.h)
    WiFi.persistent(false); // ne pas écraser un réseau mémorisé par le portail
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.printf("📶 Essai WiFi domicile → %s ", WIFI_SSID);
    unsigned long t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 8000) { delay(250); Serial.print("."); }
    Serial.println();

    if (WiFi.status() != WL_CONNECTED) {
        // 2) Portail captif : réseaux à proximité + champ IP du broker
        Serial.println("🛜 WiFi domicile indisponible — ouverture du portail de configuration.");
        WiFi.persistent(true); // le réseau choisi ici doit survivre au redémarrage

        WiFiManager wm;
        wm.setConfigPortalTimeout(180); // 3 min max, puis on continue hors-ligne
        wm.setAPCallback([](WiFiManager* mgr) {
            net_on_portal_open(mgr->getConfigPortalSSID().c_str());
        });
        wm.setSaveConfigCallback([]() { s_shouldSave = true; });

        WiFiManagerParameter p_broker("broker", "IP du broker MQTT (PC hote)", mqttBroker, sizeof(mqttBroker) - 1);
        wm.addParameter(&p_broker);

        wm.autoConnect(WIFI_AP_SSID, WIFI_AP_PASSWORD);

        if (s_shouldSave) {
            strncpy(mqttBroker, p_broker.getValue(), sizeof(mqttBroker) - 1);
            mqttBroker[sizeof(mqttBroker) - 1] = '\0';
            save_net_config();
            Serial.printf("💾 Broker MQTT enregistré : %s\n", mqttBroker);
        }
        WiFi.mode(WIFI_STA); // sortie propre du mode AP
    }

    if (WiFi.status() == WL_CONNECTED)
        Serial.printf("✅ WiFi connecté — IP : %s\n", WiFi.localIP().toString().c_str());
    else
        Serial.println("⚠️ Pas de WiFi — mode hors-ligne (les mesures sont mises en file).");

    s_deviceMac = WiFi.macAddress();
    s_deviceMac.replace(":", "");

    s_topicData   = "sbee/devices/" + s_deviceMac + "/data";
    s_topicCmd    = "sbee/devices/" + s_deviceMac + "/cmd";
    s_topicStatus = "sbee/devices/" + s_deviceMac + "/status";
}

// ─────────────────────────────────────────────────────────────────
//  MQTT — Connexion (et reconnexion automatique)
// ─────────────────────────────────────────────────────────────────
// Tentative de connexion MQTT NON bloquante : une seule tentative, espacée de
// MQTT_RECONNECT_MS. Ne bloque JAMAIS setup() ni loop() même si le broker est
// injoignable — l'écran LCD, les LEDs et la boucle continuent de tourner.
static unsigned long s_lastMqttAttempt = 0;

static void mqtt_try_connect() {
    if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) return;
    // Espacement des tentatives (sans delay bloquant)
    if (s_lastMqttAttempt != 0 && (millis() - s_lastMqttAttempt) < MQTT_RECONNECT_MS) return;
    s_lastMqttAttempt = millis();

    Serial.printf("🔌 Connexion MQTT → %s:%d\n", mqttBroker, MQTT_PORT);
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
    }
}

// ─────────────────────────────────────────────────────────────────
//  API publique
// ─────────────────────────────────────────────────────────────────
void mqtt_setup() {
    net_begin(); // WiFi (domicile → portail AP) + chargement de l'IP broker
    mqttClient.setServer(mqttBroker, MQTT_PORT);
    mqttClient.setCallback(onMqttMessage);
    mqttClient.setBufferSize(512);
    mqtt_try_connect(); // 1 tentative non bloquante — setup() se termine toujours
}

void mqtt_loop() {
    if (WiFi.status() != WL_CONNECTED) {
        return; // Hors-ligne, auto-reconnect géré en tâche de fond
    }
    if (!mqttClient.connected()) {
        mqtt_try_connect(); // reconnexion non bloquante
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
