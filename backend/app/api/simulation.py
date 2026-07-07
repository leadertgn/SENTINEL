import time
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func
from datetime import datetime, timezone, timedelta
from app.core.database import get_session, engine
from app.models.base import Device, Telemetry, RoleEnum, StatusEnum
from app.core import mqtt_client
from app.core.mqtt_client import send_mqtt_command, _broadcast_unified_snapshot

logger = logging.getLogger("simulation")
router = APIRouter(prefix="/api/sim", tags=["Simulation"])

@router.post("/voltage")
def simulate_voltage(voltage: float = Query(..., description="Tension simulée en Volts"), session: Session = Depends(get_session)):
    """
    Force une tension simulée sur le Master pour une durée de 5 minutes.
    Si la tension sort de la plage [180V - 250V], déclenche la protection active.
    """
    # 1. Activer la simulation
    mqtt_client._simulated_voltage = voltage
    mqtt_client._simulation_active_until = time.time() + 300.0 # 5 minutes

    logger.info(f"⚡ Simulation de tension activée : {voltage}V pour 5 minutes.")

    # 2. Si hors-plage, déclencher la protection active (coupure des nodes)
    if voltage < 180.0 or voltage > 250.0:
        logger.warning(f"⚠️ Tension simulée hors-plage ({voltage}V). Déclenchement de la protection active...")
        active_nodes = session.exec(
            select(Device).where(Device.role == RoleEnum.NODE).where(Device.is_active == True)
        ).all()
        for node in active_nodes:
            logger.warning(f"⚡ Coupure automatique (simulation) du relais de {node.name}")
            node.is_active = False
            session.add(node)
            send_mqtt_command(node.mac_address, "OFF")
        session.commit()

    # 3. Diffuser le snapshot mis à jour
    _broadcast_unified_snapshot(session)

    return {"status": "success", "simulated_voltage": voltage, "active_until_epoch": mqtt_client._simulation_active_until}

@router.post("/reset")
def reset_simulation(session: Session = Depends(get_session)):
    """
    Annule toute simulation en cours et restaure le flux des mesures réelles.
    """
    mqtt_client._simulated_voltage = None
    mqtt_client._simulation_active_until = None

    logger.info("⚡ Simulation réinitialisée. Retour aux mesures réelles.")
    _broadcast_unified_snapshot(session)

    return {"status": "success", "message": "Simulation réinitialisée."}

@router.post("/clear-history")
def clear_history(session: Session = Depends(get_session)):
    """
    Supprime l'historique de démonstration injecté par /seed-history
    (télémétries datées d'avril à juin 2026). Permet de « défaire » le seed.
    N'affecte pas les mesures réelles du mois courant.
    """
    start_date = datetime(2026, 4, 1, tzinfo=timezone.utc)
    end_date = datetime(2026, 6, 30, 23, 59, 59, tzinfo=timezone.utc)

    records = session.exec(
        select(Telemetry).where(Telemetry.timestamp >= start_date).where(Telemetry.timestamp <= end_date)
    ).all()
    count = len(records)
    for record in records:
        session.delete(record)
    session.commit()

    logger.info(f"🧹 Historique de démo supprimé ({count} relevés avril–juin 2026).")
    _broadcast_unified_snapshot(session)
    return {"status": "success", "deleted": count, "message": "Historique de démonstration supprimé."}

@router.post("/seed-history")
def seed_history(session: Session = Depends(get_session)):
    """
    Génère 3 mois d'historique de consommation cohérents (avril, mai, juin 2026) en base de données.
    Si les appareils n'existent pas, ils sont créés.
    """
    # Récupérer ou créer les appareils (Master et un Node de démo)
    master = session.exec(select(Device).where(Device.role == RoleEnum.MASTER)).first()
    if not master:
        master = Device(mac_address="MAC_MASTER_DEMO", name="Compteur Central SBEE", role=RoleEnum.MASTER, status=StatusEnum.ONLINE)
        session.add(master)
        session.commit()
        session.refresh(master)

    node = session.exec(select(Device).where(Device.role == RoleEnum.NODE)).first()
    if not node:
        node = Device(mac_address="MAC_NODE_DEMO", name="Equipement Clim", role=RoleEnum.NODE, status=StatusEnum.ONLINE, master_device_id=master.id)
        session.add(node)
        session.commit()
        session.refresh(node)

    # Nettoyer l'ancien historique simulé de ces mois pour éviter les doublons
    start_date = datetime(2026, 4, 1, tzinfo=timezone.utc)
    end_date = datetime(2026, 6, 30, 23, 59, 59, tzinfo=timezone.utc)
    
    old_records = session.exec(
        select(Telemetry).where(Telemetry.timestamp >= start_date).where(Telemetry.timestamp <= end_date)
    ).all()
    for record in old_records:
        session.delete(record)
    session.commit()

    # Génération des relevés (1 relevé global par mois pour simplifier et accélérer)
    months_data = [
        {"month": 4, "master_kwh": 150.0, "node_kwh": 90.0},
        {"month": 5, "master_kwh": 180.0, "node_kwh": 110.0},
        {"month": 6, "master_kwh": 220.0, "node_kwh": 140.0},
    ]

    for data in months_data:
        m = data["month"]
        timestamp = datetime(2026, m, 15, 12, 0, 0, tzinfo=timezone.utc)
        
        # Telemetry Master
        t_master = Telemetry(
            device_id=master.id,
            voltage_v=220.0,
            current_a=5.0,
            power_w=1100.0,
            energy_kwh=data["master_kwh"],
            energy_delta_wh=data["master_kwh"] * 1000.0,
            frequency_hz=50.0,
            power_factor=0.9,
            timestamp=timestamp
        )
        # Telemetry Node
        t_node = Telemetry(
            device_id=node.id,
            voltage_v=220.0,
            current_a=3.0,
            power_w=660.0,
            energy_kwh=data["node_kwh"],
            energy_delta_wh=data["node_kwh"] * 1000.0,
            frequency_hz=50.0,
            power_factor=0.95,
            timestamp=timestamp
        )
        session.add(t_master)
        session.add(t_node)
        
    session.commit()
    logger.info("🌱 Seeding de l'historique (avril, mai, juin 2026) effectué avec succès.")
    return {"status": "success", "message": "Historique de démo injecté."}
