import json
import time
import random
import paho.mqtt.client as mqtt

# ================================================================
#  SENTINEL — Node Simulator (Python)
#  Simule un Node réel (ESP32) pour les tests sans matériel.
# ================================================================

# --- Configuration ---
BROKER = "127.0.0.1"
PORT = 1883
MAC_ADDRESS = "BBCCDDEEFF01"  # MAC fictive pour le Node
TOPIC_DATA = f"sbee/devices/{MAC_ADDRESS}/data"
TOPIC_STATUS = f"sbee/devices/{MAC_ADDRESS}/status"
INTERVAL = 5  # secondes

# --- État interne ---
energy_kwh = 0.0
last_time = time.time()

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"✅ Connecté au broker MQTT ({BROKER})")
        # Publier le statut ONLINE (Retain=True)
        status = {"state": "ONLINE", "role": "NODE", "mac": MAC_ADDRESS}
        client.publish(TOPIC_STATUS, json.dumps(status), retain=True)
    else:
        print(f"❌ Échec de connexion, code: {rc}")

def run_simulation():
    global energy_kwh, last_time
    
    # Compatibilité universelle Paho-MQTT (v1.x et v2.x)
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, f"sentinel_node_sim_{MAC_ADDRESS}")
    except AttributeError:
        client = mqtt.Client(f"sentinel_node_sim_{MAC_ADDRESS}")
    client.on_connect = on_connect
    
    try:
        client.connect(BROKER, PORT, 60)
    except Exception as e:
        print(f"❌ Impossible de se connecter au broker: {e}")
        return

    client.loop_start()

    print(f"🚀 Simulation du Node {MAC_ADDRESS} démarrée...")
    print(f"📊 Publication sur : {TOPIC_DATA}")

    try:
        while True:
            now = time.time()
            dt_h = (now - last_time) / 3600.0
            last_time = now

            # Simulation d'une charge type "Climatiseur" (900W - 1300W)
            voltage = 220.0 + random.uniform(-2, 2)
            power = random.uniform(900, 1300)
            current = power / voltage
            pf = random.uniform(0.92, 0.98)
            freq = 50.0 + random.uniform(-0.1, 0.1)

            # Calcul de l'énergie (Delta et Cumul)
            delta_wh = power * dt_h
            energy_kwh += (delta_wh / 1000.0)

            payload = {
                "mac_address": MAC_ADDRESS,
                "role": "NODE",
                "voltage_v": round(voltage, 1),
                "current_a": round(current, 3),
                "power_w": round(power, 1),
                "energy_kwh": round(energy_kwh, 4),
                "energy_delta_wh": round(delta_wh, 2),
                "frequency_hz": round(freq, 2),
                "power_factor": round(pf, 2)
            }

            client.publish(TOPIC_DATA, json.dumps(payload))
            print(f"📤 Envoyé : {payload['power_w']}W | {payload['energy_kwh']:.4f}kWh")
            
            time.sleep(INTERVAL)

    except KeyboardInterrupt:
        print("\n🛑 Simulation arrêtée.")
        client.loop_stop()
        client.disconnect()

if __name__ == "__main__":
    run_simulation()
