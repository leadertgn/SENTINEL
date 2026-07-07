#include <Arduino.h>
#include <SoftwareSerial.h>
#include <PZEM004Tv30.h>
#include "pzem_reader.h"
#include "config.h"

#if !SIMULATION_MODE
  // PZEM sur SoftwareSerial (D5/D6) → l'UART0 (USB) reste libre pour le debug
  // au moniteur série du PC. Câblage direct (sans diviseur).
  SoftwareSerial pzemSWSerial(PZEM_RX_PIN, PZEM_TX_PIN);
  PZEM004Tv30 pzem(pzemSWSerial);
#endif

static float s_simEnergyKwh = 0.0f;
static unsigned long s_lastReadMs = 0;

void pzem_init() {
#if SIMULATION_MODE
    DBG.println("📊 [NODE] MODE SIMULATION ACTIVÉ");
    randomSeed(analogRead(0));
#else
    // PZEM déjà initialisé (UART0 à 9600 par le constructeur). Démarrage rapide :
    // le board de remplacement lit correctement, le scanner de diagnostic n'est
    // plus nécessaire (il retardait la 1ʳᵉ publication d'environ 9 s).
    DBG.println("📡 [NODE] PZEM prêt (SoftwareSerial D5/D6 — debug sur USB).");
    delay(200);
#endif
}

SensorData read_sensor(bool relayState) {
    SensorData data = {};
    unsigned long now = millis();

#if SIMULATION_MODE
    float dt_h = (s_lastReadMs == 0) ? 0.0f : (now - s_lastReadMs) / 3600000.0f;
    s_lastReadMs = now;

    float v = 220.0f + (float)random(-5, 6) / 10.0f; // Variation douce de la tension
    float p = relayState ? (1000.0f + (float)random(-10, 11)) : 0.0f; // Charge stable à ~1000W

    s_simEnergyKwh += (p / 1000.0f) * dt_h;

    data.valid           = true;
    data.voltage_v       = v;
    data.current_a       = (v > 0) ? p / v : 0;
    data.power_w         = p;
    data.energy_kwh      = s_simEnergyKwh;
    data.frequency_hz    = 50.0f;
    data.power_factor    = relayState ? 0.98f : 0.0f;

#else
    float v = pzem.voltage();
    if (isnan(v)) {
        data.valid = false;
        DBG.println("🔇 [PZEM Node] Aucune réponse (NaN) — vérifier câblage PZEM D5/D6 + alim 220V/5V.");
    } else {
        data.valid = true;
        data.voltage_v = v;
        data.current_a = pzem.current();
        data.power_w = pzem.power();
        data.energy_kwh = pzem.energy();
        data.frequency_hz = pzem.frequency();
        data.power_factor = pzem.pf();
        DBG.printf("📈 [PZEM Node] U=%.1fV  I=%.3fA  P=%.1fW  E=%.3fkWh  F=%.1fHz  PF=%.2f\n",
                   data.voltage_v, data.current_a, data.power_w,
                   data.energy_kwh, data.frequency_hz, data.power_factor);
    }
#endif
    return data;
}
