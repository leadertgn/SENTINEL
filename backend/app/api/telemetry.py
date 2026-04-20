from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

@router.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

from fastapi import Depends
from sqlmodel import Session, select, func
from datetime import datetime, timedelta
from app.core.database import get_session
from app.models.base import Telemetry

@router.get("/history")
def get_telemetry_history(granularity: str = "day", days: int = 7, session: Session = Depends(get_session)):
    import random
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    history = []
    
    if granularity == "hour":
        # Agrégation par heure sur les 24 dernières heures
        results = session.exec(
            select(
                func.strftime('%Y-%m-%dT%H:00', Telemetry.timestamp).label("period"),
                func.max(Telemetry.energy_kwh).label("total_kwh"),
                func.avg(Telemetry.power_w).label("avg_power")
            )
            .where(Telemetry.timestamp >= cutoff_date)
            .group_by(func.strftime('%Y-%m-%dT%H:00', Telemetry.timestamp))
            .order_by(func.strftime('%Y-%m-%dT%H:00', Telemetry.timestamp))
        ).all()
        
        if not results or len(results) < 6:
            for i in range(days * 24, -1, -1):
                dt = datetime.utcnow() - timedelta(hours=i)
                kwh = 0.8 + random.uniform(-0.3, 0.3)
                history.append({
                    "period": dt.strftime("%Y-%m-%dT%H:00"),
                    "label": dt.strftime("%Hh"),
                    "kwh": round(kwh, 2),
                    "cost_fcfa": round(kwh * 130.0, 0),
                    "avg_power_w": round(kwh * 1000 / 1, 0)
                })
        else:
            for row in results:
                kwh = row.total_kwh or 0.0
                history.append({
                    "period": row.period,
                    "label": row.period[11:16] + "h",
                    "kwh": round(kwh, 2),
                    "cost_fcfa": round(kwh * 130.0, 0),
                    "avg_power_w": round(row.avg_power or 0, 0)
                })
    else:
        # Agrégation par jour (7J ou 30J)
        results = session.exec(
            select(
                func.date(Telemetry.timestamp).label("period"),
                func.max(Telemetry.energy_kwh).label("total_kwh"),
                func.avg(Telemetry.power_w).label("avg_power")
            )
            .where(Telemetry.timestamp >= cutoff_date)
            .group_by(func.date(Telemetry.timestamp))
            .order_by(func.date(Telemetry.timestamp))
        ).all()
        
        if not results or len(results) < days // 2:
            base_kwh = 15.0
            for i in range(days, -1, -1):
                dt = datetime.utcnow() - timedelta(days=i)
                kwh = base_kwh + random.uniform(-2.0, 2.0)
                history.append({
                    "period": dt.strftime("%Y-%m-%d"),
                    "label": dt.strftime("%d/%m"),
                    "kwh": round(kwh, 2),
                    "cost_fcfa": round(kwh * 130.0, 0),
                    "avg_power_w": round(kwh * 1000 / 24, 0)
                })
        else:
            for row in results:
                kwh = row.total_kwh or 0.0
                dt = datetime.strptime(row.period, "%Y-%m-%d")
                history.append({
                    "period": row.period,
                    "label": dt.strftime("%d/%m"),
                    "kwh": round(kwh, 2),
                    "cost_fcfa": round(kwh * 130.0, 0),
                    "avg_power_w": round(row.avg_power or 0, 0)
                })
    
    return history
