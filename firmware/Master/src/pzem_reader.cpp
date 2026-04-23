#include "pzem_reader.h"
#include "config.h"

#if !SIMULATION_MODE
  #include <PZEM004Tv30.h>
  HardwareSerial pzemSerial(2);
  PZEM004Tv30 pzem(pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN);
#endif

static float s_simEnergyKwh = 0.0f;
static unsigned long s_lastReadMs = 0;

void pzem_init() {
#if SIMULATION_MODE
    Serial.println("📊 [PZEM] MODE SIMULATION ACTIVÉ");
    randomSeed(analogRead(0));
#else
    Serial.println("📡 [PZEM] Initialisation PZEM-004T (UART2)...");
    delay(1000);
#endif
}

SensorData read_sensor() {
    SensorData data = {};
    unsigned long now = millis();

#if SIMULATION_MODE
    float dt_h = (s_lastReadMs == 0) ? 0.0f : (now - s_lastReadMs) / 3600000.0f;
    s_lastReadMs = now;

    float sim_voltage = 220.0f + (float)random(-10, 11) / 10.0f;
    float sim_power   = 200.0f + (float)random(0, 501); 
    float sim_pf      = 0.95f  + (float)random(-5, 5) / 100.0f;
    float sim_freq    = 50.0f  + (float)random(-5, 5) / 100.0f;
    
    s_simEnergyKwh += (sim_power / 1000.0f) * dt_h;

    data.valid           = true;
    data.voltage_v       = sim_voltage;
    data.current_a       = sim_power / sim_voltage;
    data.power_w         = sim_power;
    data.energy_kwh      = s_simEnergyKwh;
    data.frequency_hz    = sim_freq;
    data.power_factor    = sim_pf;

#else
    float v = pzem.voltage();
    float i = pzem.current();
    float p = pzem.power();
    float e = pzem.energy();
    float f = pzem.frequency();
    float pf = pzem.pf();

    if (isnan(v)) {
        data.valid = false;
    } else {
        data.valid = true;
        data.voltage_v = v;
        data.current_a = i;
        data.power_w = p;
        data.energy_kwh = e;
        data.frequency_hz = f;
        data.power_factor = pf;
    }
#endif

    return data;
}
