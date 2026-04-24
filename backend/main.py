
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.database import create_db_and_tables
from app.api import telemetry, devices
from app.core.mqtt_client import start_mqtt_client
from sqlmodel import Session, select
from app.core.database import get_session
from app.models.base import BillingTariff
from fastapi import Depends

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    # Démarrage du client MQTT (vrai matériel ou simulation au même niveau)
    start_mqtt_client()
    if settings.SIMULATION_MODE:
        import logging
        logging.getLogger("main").info("🔵 MODE SIMULATION firmware attendu via MQTT")
    else:
        import logging
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

# Route tariffs (scalable depuis la DB)
@app.get("/api/tariffs")
def get_tariffs(session: Session = Depends(get_session)):
    return session.exec(select(BillingTariff).order_by(BillingTariff.min_kwh)).all()

@app.get("/")
def read_root():
    return {"message": "API SENTINEL (Industrielle) est en ligne."}
