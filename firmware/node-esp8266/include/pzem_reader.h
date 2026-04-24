#pragma once

struct SensorData {
    bool valid;
    float voltage_v;
    float current_a;
    float power_w;
    float energy_kwh;
    float frequency_hz;
    float power_factor;
};

void pzem_init();
SensorData read_sensor(bool relayState);
