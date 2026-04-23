#pragma once
#include "pzem_reader.h"

void mqtt_setup();
void mqtt_loop();
bool get_relay_state();
void publish_telemetry(const SensorData& data);
