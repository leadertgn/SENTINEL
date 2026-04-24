from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field
from enum import Enum

class RoleEnum(str, Enum):
    MASTER = "MASTER"
    NODE = "NODE"

class StatusEnum(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    FAULT = "FAULT"

class Device(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    mac_address: str = Field(index=True, unique=True)
    name: str
    role: RoleEnum
    status: StatusEnum = Field(default=StatusEnum.OFFLINE)
    is_active: bool = Field(default=True) # État du relais
    secret_key: str = Field(default="SENTINEL_DEFAULT_KEY") # Clé d'authentification
    master_device_id: Optional[int] = Field(default=None, foreign_key="device.id")

class Telemetry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    device_id: int = Field(foreign_key="device.id")
    
    # Données du PZEM-004T explicites
    voltage_v: float
    current_a: float
    power_w: float
    energy_kwh: float
    energy_delta_wh: float = Field(default=0.0) # Consommation de l'intervalle (Wh)
    frequency_hz: float
    power_factor: float
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BillingTariff(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(default="Tranche")
    min_kwh: float
    max_kwh: Optional[float] = None
    price_per_kwh: float
