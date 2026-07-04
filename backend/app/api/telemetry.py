from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
from fastapi import Depends
from sqlmodel import Session, select, func
from datetime import datetime, timedelta, timezone
from app.core.database import get_session
from app.models.base import Telemetry

router = APIRouter(prefix="/api/telemetry", tags=["Telemetry"])

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
            except Exception as e:
                pass

manager = ConnectionManager()

@router.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket, session: Session = Depends(get_session)):
    await manager.connect(websocket)
    
    # Envoi immédiat de l'état actuel au nouveau client
    try:
        from app.core.mqtt_client import _build_snapshot
        snapshot = _build_snapshot(session)
        if snapshot:
            await websocket.send_json(snapshot)
    except Exception as e:
        pass

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.get("/history")
def get_telemetry_history(granularity: str = "day", days: int = 7, session: Session = Depends(get_session)):
    import random
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    
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
                dt = datetime.now(timezone.utc) - timedelta(hours=i)
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
                period, total_kwh, avg_power = row
                kwh = total_kwh or 0.0
                history.append({
                    "period": period,
                    "label": period[11:16] + "h",
                    "kwh": round(kwh, 2),
                    "cost_fcfa": round(kwh * 130.0, 0),
                    "avg_power_w": round(avg_power or 0, 0)
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
                dt = datetime.now(timezone.utc) - timedelta(days=i)
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
                period, total_kwh, avg_power = row
                kwh = total_kwh or 0.0
                dt = datetime.strptime(period, "%Y-%m-%d")
                history.append({
                    "period": period,
                    "label": dt.strftime("%d/%m"),
                    "kwh": round(kwh, 2),
                    "cost_fcfa": round(kwh * 130.0, 0),
                    "avg_power_w": round(avg_power or 0, 0)
                })
    
    return history

@router.get("/billing-report")
def get_billing_report(granularity: str = "month", session: Session = Depends(get_session)):
    from app.models.base import Device, RoleEnum, BillingTariff
    
    if granularity == "day":
        period_expr = func.strftime('%Y-%m-%d', Telemetry.timestamp)
    elif granularity == "week":
        period_expr = func.strftime('%Y-%W', Telemetry.timestamp)
    else: # month
        period_expr = func.strftime('%Y-%m', Telemetry.timestamp)
        
    # On somme les deltas (vrais incréments) par période et par device
    query = session.exec(
        select(
            period_expr.label("period"),
            Telemetry.device_id,
            (func.sum(Telemetry.energy_delta_wh) / 1000.0).label("consumption")
        )
        .group_by(period_expr, Telemetry.device_id)
        .order_by(period_expr)
    ).all()
    
    devices = session.exec(select(Device)).all()
    devices_dict = {d.id: d for d in devices}
    
    report_dict = {}
    for row in query:
        period, device_id, consumption = row
        if period not in report_dict:
            report_dict[period] = {
                "period": period,
                "master": 0.0,
                "nodes": {},
                "unknown": 0.0,
                "cost_fcfa": 0.0
            }
            
        dev = devices_dict.get(device_id)
        if not dev: continue
        
        # S'assurer d'initialiser les clés pour tous les nodes connus
        for d in devices:
            if d.role == RoleEnum.NODE and d.name not in report_dict[period]["nodes"]:
                report_dict[period]["nodes"][d.name] = 0.0
                
        if dev.role == RoleEnum.MASTER:
            report_dict[period]["master"] = round(consumption or 0.0, 3)
        elif dev.role == RoleEnum.NODE:
            report_dict[period]["nodes"][dev.name] = round(consumption or 0.0, 3)
            
    from app.services.billing import calculate_monthly_cost
    
    result = []
    for period, data in report_dict.items():
        master_kwh = data["master"]
        nodes_sum = sum(data["nodes"].values())
        data["unknown"] = round(max(0, master_kwh - nodes_sum), 3)
        
        # Calcul du coût exact basé sur les tranches (sans frais fixes)
        billing_calc = calculate_monthly_cost(master_kwh, session)
        data["cost_fcfa"] = int(billing_calc["total_fcfa"])
        
        result.append(data)
        
    node_names = [d.name for d in devices if d.role == RoleEnum.NODE]
    
    return {"data": result, "node_names": node_names}


@router.get("/billing-current")
def get_billing_current(session: Session = Depends(get_session)):
    """
    Retourne la consommation du mois courant pour le Master et chaque Node,
    en sommant les deltas (energy_delta_wh) depuis le 1er du mois.
    """
    from app.models.base import Device, RoleEnum
    from app.services.billing import calculate_monthly_cost, get_active_tariff
    
    now = datetime.now(timezone.utc)
    # Premier jour du mois courant à minuit UTC
    first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    devices = session.exec(select(Device)).all()
    result = {}
    
    for dev in devices:
        total_wh = session.exec(
            select(func.sum(Telemetry.energy_delta_wh))
            .where(Telemetry.device_id == dev.id)
            .where(Telemetry.timestamp >= first_of_month)
        ).first() or 0.0
        result[dev.id] = {"name": dev.name, "role": dev.role, "kwh_month": round(total_wh / 1000.0, 3)}
    
    master = next((v for v in result.values() if v["role"] == RoleEnum.MASTER), None)
    master_kwh = master["kwh_month"] if master else 0.0
    
    billing_calc = calculate_monthly_cost(master_kwh, session)
    tariff = get_active_tariff(master_kwh, session)
    
    nodes_kwh = sum(v["kwh_month"] for v in result.values() if v["role"] == RoleEnum.NODE)
    
    return {
        "kwh_month": master_kwh,
        "cost_fcfa": int(billing_calc["total_fcfa"]),
        "energy_cost": int(billing_calc["energy_cost"]),
        "fixed_premium": int(billing_calc["fixed_premium"]),
        "active_tariff": tariff.name if tariff else "Standard",
        "price_per_kwh": tariff.price_per_kwh if tariff else 88,
        "unknown_kwh": round(max(0, master_kwh - nodes_kwh), 3),
        "nodes": [
            {"name": v["name"], "kwh_month": v["kwh_month"]}
            for v in result.values() if v["role"] == RoleEnum.NODE
        ],
        "period": first_of_month.strftime("%Y-%m")
    }
