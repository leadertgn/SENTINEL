import json
import logging
import threading
import asyncio
import paho.mqtt.client as mqtt
from datetime import datetime
from sqlmodel import Session, select, func
from app.core.database import engine
from app.core.config import settings
from app.models.base import Telemetry, Device, StatusEnum, RoleEnum
from app.api.telemetry import manager
from app.services.billing import calculate_monthly_cost, get_active_tariff

logger = logging.getLogger("mqtt")
_main_loop = None

def _validate_and_register(session: Session, payload: dict) -> Device | None:
    mac = payload.get("mac_address")
    secret = payload.get("secret_key")
    role_str = payload.get("role", "NODE").upper()

    if not mac or not secret:
        return None

    device = session.exec(select(Device).where(Device.mac_address == mac)).first()
    if device:
        if device.secret_key != secret: return None
        return device

    if secret == settings.DEVICE_SHARED_SECRET:
        existing_master = session.exec(select(Device).where(Device.role == RoleEnum.MASTER)).first()
        role = RoleEnum.MASTER if role_str == "MASTER" and not existing_master else RoleEnum.NODE
        
        new_device = Device(
            mac_address=mac,
            name="Compteur Principal" if role == RoleEnum.MASTER else f"Equipement {mac[-4:]}",
            role=role,
            secret_key=secret,
            status=StatusEnum.ONLINE,
            is_active=True
        )
        session.add(new_device)
        session.commit()
        session.refresh(new_device)
        print(f"✨ MQTT : Nouvel appareil : {new_device.name} ({new_device.role})")
        return new_device

    return None

def on_connect(client, userdata, flags, rc):
    print(f"🌐 MQTT : Connecté au Broker (code {rc})")
    client.subscribe("sbee/devices/+/data")
    client.subscribe("sbee/devices/+/status")

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        
        with Session(engine) as session:
            device = _validate_and_register(session, payload)
            if not device: return

            if "/data" in msg.topic:
                new_kwh = float(payload.get("energy_kwh", 0.0))
                
                last_telemetry = session.exec(
                    select(Telemetry).where(Telemetry.device_id == device.id).order_by(Telemetry.timestamp.desc())
                ).first()
                delta_wh = (new_kwh - last_telemetry.energy_kwh) * 1000.0 if last_telemetry and new_kwh >= last_telemetry.energy_kwh else 0.0

                telemetry = Telemetry(
                    device_id=device.id,
                    voltage_v=payload.get("voltage_v", 0.0),
                    current_a=payload.get("current_a", 0.0),
                    power_w=payload.get("power_w", 0.0),
                    energy_kwh=new_kwh,
                    energy_delta_wh=delta_wh,
                    frequency_hz=payload.get("frequency_hz", 50.0),
                    power_factor=payload.get("pf", 1.0)
                )
                session.add(telemetry)
                device.status = StatusEnum.ONLINE
                session.add(device)
                session.commit()

                # On ne déclenche le broadcast que si c'est le MASTER qui publie
                # Cela évite les snapshots redondants et définit le rythme de l'UI
                if device.role == RoleEnum.MASTER:
                    _broadcast_unified_snapshot(session)

    except Exception as e:
        print(f"💥 MQTT Error: {e}")

def _broadcast_unified_snapshot(session: Session):
    global _main_loop
    try:
        master = session.exec(select(Device).where(Device.role == RoleEnum.MASTER)).first()
        if not master: return

        last_m = session.exec(select(Telemetry).where(Telemetry.device_id == master.id).order_by(Telemetry.timestamp.desc())).first()
        if not last_m: return

        nodes = session.exec(select(Device).where(Device.role == RoleEnum.NODE)).all()
        nodes_data = []
        total_p_nodes = 0
        for n in nodes:
            last_n = session.exec(select(Telemetry).where(Telemetry.device_id == n.id).order_by(Telemetry.timestamp.desc())).first()
            p = last_n.power_w if last_n else 0
            nodes_data.append({"name": n.name, "mac": n.mac_address, "power": p, "is_active": n.is_active, "status": n.status})
            total_p_nodes += p

        # Harmonisation du contrat avec le Frontend (clés explicites)
        snapshot = {
            "type": "TELEMETRY_UPDATE",
            "timestamp": last_m.timestamp.isoformat(),
            "master": {
                "power": last_m.power_w,
                "voltage": last_m.voltage_v,
                "current": last_m.current_a,
                "kwh_total": last_m.energy_kwh,
                "power_factor": last_m.power_factor,
                "frequency_hz": last_m.frequency_hz
            },
            "nodes": nodes_data,
            "audit": {"unknown_w": max(0, last_m.power_w - total_p_nodes)},
            "billing": {"total_fcfa": 0, "active_tariff": "SBEE Normal", "price_per_kwh": 79}
        }

        if _main_loop:
            nb_clients = len(manager.active_connections)
            asyncio.run_coroutine_threadsafe(manager.broadcast(snapshot), _main_loop)
            if nb_clients > 0:
                print(f"🚀 Snapshot diffusé vers {nb_clients} client(s) (P_Master: {last_m.power_w}W)")

    except Exception as e:
        print(f"⚠️ Broadcast Error: {e}")

def send_mqtt_command(mac: str, action: str):
    global _mqtt_client
    if _mqtt_client:
        _mqtt_client.publish(f"sbee/devices/{mac}/cmd", json.dumps({"action": action}))
        return True
    return False

_mqtt_client = None

def start_mqtt_client():
    global _main_loop, _mqtt_client
    try:
        _main_loop = asyncio.get_event_loop()
    except:
        _main_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_main_loop)

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, "SENTINEL_BACKEND")
    _mqtt_client = client
    client.on_connect = on_connect
    client.on_message = on_message
    
    try:
        client.connect(settings.MQTT_BROKER, settings.MQTT_PORT, 60)
        threading.Thread(target=client.loop_forever, daemon=True).start()
        print(f"🚀 MQTT : Client démarré sur {settings.MQTT_BROKER}")
    except Exception as e:
        print(f"❌ MQTT : Erreur démarrage : {e}")
