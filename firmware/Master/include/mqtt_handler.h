#pragma once
#include <Arduino.h>
#include "pzem_reader.h"

// ================================================================
//  SENTINEL — MQTT Handler
//  Gère : connexion WiFi, connexion MQTT, réception commandes,
//          publication du payload JSON.
// ================================================================

// Connecte au WiFi (avec timeout et redémarrage si échec)
void wifi_connect();

// Configure le client MQTT et établit la première connexion
void mqtt_setup();

// À appeler dans loop() — maintient la connexion MQTT active
// et traite les messages entrants (commandes relais)
void mqtt_loop();

// Vérifie si le client MQTT est connecté
bool mqtt_connected();

// Sérialise les données en JSON et publie sur le topic MQTT
void publish_telemetry(const SensorData& data, unsigned long timestamp);
