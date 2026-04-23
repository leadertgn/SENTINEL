#include <Arduino.h>
#include <LiquidCrystal_I2C.h>
#include "config.h"
#include "pzem_reader.h"
#include "mqtt_handler.h"

LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
static unsigned long lastPublishMs = 0;
static unsigned long lastLcdUpdateMs = 0;
static bool displayAlt = false;

void update_lcd(const SensorData& data) {
    lcd.clear();
    if (displayAlt) {
        lcd.setCursor(0, 0);
        lcd.print("Tension: ");
        lcd.print(data.voltage_v, 1);
        lcd.print("V");
        lcd.setCursor(0, 1);
        lcd.print("Freq: ");
        lcd.print(data.frequency_hz, 1);
        lcd.print("Hz");
    } else {
        lcd.setCursor(0, 0);
        lcd.print("Puissance: ");
        lcd.print((int)data.power_w);
        lcd.print("W");
        lcd.setCursor(0, 1);
        lcd.print("Total: ");
        lcd.print(data.energy_kwh, 2);
        lcd.print("kWh");
    }
    displayAlt = !displayAlt;
}

void setup() {
    Serial.begin(115200);
    lcd.init();
    lcd.backlight();
    lcd.setCursor(0, 0);
    lcd.print("SENTINEL MASTER");
    lcd.setCursor(0, 1);
    lcd.print("Initialisation...");

    pzem_init();
    mqtt_setup();
    
    lcd.clear();
    lcd.print("WiFi Connecte!");
    delay(1000);
}

void loop() {
    mqtt_loop();
    unsigned long now = millis();

    // Lecture et Publication
    if (now - lastPublishMs >= PUBLISH_INTERVAL_MS) {
        lastPublishMs = now;
        SensorData data = read_sensor();
        if (data.valid) {
            publish_telemetry(data);
            update_lcd(data);
        }
    }

    // Mise à jour LCD (alternance toutes les 3s)
    if (now - lastLcdUpdateMs >= 3000) {
        lastLcdUpdateMs = now;
        // On pourrait relancer update_lcd ici si on veut une alternance plus rapide que la publication
    }
}