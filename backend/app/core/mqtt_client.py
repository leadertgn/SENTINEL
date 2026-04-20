import json
import logging
import threading
import paho.mqtt.client as mqtt
from sqlmodel import Session, select
from app.core.database import engine
from app.core.config import settings
from app.models.base import Telemetry, Device, StatusEnum, RoleEnum

logger = logging.getLogger("mqtt")


def _auto_register_device(session: Session, mac: str) -> Device | None:
    """
    Auto-découverte : si un nœud inconnu publie une mesure,
    on l'enregistre automatiquement sans avoir à recoder quoi que ce soit.
    Il sera visible dans l'UI dès la prochaine connexion WebSocket.
    """
    device = session.exec(select(Device).where(Device.mac_address == mac)).first()
    if device:
        return device

    # Chercher le Master pour lui rattacher le nouveau nœud
    master = session.exec(select(Device).where(Device.role == RoleEnum.MASTER)).first()

    new_device = Device(
        mac_address=mac,
        name=f"Node {mac[-5:]}",       # Nom généré depuis les derniers octets MAC
        role=RoleEnum.NODE,
        status=StatusEnum.ONLINE,
        is_active=True,
        master_device_id=master.id if master else None,
    )
    session.add(new_device)
    session.commit()
    session.refresh(new_device)
    logger.info(f"🔌 Nouveau nœud auto-enregistré : {mac} → {new_device.name}")
    return new_device


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        logger.info("Connecté au broker MQTT avec succès !")
        client.subscribe([
            (settings.MQTT_TOPIC_DATA, 1),
            (settings.MQTT_TOPIC_STATUS, 1),
        ])
    else:
        logger.error(f"Échec de connexion MQTT, code: {rc}")


def on_message(client, userdata, msg):
    try:
        topic_parts = msg.topic.split('/')
        device_mac = topic_parts[2]
        payload = json.loads(msg.payload.decode('utf-8'))

        with Session(engine) as session:
            # Auto-découverte : enregistre le device s'il est inconnu
            device = _auto_register_device(session, device_mac)
            if not device:
                return

            if msg.topic.endswith("data"):
                telemetry = Telemetry(
                    device_id=device.id,
                    voltage_v=payload.get("voltage_v", 0.0),
                    current_a=payload.get("current_a", 0.0),
                    power_w=payload.get("power_w", 0.0),
                    energy_kwh=payload.get("energy_kwh", 0.0),
                    frequency_hz=payload.get("frequency_hz", 50.0),
                    power_factor=payload.get("power_factor", 0.95),
                )
                session.add(telemetry)
                # Marquer le device comme ONLINE à chaque mesure reçue
                device.status = StatusEnum.ONLINE
                session.add(device)
                session.commit()
                logger.info(f"📡 [{device.name}] {telemetry.power_w}W | {telemetry.voltage_v}V")

            elif msg.topic.endswith("status"):
                state = payload.get("state", "").upper()
                if state in StatusEnum.__members__:
                    device.status = StatusEnum[state]
                    session.add(device)
                    session.commit()
                    logger.info(f"🔄 [{device.name}] status → {state}")

    except Exception as e:
        logger.error(f"Erreur MQTT on_message: {e}")


def start_mqtt_client():
    client = mqtt.Client()
    # Auth MQTT Broker (optionnel, activé si configuré dans .env)
    if settings.MQTT_USERNAME:
        client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message
    try:
        client.connect(settings.MQTT_BROKER, settings.MQTT_PORT, 60)
        thread = threading.Thread(target=client.loop_forever, daemon=True)
        thread.start()
        logger.info(f"Client MQTT démarré → {settings.MQTT_BROKER}:{settings.MQTT_PORT}")
    except Exception as e:
        logger.error(f"Impossible de démarrer MQTT: {e}")
