#pragma once
#include "pzem_reader.h"

void net_begin();
void net_on_portal_open(const char* apName);
void mqtt_setup();
void mqtt_loop();
bool mqtt_connected();
bool get_relay_state();
void publish_telemetry(const SensorData& data, unsigned long timestamp);
