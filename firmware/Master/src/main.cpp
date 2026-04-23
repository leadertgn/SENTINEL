#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "config.h"
#include "pzem_reader.h"
#include "mqtt_handler.h"

LiquidCrystal_I2C lcd(0x27, 16, 2);
static unsigned long lastPublishMs = 0;
bool lcdAvailable = false;

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n🛡️ SENTINEL MASTER STARTING...");

    // Test I2C pour le LCD
    Wire.begin(21, 22);
    Wire.beginTransmission(0x27);
    if (Wire.endTransmission() == 0) {
        Serial.println("📺 LCD Détecté sur 0x27");
        lcdAvailable = true;
        lcd.init();
        lcd.backlight();
        lcd.print("SENTINEL INIT...");
    } else {
        Serial.println("⚠️ LCD non détecté (Vérifier câblage/adresse)");
    }

    pzem_init();
    mqtt_setup();
    
    if (lcdAvailable) {
        lcd.clear();
        lcd.print("SYSTEME PRET");
    }
}

void loop() {
    mqtt_loop();
    unsigned long now = millis();

    if (now - lastPublishMs >= PUBLISH_INTERVAL_MS) {
        lastPublishMs = now;
        SensorData data = read_sensor();
        if (data.valid) {
            publish_telemetry(data);
            
            if (lcdAvailable) {
                lcd.setCursor(0,0);
                lcd.print("U:"); lcd.print((int)data.voltage_v); lcd.print("V ");
                lcd.print("P:"); lcd.print((int)data.power_w); lcd.print("W   ");
                lcd.setCursor(0,1);
                lcd.print("E:"); lcd.print(data.energy_kwh, 3); lcd.print("kWh");
            }
        }
    }
}