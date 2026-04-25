import json
import logging
import threading
import asyncio
import paho.mqtt.client as mqtt
from datetime import datetime, timezone
from sqlmodel import Session, select
from sqlalchemy import desc
from app.core.database import engine
from app.core.config import settings
from app.models.base import Telemetry, Device, StatusEnum, RoleEnum
from app.api.telemetry import manager
from app.services.billing import calculate_monthly_cost, get_active_tariff

logger = logging.getLogger("mqtt")
_main_loop: asyncio.AbstractEventLoop | None = None
_mqtt_client: mqtt.Client | None = None

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
            is_active=payload.get("is_active", False)
        )
        session.add(new_device)
        session.commit()
        session.refresh(new_device)
        logger.info(f"✨ MQTT : Nouvel appareil : {new_device.name} ({new_device.role.value})")
        return new_device

    return None

def on_connect(_client, _userdata, _flags, _rc):
    _client.subscribe("sbee/devices/+/data")
    _client.subscribe("sbee/devices/+/status")

def on_message(_client, _userdata, msg):
    try:
        logger.info(f"📥 MQTT Rx : {msg.topic}")
        payload = json.loads(msg.payload.decode())
        with Session(engine) as session:
            device = _validate_and_register(session, payload)
            if not device: return

            if "/data" in msg.topic:
                new_kwh = float(payload.get("energy_kwh", 0.0))
                last_telemetry = session.exec(
                    select(Telemetry).where(Telemetry.device_id == device.id).order_by(desc(Telemetry.timestamp))
                ).first()
                delta_wh = (new_kwh - last_telemetry.energy_kwh) * 1000.0 if last_telemetry and new_kwh >= last_telemetry.energy_kwh else 0.0

                # ── HORODATAGE NTP ──
                # Si le node envoie un timestamp valide (NTP réussi), on l'utilise.
                # Si le NTP a échoué (pas d'internet), l'ESP envoie une valeur très basse (ex: 3600).
                # 1600000000 correspond environ à l'année 2020.
                timestamp_val = payload.get("timestamp")
                if timestamp_val and isinstance(timestamp_val, (int, float)) and timestamp_val > 1600000000:
                    dt_timestamp = datetime.fromtimestamp(timestamp_val, tz=timezone.utc)
                else:
                    logger.info(f"⚠️ Timestamp invalide ({timestamp_val}) détecté pour {device.mac_address}. Fallback à l'heure du serveur.")
                    dt_timestamp = datetime.now(timezone.utc)

                telemetry = Telemetry(
                    device_id=device.id,
                    voltage_v=payload.get("voltage_v", 0.0),
                    current_a=payload.get("current_a", 0.0),
                    power_w=payload.get("power_w", 0.0),
                    energy_kwh=new_kwh,
                    energy_delta_wh=delta_wh,
                    frequency_hz=payload.get("frequency_hz", 50.0),
                    power_factor=payload.get("pf", 1.0),
                    timestamp=dt_timestamp
                )
                session.add(telemetry)
                device.status = StatusEnum.ONLINE
                if "is_active" in payload:
                    device.is_active = payload.get("is_active")
                session.commit()

                _broadcast_unified_snapshot(session)

            elif "/status" in msg.topic:
                state_str = payload.get("state", "ONLINE").upper()
                if state_str == "OFFLINE":
                    device.status = StatusEnum.OFFLINE
                    logger.info(f"🔴 MQTT : Appareil {device.mac_address} hors-ligne (LWT).")
                else:
                    device.status = StatusEnum.ONLINE
                
                device.is_active = payload.get("is_active", device.is_active)
                session.add(device)
                session.commit()
                _broadcast_unified_snapshot(session)

    except Exception as e:
        logger.error(f"💥 MQTT Error: {e}", exc_info=True)

def _broadcast_unified_snapshot(session: Session):
    global _main_loop
    try:
        master = session.exec(select(Device).where(Device.role == RoleEnum.MASTER)).first()
        if not master: return

        last_m = session.exec(select(Telemetry).where(Telemetry.device_id == master.id).order_by(desc(Telemetry.timestamp))).first()
        if not last_m: return

        # CALCUL DU COUT DYNAMIQUE (POSTPAYÉ)
        tariff = get_active_tariff(last_m.energy_kwh, session)
        billing_data = calculate_monthly_cost(last_m.energy_kwh, session)

        nodes = session.exec(select(Device).where(Device.role == RoleEnum.NODE)).all()
        nodes_data = []
        total_p_nodes = 0
        for n in nodes:
            last_n = session.exec(select(Telemetry).where(Telemetry.device_id == n.id).order_by(desc(Telemetry.timestamp))).first()
            p = last_n.power_w if last_n else 0
            nodes_data.append({
                "name": n.name, 
                "mac": n.mac_address, 
                "role": n.role,
                "power": p,
                "voltage": last_n.voltage_v if last_n else 0,
                "current": last_n.current_a if last_n else 0,
                "kwh_total": last_n.energy_kwh if last_n else 0,
                "power_factor": last_n.power_factor if last_n else 0,
                "frequency_hz": last_n.frequency_hz if last_n else 0,
                "energy_delta_wh": last_n.energy_delta_wh if last_n else 0,
                "is_active": n.is_active, 
                "status": n.status
            })
            total_p_nodes += p

        snapshot = {
            "type": "TELEMETRY_UPDATE",
            "timestamp": last_m.timestamp.isoformat(),
            "master": {
                "name": master.name,
                "mac": master.mac_address,
                "role": master.role,
                "status": master.status,
                "power": last_m.power_w,
                "voltage": last_m.voltage_v,
                "current": last_m.current_a,
                "kwh_total": last_m.energy_kwh,
                "energy_delta_wh": last_m.energy_delta_wh,
                "power_factor": last_m.power_factor,
                "frequency_hz": last_m.frequency_hz
            },
            "nodes": nodes_data,
            "audit": {"unknown_w": max(0, last_m.power_w - total_p_nodes)},
            "billing": {
                "total_fcfa": int(billing_data["total_fcfa"]), 
                "energy_cost": int(billing_data["energy_cost"]),
                "fixed_premium": int(billing_data["fixed_premium"]),
                "active_tariff": tariff.name if tariff else "Standard", 
                "price_per_kwh": tariff.price_per_kwh if tariff else 88
            }
        }

        if _main_loop:
            logger.info("📡 WebSocket : Diffusion d'une mise à jour (Snapshot)")
            asyncio.run_coroutine_threadsafe(manager.broadcast(snapshot), _main_loop)
    except Exception as e:
        logger.error(f"⚠️ Broadcast Error: {e}")

def send_mqtt_command(mac: str, action: str):
    global _mqtt_client
    if _mqtt_client:
        _mqtt_client.publish(f"sbee/devices/{mac}/cmd", json.dumps({"action": action}))
        return True
    return False



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
        logger.info("✅ Client MQTT Backend connecté avec succès !")
    except Exception as e:
        logger.error(f"❌ Erreur connexion MQTT : {e}")
