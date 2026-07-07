#pragma once

// ================================================================
//  SENTINEL — Node Firmware — Configuration Principale
// ================================================================

#ifndef SIMULATION_MODE
  #define SIMULATION_MODE  true
#endif

#define DEVICE_ROLE          "NODE"

// ─── Port de DEBUG ───────────────────────────────────────────────
// Le PZEM est sur SoftwareSerial (D5/D6) → l'UART0 (USB) est LIBRE : tout le
// debug part sur le moniteur série du PC (Serial), en simulation comme en réel.
#define DBG Serial

// ─── PZEM-004T — SoftwareSerial (ESP8266) ──────────────────────
// Sur ce board (sain), SoftwareSerial fonctionne et libère l'UART0 pour le
// debug USB (et le flash ne nécessite plus de débrancher aucun fil).
// Câblage DIRECT, sans diviseur : module-TX → D5 ; module-RX → D6.
#define PZEM_RX_PIN    14  // D5  (entrée ESP  ← TX du module)
#define PZEM_TX_PIN    12  // D6  (sortie ESP → RX du module)

// ─── Relais de Puissance ────────────────────────────────────────
#define RELAY_PIN      5   // D1
#define RELAY_ON       HIGH
#define RELAY_OFF      LOW

// ─── LEDs de Diagnostic ──────────────────────────────────────────
#define LED_NETWORK_PIN 16 // D0
#define LED_ACTIVITY_PIN 13 // D7

// ─── Intervalles ────────────────────────────────────────────────
#define PUBLISH_INTERVAL_MS   30000    
#define OFFLINE_INTERVAL_MS   60000   
#define MQTT_RECONNECT_MS     5000    
#define WIFI_MAX_RETRIES      20    

// ─── Portail de configuration WiFi (mode AP de secours) ──────────
// Point d'accès OUVERT (sans mot de passe) si le WiFi "domicile" est
// indisponible : on s'y connecte au téléphone pour choisir le réseau +
// l'IP du broker, sauvegardés en Flash pour les prochains démarrages.
#define WIFI_AP_SSID      "SENTINEL-Node-Setup"
#define WIFI_AP_PASSWORD  "sentinel2026"  // (non utilisé : le point d'accès est ouvert)

#include "secrets.h"
