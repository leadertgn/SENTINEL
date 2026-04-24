#include <Arduino.h>
#include <SoftwareSerial.h>
#include <PZEM004Tv30.h>
#include "pzem_reader.h"
#include "config.h"

#if !SIMULATION_MODE
  SoftwareSerial pzemSWSerial(PZEM_RX_PIN, PZEM_TX_PIN);
  PZEM004Tv30 pzem(pzemSWSerial);
#endif

static float s_simEnergyKwh = 0.0f;
static unsigned long s_lastReadMs = 0;

void pzem_init() {
#if SIMULATION_MODE
    Serial.println("📊 [NODE] MODE SIMULATION ACTIVÉ");
    randomSeed(analogRead(0));
#else
    Serial.println("📡 [NODE] Initialisation PZEM SoftwareSerial...");
    delay(1000);
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
    } else {
        data.valid = true;
        data.voltage_v = v;
        data.current_a = pzem.current();
        data.power_w = pzem.power();
        data.energy_kwh = pzem.energy();
        data.frequency_hz = pzem.frequency();
        data.power_factor = pzem.pf();
    }
#endif
    return data;
}
