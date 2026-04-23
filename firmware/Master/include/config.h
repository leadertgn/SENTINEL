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
#define LCD_ADDR       0x27
#define LCD_COLS       16
#define LCD_ROWS       2

// ─── Intervalles de temps ────────────────────────────────────────
#define PUBLISH_INTERVAL_MS   5000    
#define MQTT_RECONNECT_MS     5000    
#define WIFI_MAX_RETRIES      20      

// ─── Secrets (WiFi, MQTT, clé IoT) ───────────────────────────────
#include "secrets.h"
