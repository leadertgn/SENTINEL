from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.core.database import get_session
from app.models.base import Device, Telemetry

router = APIRouter()

@router.get("/", response_model=List[Device])
def get_devices(session: Session = Depends(get_session)):
    devices = session.exec(select(Device)).all()
    return devices

@router.post("/{device_id}/toggle", response_model=Device)
def toggle_device(device_id: int, session: Session = Depends(get_session)):
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")
        
    from app.models.base import RoleEnum
    if device.role == RoleEnum.MASTER:
        raise HTTPException(
            status_code=403, 
            detail="⚠️ Action refusée : Vous ne pouvez pas couper le disjoncteur général via l'interface."
        )
    
    # RÈGLE MÉTIER : SÉCURITÉ DU RELAIS
    # Vérification de la dernière tension du réseau électrique
    last_telemetry = session.exec(select(Telemetry).order_by(Telemetry.timestamp.desc())).first()
    
    # Si on essaie d'allumer (False -> True)
    if not device.is_active and last_telemetry:
        if last_telemetry.voltage_v < 180.0 or last_telemetry.voltage_v > 250.0:
            raise HTTPException(
                status_code=400, 
                detail=f"Sécurité activée : Tension anormale ({last_telemetry.voltage_v}V). DANGER COMPRESSEUR."
            )
            
    # Si tout va bien, ou si on veut éteindre, on bascule
    device.is_active = not device.is_active
    session.add(device)
    session.commit()
    session.refresh(device)
    
    return device
