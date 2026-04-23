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

# Stockage de la boucle d'événements principale pour le broadcast WS
_main_loop = None

def _validate_and_register(session: Session, payload: dict) -> Device | None:
    """
    Valide la secret_key et enregistre l'appareil s'il est nouveau.
    Retourne l'appareil si valide, sinon None.
    """
    mac = payload.get("mac_address")
    secret = payload.get("secret_key")
    role_str = payload.get("role", "NODE").upper()

    if not mac or not secret:
        return None

    device = session.exec(select(Device).where(Device.mac_address == mac)).first()

    # Si l'appareil existe, on vérifie sa clé
    if device:
        if device.secret_key != secret:
            logger.warning(f"🔐 Tentative d'accès non autorisée pour {mac} (clé invalide)")
            return None
        return device

    # Si l'appareil est nouveau, on vérifie s'il utilise la clé secrète globale de provisionnement
    if secret == settings.DEVICE_SHARED_SECRET:
        existing_master = session.exec(select(Device).where(Device.role == RoleEnum.MASTER)).first()
        
        # Le premier Master enregistré devient la référence
        role = RoleEnum.MASTER if role_str == "MASTER" and not existing_master else RoleEnum.NODE
        name = "Compteur Central SBEE" if role == RoleEnum.MASTER else f"Appareil {mac[-4:]}"
        
        new_device = Device(
            mac_address=mac,
            name=name,
            role=role,
            secret_key=secret, # On stocke la clé pour les futurs messages
            status=StatusEnum.ONLINE,
            is_active=True,
            master_device_id=existing_master.id if existing_master else None
        )
        session.add(new_device)
        session.commit()
        session.refresh(new_device)
        logger.info(f"✨ Auto-découverte : {name} ({role}) enregistré avec succès.")
        return new_device

    return None

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        logger.info("✅ MQTT : Connecté au broker")
        client.subscribe([
            (settings.MQTT_TOPIC_DATA, 1),
            ("sbee/devices/+/status", 1),
        ])
    else:
        logger.error(f"❌ MQTT : Échec de connexion ({rc})")

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        
        with Session(engine) as session:
            # 1. Authentification & Auto-découverte
            device = _validate_and_register(session, payload)
            if not device: return

            if msg.topic == settings.MQTT_TOPIC_DATA:
                # 2. Calcul du Delta d'Énergie (Logique demandée dans README_BACKEND)
                new_kwh = float(payload.get("energy_kwh", 0.0))
                
                # Récupérer la dernière télémétrie pour cet appareil
                last_telemetry = session.exec(
                    select(Telemetry)
                    .where(Telemetry.device_id == device.id)
                    .order_by(Telemetry.timestamp.desc())
                ).first()

                delta_wh = 0.0
                if last_telemetry:
                    if new_kwh >= last_telemetry.energy_kwh:
                        delta_wh = (new_kwh - last_telemetry.energy_kwh) * 1000.0
                    else:
                        # Cas du reset PZEM
                        delta_wh = new_kwh * 1000.0
                
                # 3. Enregistrement de la télémétrie
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
                
                # Mise à jour de l'état ON/OFF pour les Nodes
                if "is_active" in payload:
                    device.is_active = bool(payload["is_active"])
                
                device.status = StatusEnum.ONLINE
                session.add(device)
                session.commit()

                # 4. Diffusion du Snapshot Unifié vers les WebSockets
                _broadcast_unified_snapshot(session)

            elif "/status" in msg.topic:
                # Mise à jour du statut du relais renvoyé par l'appareil
                if "is_active" in payload:
                    device.is_active = bool(payload["is_active"])
                    session.add(device)
                    session.commit()
                    _broadcast_unified_snapshot(session)

    except Exception as e:
        logger.error(f"💥 MQTT Message Error: {e}")

def _broadcast_unified_snapshot(session: Session):
    """Compile et envoie l'état global de la maison au Dashboard."""
    global _main_loop
    try:
        # Récupération du Master
        master = session.exec(select(Device).where(Device.role == RoleEnum.MASTER)).first()
        if not master: return

        last_m = session.exec(
            select(Telemetry).where(Telemetry.device_id == master.id).order_by(Telemetry.timestamp.desc())
        ).first()
        if not last_m: return

        # Récupération de tous les Nodes
        nodes = session.exec(select(Device).where(Device.role == RoleEnum.NODE)).all()
        nodes_data = []
        total_node_power = 0.0

        for n in nodes:
            last_n = session.exec(
                select(Telemetry).where(Telemetry.device_id == n.id).order_by(Telemetry.timestamp.desc())
            ).first()
            p = last_n.power_w if last_n else 0.0
            nodes_data.append({
                "name": n.name,
                "mac": n.mac_address,
                "power": p,
                "voltage": last_n.voltage_v if last_n else 0.0,
                "is_active": n.is_active,
                "status": n.status
            })
            total_node_power += p

        # Calcul Facturation
        cost = calculate_monthly_cost(last_m.energy_kwh, session)
        tariff = get_active_tariff(last_m.energy_kwh, session)

        snapshot = {
            "type": "TELEMETRY_UPDATE",
            "timestamp": last_m.timestamp.isoformat(),
            "master": {
                "power": last_m.power_w,
                "voltage": last_m.voltage_v,
                "current": last_m.current_a,
                "kwh_total": last_m.energy_kwh,
                "pf": last_m.power_factor,
                "hz": last_m.frequency_hz
            },
            "nodes": nodes_data,
            "audit": {
                "unknown_w": max(0.0, last_m.power_w - total_node_power),
                "nodes_total_w": total_node_power
            },
            "billing": {
                "total_fcfa": cost,
                "active_tariff": tariff.name if tariff else "Inconnu",
                "price_per_kwh": tariff.price_per_kwh if tariff else 0
            }
        }

        if _main_loop and _main_loop.is_running():
            asyncio.run_coroutine_threadsafe(manager.broadcast(snapshot), _main_loop)

    except Exception as e:
        logger.error(f"⚠️ Broadcast Snapshot Error: {e}")

# Instance globale pour accès depuis l'API
_mqtt_client = None

def send_mqtt_command(mac: str, action: str):
    """Envoie une commande JSON sur le topic cmd de l'appareil."""
    global _mqtt_client
    if _mqtt_client and _mqtt_client.connected():
        topic = f"sbee/devices/{mac}/cmd"
        payload = json.dumps({"action": action})
        _mqtt_client.publish(topic, payload)
        logger.info(f"📤 Commande envoyée : {mac} -> {action}")
        return True
    return False

def start_mqtt_client():
    global _main_loop, _mqtt_client
    # ...
    try:
        _main_loop = asyncio.get_event_loop()
    except RuntimeError:
        _main_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_main_loop)

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, "SENTINEL_BACKEND")
    _mqtt_client = client # Mémoriser l'instance
    # ...
    if settings.MQTT_USERNAME:
        client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
    
    client.on_connect = on_connect
    client.on_message = on_message
    
    try:
        client.connect(settings.MQTT_BROKER, settings.MQTT_PORT, 60)
        t = threading.Thread(target=client.loop_forever, daemon=True)
        t.start()
        logger.info(f"🚀 MQTT : Service démarré sur {settings.MQTT_BROKER}")
    except Exception as e:
        logger.error(f"❌ MQTT : Impossible de démarrer : {e}")
