from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.core.database import get_session
from app.models.base import Device, Telemetry, RoleEnum
from app.core.mqtt_client import send_mqtt_command

router = APIRouter()

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
    
    # 3. Barrière de Tension (Check via le Master)
    master = session.exec(select(Device).where(Device.role == RoleEnum.MASTER)).first()
    if master and not device.is_active: # On vérifie si on veut ALLUMER
        last_t = session.exec(
            select(Telemetry).where(Telemetry.device_id == master.id).order_by(Telemetry.timestamp.desc())
        ).first()
        
        if last_t:
            if last_t.voltage_v < 180.0 or last_t.voltage_v > 250.0:
                raise HTTPException(
                    status_code=400, 
                    detail=f"DANGER TENSION : {last_t.voltage_v}V. Action bloquée pour protéger vos moteurs."
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
