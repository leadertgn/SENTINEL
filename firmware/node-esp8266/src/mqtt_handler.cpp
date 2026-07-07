#include <ESP8266WiFi.h>
#include <WiFiManager.h>
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

// ── Adresse du broker MQTT ────────────────────────────────────────
// Source UNIQUE = secrets.h (MQTT_BROKER). On a retiré la persistance en
// Flash : après un changement de réseau, elle rechargeait une ANCIENNE IP
// injoignable. Pour changer de broker : éditer secrets.h + reflasher.
static const char* mqttBroker = MQTT_BROKER;

// ─────────────────────────────────────────────────────────────────
//  Réseau — identifiants "domicile" d'abord, sinon portail captif AP
// ─────────────────────────────────────────────────────────────────
void net_begin() {
    // Purge d'une éventuelle ancienne config broker sauvegardée en Flash
    // (sinon elle écraserait l'IP de secrets.h et resterait injoignable).
    if (LittleFS.exists("/netcfg.json")) LittleFS.remove("/netcfg.json");

    // 1) Tentative rapide (8s) avec le réseau "domicile" de secrets.h
    WiFi.persistent(false); // ne pas écraser un réseau mémorisé par le portail
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    DBG.printf("📶 Essai WiFi domicile → %s ", WIFI_SSID);
    unsigned long t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 8000) { delay(250); DBG.print("."); }
    DBG.println();

    if (WiFi.status() != WL_CONNECTED) {
        // 2) Portail captif : choix du réseau WiFi (le broker reste celui de secrets.h)
        DBG.println("🛜 WiFi domicile indisponible — ouverture du portail de configuration.");
        WiFi.persistent(true);

        WiFiManager wm;
        wm.setDebugOutput(false);
        wm.setConfigPortalTimeout(180); // 3 min max, puis mode hors-ligne
        wm.setAPCallback([](WiFiManager* mgr) {
            net_on_portal_open(mgr->getConfigPortalSSID().c_str());
        });
        wm.autoConnect(WIFI_AP_SSID); // point d'accès OUVERT (sans mot de passe)
        WiFi.mode(WIFI_STA);
    }

    if (WiFi.status() == WL_CONNECTED)
        DBG.printf("✅ WiFi connecté — IP : %s\n", WiFi.localIP().toString().c_str());
    else
        DBG.println("⚠️ Pas de WiFi — mode hors-ligne (les mesures sont mises en file).");
}

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

    DBG.println("📤 Vidage de la file d'attente hors-ligne...");
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
    DBG.printf("✅ File d'attente vidée (%d messages envoyés).\n", count);
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
    net_begin(); // WiFi (domicile → portail AP) + chargement de l'IP broker

    s_mac = WiFi.macAddress();
    s_mac.replace(":", "");

    mqttClient.setServer(mqttBroker, MQTT_PORT);
    mqttClient.setCallback(onMqttMessage);
    mqttClient.setBufferSize(512);
}

// Reconnexion MQTT NON bloquante : une tentative espacée de MQTT_RECONNECT_MS,
// sans delay(), pour ne jamais figer la boucle si le broker est injoignable.
static unsigned long s_lastMqttAttempt = 0;

void mqtt_loop() {
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

    if (!mqttClient.connected()) {
        if (s_lastMqttAttempt == 0 || (millis() - s_lastMqttAttempt) >= MQTT_RECONNECT_MS) {
            s_lastMqttAttempt = millis();
            DBG.printf("🔌 Tentative connexion MQTT Node (%s)...\n", s_mac.c_str());

            String willTopic = "sbee/devices/" + s_mac + "/status";
            String willPayload = "{\"state\":\"OFFLINE\",\"mac_address\":\"" + s_mac + "\",\"secret_key\":\"" + String(DEVICE_SECRET) + "\"}";

            if (mqttClient.connect(s_mac.c_str(), "", "", willTopic.c_str(), 0, true, willPayload.c_str())) {
                DBG.println("✅ MQTT Connecté");

                // Annonce ONLINE (retenue) : SANS ce message, le backend ne voit
                // le Node « En ligne » qu'à la 1re trame /data. Or sur secteur, tant
                // qu'aucune charge/mesure valide n'est lue, aucune trame n'est
                // publiée → le Node resterait « Hors ligne » indéfiniment. On
                // s'annonce donc dès la connexion, comme le Master.
                String onlinePayload = "{\"state\":\"ONLINE\",\"role\":\"NODE\",\"mac_address\":\"" + s_mac +
                                       "\",\"is_active\":" + (s_relayState ? "true" : "false") +
                                       ",\"secret_key\":\"" + String(DEVICE_SECRET) + "\"}";
                mqttClient.publish(willTopic.c_str(), onlinePayload.c_str(), true);

                mqttClient.subscribe(("sbee/devices/" + s_mac + "/cmd").c_str());
                flush_queue(); // Vidage dès la connexion réussie
            }
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
            DBG.println("💾 [HORS-LIGNE] Sauvegarde en Flash (Node) réussie.");
        } else {
            DBG.println("❌ [ERREUR] Impossible d'écrire dans LittleFS.");
        }
        return;
    }

    // EN LIGNE : Envoi normal
    bool ok = mqttClient.publish(topic.c_str(), buffer);
    if (ok) {
        DBG.printf("📤 [MQTT] %s | P: %.1fW\n", topic.c_str(), data.power_w);
    } else {
        DBG.println("❌ Échec envoi MQTT");
    }
}
