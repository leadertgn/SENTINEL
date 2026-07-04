
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.database import create_db_and_tables
from app.api import telemetry, devices, simulation
from app.core.mqtt_client import start_mqtt_client
from sqlmodel import Session, select
from app.core.database import get_session
from app.models.base import BillingTariff
from fastapi import Depends
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
import asyncio
from datetime import datetime, timezone, timedelta
from app.core.database import engine
from app.models.base import Device, Telemetry, StatusEnum
from sqlalchemy import desc

async def device_watchdog():
    while True:
        await asyncio.sleep(60) # Vérification toutes les minutes
        try:
            with Session(engine) as session:
                devices = session.exec(select(Device).where(Device.status == StatusEnum.ONLINE)).all()
                changed = False
                for d in devices:
                    last_t = session.exec(select(Telemetry).where(Telemetry.device_id == d.id).order_by(desc(Telemetry.timestamp))).first()
                    if last_t:
                        # SQLite relit les datetimes sans fuseau (naive) : on les
                        # normalise en UTC avant toute soustraction pour éviter
                        # « can't subtract offset-naive and offset-aware datetimes ».
                        last_ts = last_t.timestamp
                        if last_ts.tzinfo is None:
                            last_ts = last_ts.replace(tzinfo=timezone.utc)
                        if datetime.now(timezone.utc) - last_ts > timedelta(minutes=3):
                            d.status = StatusEnum.OFFLINE
                            d.is_active = False # On suppose coupé par sécurité
                            session.add(d)
                            changed = True
                            logging.getLogger("watchdog").info(f"🔴 Watchdog : Appareil {d.mac_address} déclaré HORS-LIGNE (Timeout 3min).")
                
                if changed:
                    session.commit()
                    from app.core.mqtt_client import _broadcast_unified_snapshot
                    _broadcast_unified_snapshot(session)
        except Exception as e:
            logging.getLogger("watchdog").error(f"Watchdog error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    
    # Initialisation de la queue asynchrone pour le broadcast
    from app.core import mqtt_client
    mqtt_client._broadcast_queue = asyncio.Queue()
    asyncio.create_task(mqtt_client.queue_drainer())
    
    # Injection des données initiales (Tarifs SBEE)
    try:
        from app.services.billing import seed_tariffs
        with Session(engine) as session:
            seed_tariffs(session)
    except Exception as e:
        logging.getLogger("main").error(f"Erreur lors du seeding: {e}")

    # Démarrage du client MQTT (vrai matériel ou simulation au même niveau)
    start_mqtt_client()
    
    # Lancement du chien de garde en tâche de fond
    asyncio.create_task(device_watchdog())
    
    if settings.SIMULATION_MODE:
        logging.getLogger("main").info("🔵 MODE SIMULATION firmware attendu via MQTT")
    else:
        logging.getLogger("main").info("🟢 MODE PRODUCTION — En attente des trames MQTT réelles")
    yield


app = FastAPI(title="SENTINEL API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # En développement: localhost Vite. En production: changer ALLOWED_ORIGINS dans .env
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router)
app.include_router(telemetry.router)
app.include_router(simulation.router)

# Route tariffs (scalable depuis la DB)
@app.get("/api/tariffs")
def get_tariffs(session: Session = Depends(get_session)):
    return session.exec(select(BillingTariff).order_by(BillingTariff.min_kwh)).all()


# Simulateur de facturation : saisir un index (kWh) et obtenir le détail par
# palier + le total. Reproduit en direct l'exemple du mémoire (280 kWh → 34 950 FCFA).
@app.get("/api/billing/simulate")
def simulate_billing(kwh: float, session: Session = Depends(get_session)):
    from app.services.billing import calculate_monthly_cost, get_active_tariff
    kwh = max(0.0, kwh)
    calc = calculate_monthly_cost(kwh, session)
    tariff = get_active_tariff(kwh, session)
    return {
        "kwh": round(kwh, 3),
        "active_tariff": tariff.name if tariff else "—",
        **calc,
    }

@app.get("/")
def read_root():
    return {"message": "API SENTINEL (Industrielle) est en ligne."}
