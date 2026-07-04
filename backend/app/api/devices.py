from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from sqlalchemy import desc
from typing import List
import logging
from app.core.database import get_session
from app.models.base import Device, Telemetry, RoleEnum
from app.core.mqtt_client import (
    send_mqtt_command,
    effective_master_voltage,
    VOLTAGE_MIN,
    VOLTAGE_MAX,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/devices", tags=["Devices"])

@router.get("/", response_model=List[Device])
def get_devices(session: Session = Depends(get_session)):
    return session.exec(select(Device)).all()

@router.post("/{mac}/toggle", response_model=Device)
def toggle_device(mac: str, session: Session = Depends(get_session)):
    # 1. Récupération de l'appareil par MAC
    device = session.exec(select(Device).where(Device.mac_address == mac)).first()
    if not device:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")
        
    # 2. Règle : Interdiction de couper le Master
    if device.role == RoleEnum.MASTER:
        raise HTTPException(
            status_code=403, 
            detail="⚠️ Sécurité : Le Master ne peut pas être désactivé logiciellement."
        )
    
    # 3. Barrière de Tension (tension effective : simulée si un scénario est actif,
    #    sinon dernière mesure réelle du Master). On ne vérifie qu'à l'ALLUMAGE.
    if not device.is_active:
        v = effective_master_voltage(session)
        if v is not None and (v < VOLTAGE_MIN or v > VOLTAGE_MAX):
            raise HTTPException(
                status_code=400,
                detail=f"DANGER TENSION : {v}V. Action bloquée pour protéger vos moteurs."
            )

    # 4. Bascule de l'état et envoi MQTT
    new_action = "OFF" if device.is_active else "ON"
    
    # On met à jour en local d'abord (optimisme)
    device.is_active = not device.is_active
    session.add(device)
    session.commit()
    session.refresh(device)
    
    # Publication de l'ordre réel sur le bus MQTT
    success = send_mqtt_command(device.mac_address, new_action)
    if not success:
        logger.warning(f"⚠️ Commande MQTT échouée pour {mac}")
    
    return device
