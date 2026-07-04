import sys
import json
import time
import random
import paho.mqtt.client as mqtt

# ================================================================
#  SENTINEL — Master Simulator (Python) — PLAN DE REPLI
#  Simule le compteur général (Master ESP32) sans matériel.
#  Usage :  python simulate_master.py [puissance_W]
#           (défaut : 200 W — mettre 500 pour le scénario B de l'audit)
# ================================================================

BROKER = "127.0.0.1"
PORT = 1883
SECRET = "SENTINEL_SECRET_2026"          # doit correspondre à DEVICE_SHARED_SECRET
MAC_ADDRESS = "AABBCCDD0001"             # MAC fictive du Master
INTERVAL = 3                             # secondes

POWER_W = float(sys.argv[1]) if len(sys.argv) > 1 else 200.0

TOPIC_DATA = f"sbee/devices/{MAC_ADDRESS}/data"
TOPIC_STATUS = f"sbee/devices/{MAC_ADDRESS}/status"

energy_kwh = 0.0
last_time = time.time()


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"✅ Master connecté au broker ({BROKER}) — {POWER_W:.0f} W")
        status = {
            "state": "ONLINE", "role": "MASTER",
            "mac_address": MAC_ADDRESS, "secret_key": SECRET,
        }
        client.publish(TOPIC_STATUS, json.dumps(status), retain=True)
    else:
        print(f"❌ Échec de connexion, code: {rc}")


def make_client():
    try:
        return mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, f"sentinel_master_sim_{MAC_ADDRESS}")
    except AttributeError:
        return mqtt.Client(f"sentinel_master_sim_{MAC_ADDRESS}")


def run():
    global energy_kwh, last_time
    client = make_client()
    client.on_connect = on_connect
    try:
        client.connect(BROKER, PORT, 60)
    except Exception as e:
        print(f"❌ Impossible de se connecter au broker: {e}")
        return
    client.loop_start()
    print(f"🚀 Simulation Master démarrée (P = {POWER_W:.0f} W). Ctrl+C pour arrêter.")

    try:
        while True:
            now = time.time()
            dt_h = (now - last_time) / 3600.0
            last_time = now

            voltage = 220.0 + random.uniform(-2, 2)
            power = POWER_W + random.uniform(-2, 2)
            current = power / voltage if voltage > 0 else 0.0
            pf = random.uniform(0.95, 0.99)
            freq = 50.0 + random.uniform(-0.1, 0.1)
            energy_kwh += (power / 1000.0) * dt_h

            payload = {
                "mac_address": MAC_ADDRESS,
                "secret_key": SECRET,
                "role": "MASTER",
                "voltage_v": round(voltage, 1),
                "current_a": round(current, 3),
                "power_w": round(power, 1),
                "energy_kwh": round(energy_kwh, 4),
                "frequency_hz": round(freq, 2),
                "pf": round(pf, 2),
                "is_active": True,
                "timestamp": int(now),
            }
            client.publish(TOPIC_DATA, json.dumps(payload))
            print(f"📤 MASTER  {payload['power_w']} W | {payload['voltage_v']} V")
            time.sleep(INTERVAL)
    except KeyboardInterrupt:
        print("\n🛑 Master arrêté.")
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    run()
