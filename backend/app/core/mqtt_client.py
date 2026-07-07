import json
import logging
import threading
import asyncio
import time
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

# Variables globales de cache
_snapshot_cache = None
_snapshot_cache_time = 0.0

# Variables globales pour la simulation de tension
_simulated_voltage: float | None = None
_simulation_active_until: float | None = None

# Queue globale pour le broadcast asynchrone
_broadcast_queue: asyncio.Queue | None = None

# Plage de sécurité de la barrière de tension (V)
VOLTAGE_MIN = 180.0
VOLTAGE_MAX = 250.0

# Fraîcheur d'une télémétrie pour l'affichage LIVE (secondes). Au-delà, l'appareil
# est considéré comme ne rapportant plus : ses mesures instantanées (P, U, I, kWh)
# sont ramenées à 0 pour le live. Cela évite qu'une vieille ligne — typiquement
# l'historique injecté (seed) — s'affiche comme mesure courante.
TELEMETRY_FRESH_S = 180.0

def _is_fresh(ts) -> bool:
    if ts is None:
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ts).total_seconds() < TELEMETRY_FRESH_S


def sim_is_active() -> bool:
    """Vrai si une simulation de tension est en cours (non expirée)."""
    return (
        _simulated_voltage is not None
        and _simulation_active_until is not None
        and time.time() < _simulation_active_until
    )


def effective_master_voltage(session: Session) -> float | None:
    """
    Tension de référence pour la barrière de protection.
    Pendant une simulation, c'est la tension simulée qui fait autorité ;
    sinon, la dernière tension réelle remontée par le Master.
    """
    if sim_is_active():
        return _simulated_voltage
    master = session.exec(select(Device).where(Device.role == RoleEnum.MASTER)).first()
    if not master:
        return None
    last = session.exec(
        select(Telemetry).where(Telemetry.device_id == master.id).order_by(desc(Telemetry.timestamp))
    ).first()
    return last.voltage_v if last else None

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

                # ── GEL PENDANT SIMULATION ──
                # Tant qu'un scénario de tension simulé est actif, la tension
                # simulée fait autorité : on stocke la vraie trame (historique)
                # mais on n'exécute PAS la barrière réelle et on ne rediffuse
                # PAS, pour que l'affichage reste figé sur les valeurs simulées.
                if sim_is_active():
                    return

                # ── BARRIÈRE DE TENSION : PROTECTION ACTIVE EN ARRIÈRE-PLAN ──
                if device.role == RoleEnum.MASTER:
                    volt = telemetry.voltage_v
                    if volt > 0.1 and (volt < VOLTAGE_MIN or volt > VOLTAGE_MAX):
                        logger.warning(f"⚠️ DANGER TENSION : {volt}V. Déclenchement de la protection active...")
                        # Rechercher tous les nodes actifs
                        active_nodes = session.exec(
                            select(Device).where(Device.role == RoleEnum.NODE).where(Device.is_active == True)
                        ).all()
                        for node in active_nodes:
                            logger.warning(f"⚡ Coupure automatique du relais de {node.name} ({node.mac_address})")
                            node.is_active = False
                            session.add(node)
                            send_mqtt_command(node.mac_address, "OFF")
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

def _build_snapshot(session: Session):
    global _snapshot_cache, _snapshot_cache_time, _simulated_voltage, _simulation_active_until
    
    # Vérifier si la simulation est active
    sim_active = False
    if _simulated_voltage is not None and _simulation_active_until is not None:
        if time.time() < _simulation_active_until:
            sim_active = True
        else:
            _simulated_voltage = None
            _simulation_active_until = None

    # Si pas de simulation et cache encore valide (TTL 5.0 secondes), on retourne le cache
    if not sim_active and _snapshot_cache is not None and (time.time() - _snapshot_cache_time) < 5.0:
        return _snapshot_cache

    # check if mqtt is connected
    mqtt_connected = _mqtt_client is not None and _mqtt_client.is_connected()
    
    # database is online since we are running queries on it
    db_connected = True
    
    master = session.exec(select(Device).where(Device.role == RoleEnum.MASTER)).first()
    last_m = session.exec(select(Telemetry).where(Telemetry.device_id == master.id).order_by(desc(Telemetry.timestamp))).first() if master else None

    # CALCUL DU COUT DYNAMIQUE (POSTPAYÉ)
    billing_data = {"total_fcfa": 0.0, "energy_cost": 0.0, "fixed_premium": 0.0}
    tariff_name = "Standard"
    price_kwh = 88
    
    if last_m:
        tariff = get_active_tariff(last_m.energy_kwh, session)
        billing_data = calculate_monthly_cost(last_m.energy_kwh, session)
        tariff_name = tariff.name if tariff else "Standard"
        price_kwh = tariff.price_per_kwh if tariff else 88

    nodes = session.exec(select(Device).where(Device.role == RoleEnum.NODE)).all()
    nodes_data = []
    total_p_nodes = 0
    for n in nodes:
        last_n = session.exec(select(Telemetry).where(Telemetry.device_id == n.id).order_by(desc(Telemetry.timestamp))).first()
        # Mesures LIVE uniquement si la dernière trame est récente (< 3 min).
        # Sinon (node hors ligne / vieille ligne seedée), on affiche 0.
        fresh = _is_fresh(last_n.timestamp) if last_n else False
        p = last_n.power_w if fresh else 0
        nodes_data.append({
            "name": n.name,
            "mac": n.mac_address,
            "role": n.role,
            "power": p,
            "voltage": last_n.voltage_v if fresh else 0,
            "current": last_n.current_a if fresh else 0,
            "kwh_total": last_n.energy_kwh if fresh else 0,
            "power_factor": last_n.power_factor if fresh else 0,
            "frequency_hz": last_n.frequency_hz if fresh else 0,
            "energy_delta_wh": last_n.energy_delta_wh if fresh else 0,
            "is_active": n.is_active,
            "status": n.status
        })
        total_p_nodes += p

    # Mesures LIVE du Master uniquement si la dernière trame est récente.
    fresh_m = _is_fresh(last_m.timestamp) if last_m else False
    master_power   = last_m.power_w if fresh_m else 0.0
    master_voltage = last_m.voltage_v if fresh_m else 0.0
    master_current = last_m.current_a if fresh_m else 0.0

    # Surcharge si simulation active (la tension simulée fait autorité même si le
    # Master réel est momentanément muet : c'est une entrée « live » volontaire).
    if sim_active and _simulated_voltage is not None:
        master_voltage = _simulated_voltage
        # Calcul du courant cohérent si P > 0
        pf = last_m.power_factor if (last_m and last_m.power_factor > 0) else 0.95
        master_current = master_power / (master_voltage * pf) if (master_voltage > 0 and pf > 0) else 0.0

    snapshot = {
        "type": "TELEMETRY_UPDATE",
        "timestamp": last_m.timestamp.isoformat() if last_m else datetime.now(timezone.utc).isoformat(),
        "system_status": {
            "mqtt": mqtt_connected,
            "db": db_connected,
            "backend": True
        },
        "master": {
            "name": master.name if master else "Compteur Central SBEE",
            "mac": master.mac_address if master else "MAC_MASTER",
            "role": RoleEnum.MASTER,
            "status": master.status if master else StatusEnum.OFFLINE,
            "power": master_power,
            "voltage": master_voltage,
            "current": master_current,
            "kwh_total": last_m.energy_kwh if fresh_m else 0.0,
            "energy_delta_wh": last_m.energy_delta_wh if fresh_m else 0.0,
            "power_factor": last_m.power_factor if fresh_m else 0.0,
            "frequency_hz": last_m.frequency_hz if fresh_m else 50.0
        },
        "nodes": nodes_data,
        "audit": {"unknown_w": max(0, master_power - total_p_nodes)},
        "billing": {
            "total_fcfa": int(billing_data["total_fcfa"]), 
            "energy_cost": int(billing_data["energy_cost"]),
            "fixed_premium": int(billing_data["fixed_premium"]),
            "active_tariff": tariff_name, 
            "price_per_kwh": price_kwh
        }
    }

    # Ne mettre en cache que si la simulation n'est pas active
    if not sim_active:
        _snapshot_cache = snapshot
        _snapshot_cache_time = time.time()

    return snapshot

async def queue_drainer():
    global _broadcast_queue
    while True:
        try:
            if _broadcast_queue is None:
                await asyncio.sleep(0.1)
                continue
            snapshot = await _broadcast_queue.get()
            logger.info("📡 WebSocket : Diffusion d'une mise à jour (Queue)")
            await manager.broadcast(snapshot)
            _broadcast_queue.task_done()
        except Exception as e:
            logger.error(f"⚠️ Queue Drainer Error: {e}")
            await asyncio.sleep(0.5)

def _broadcast_unified_snapshot(session: Session):
    global _broadcast_queue, _main_loop
    try:
        snapshot = _build_snapshot(session)
        if not snapshot: return

        # `_broadcast_unified_snapshot` est appelée depuis le thread MQTT
        # (loop_forever) ou depuis un thread de la threadpool FastAPI, jamais
        # depuis la boucle asyncio. `asyncio.Queue` n'étant pas thread-safe, on
        # réveille la boucle de façon sûre via call_soon_threadsafe. Sinon le
        # drainer ne serait pas réveillé de manière fiable (affichage figé).
        if _broadcast_queue is not None and _main_loop is not None:
            _main_loop.call_soon_threadsafe(_broadcast_queue.put_nowait, snapshot)
        elif _main_loop is not None:
            # Fallback si la queue n'est pas encore prête
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
