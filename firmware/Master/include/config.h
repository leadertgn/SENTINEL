#pragma once

// ================================================================
//  SENTINEL — Master Firmware — Configuration Principale
// ================================================================

#ifndef SIMULATION_MODE
  #define SIMULATION_MODE  true   // Défini aussi dans platformio.ini
#endif

// ─── Identité de l'appareil ──────────────────────────────────────
#define DEVICE_ROLE          "MASTER"
#define DEVICE_MAC_SIM       "AABBCCDD0001"

// ─── PZEM-004T — Broches UART (ESP32 HardwareSerial 2) ──────────
#define PZEM_RX_PIN    16
#define PZEM_TX_PIN    17

// ─── LCD 16x2 I2C ────────────────────────────────────────────────
// Deux adresses possibles selon la puce du backpack :
//   0x27 = PCF8574   |   0x3F = PCF8574A
// Le firmware scanne le bus et choisit automatiquement celle présente.
#define LCD_ADDR       0x27
#define LCD_ADDR_ALT   0x3F
#define LCD_COLS       16
#define LCD_ROWS       2

// Broches I2C (partagées LCD + éventuels périphériques)
#define I2C_SDA_PIN    21
#define I2C_SCL_PIN    22

// ─── LEDs de Diagnostic ──────────────────────────────────────────
#define LED_NETWORK_PIN 2
#define LED_ACTIVITY_PIN 4

// ─── Intervalles de temps ────────────────────────────────────────
#define PUBLISH_INTERVAL_MS   30000    
#define OFFLINE_INTERVAL_MS   60000   // 60s pour soulager la Flash en hors-ligne
#define MQTT_RECONNECT_MS     5000    
#define WIFI_MAX_RETRIES      20      

// ─── Portail de configuration WiFi (mode AP de secours) ──────────
// Si le WiFi "domicile" est indisponible, l'ESP ouvre un point d'accès
// portant ce nom : on s'y connecte au téléphone pour choisir le réseau
// et saisir l'IP du broker. Le choix est sauvegardé en Flash (LittleFS).
#define WIFI_AP_SSID      "SENTINEL-Master-Setup"
#define WIFI_AP_PASSWORD  "sentinel2026"

// ─── Secrets (WiFi, MQTT, clé IoT) ───────────────────────────────
#include "secrets.h"
