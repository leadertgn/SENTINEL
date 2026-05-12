#pragma once

// ================================================================
//  SENTINEL — Node Firmware — Configuration Principale
// ================================================================

#ifndef SIMULATION_MODE
  #define SIMULATION_MODE  true
#endif

#define DEVICE_ROLE          "NODE"

// ─── PZEM-004T — SoftwareSerial (ESP8266) ──────────────────────
#define PZEM_RX_PIN    14  // D5
#define PZEM_TX_PIN    12  // D6

// ─── Relais de Puissance ────────────────────────────────────────
#define RELAY_PIN      5   // D1
#define RELAY_ON       HIGH
#define RELAY_OFF      LOW

// ─── LEDs de Diagnostic ──────────────────────────────────────────
#define LED_NETWORK_PIN 13 // D7
#define LED_ACTIVITY_PIN 4  // D2

// ─── Intervalles ────────────────────────────────────────────────
#define PUBLISH_INTERVAL_MS   5000    
#define OFFLINE_INTERVAL_MS   60000   
#define MQTT_RECONNECT_MS     5000    
#define WIFI_MAX_RETRIES      20    

#include "secrets.h"
