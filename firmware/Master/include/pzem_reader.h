#pragma once
#include <Arduino.h>

// ================================================================
//  SENTINEL — PZEM Reader
//
//  En LOCAL_MODE  : génère des données simulées réalistes
//  En mode PROD   : lit les métriques depuis le PZEM-004T via UART
//
//  Logique Delta (méthode de soustraction successive) :
//    Le PZEM renvoie un CUMUL croissant (comme un compteur d'eau).
//    On stocke l'index précédent et on calcule :
//      delta_wh = (energy_actuelle - energy_precedente) × 1000
//    → Permet de connaître la conso exacte de chaque intervalle.
//    → Si l'ESP32 perd le WiFi, le delta à la reconnexion couvre
//      toute la période de déconnexion. Rien n'est perdu.
// ================================================================

// Structure de données lues (identique au contrat JSON du backend)
struct SensorData {
    bool  valid;              // false si la lecture PZEM a échoué (NaN)
    float voltage_v;          // Tension (V)
    float current_a;          // Courant (A)
    float power_w;            // Puissance active (W)
    float energy_kwh;         // INDEX CUMULATIF (kWh) — stocké tel quel en DB
    float energy_delta_wh;    // Conso depuis dernière lecture (Wh) — info complémentaire
    float frequency_hz;       // Fréquence réseau (Hz)
    float power_factor;       // Facteur de puissance cos φ (sans unité)
};

// Initialise le PZEM (mode PROD) ou le générateur de sim (mode LOCAL)
void pzem_init();

// Lit les données — retourne une SensorData avec valid=false si erreur
SensorData read_sensor();
