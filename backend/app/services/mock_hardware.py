import asyncio
import random
import logging
from datetime import datetime
from sqlmodel import Session, select
from app.core.database import engine
from app.core.config import settings
from app.models.base import Device, Telemetry, RoleEnum
from app.api.telemetry import manager
from app.services.billing import seed_tariffs, seed_devices, calculate_monthly_cost

logger = logging.getLogger("simulator")


async def simulate_hardware_data():
    """
    Simulateur PZEM-004T. Tourne en arrière-plan.
    - Lit les appareils depuis la DB (donc tout nouveau nœud ajouté sera automatiquement simulé).
    - Calcule le coût mensuel réel depuis les tranches SBEE stockées en base.
    - Réinitialise l'énergie du mois au 1er de chaque mois.
    """
    with Session(engine) as session:
        seed_tariffs(session)
        master, node1, node2 = seed_devices(session)
        if not master:
            master = session.exec(select(Device).where(Device.mac_address == "MAC_MASTER")).first()
            node1  = session.exec(select(Device).where(Device.mac_address == "MAC_NODE_1")).first()
            node2  = session.exec(select(Device).where(Device.mac_address == "MAC_NODE_2")).first()

    volts = 228.0
    ACCELERATION_FACTOR = settings.ACCELERATION_FACTOR

    # Compteurs d'énergie
    energy: dict[str, float] = {}
    current_month = datetime.utcnow().month

    while True:
        await asyncio.sleep(2)
        now = datetime.utcnow()

        # Réinitialiser les compteurs au 1er du mois
        if now.month != current_month:
            energy.clear()
            current_month = now.month
            logger.info("📅 Nouveau mois — compteurs d'énergie réinitialisés.")

        volts = max(215.0, min(240.0, volts + random.uniform(-1.2, 1.2)))
        time_h = (2.0 / 3600.0) * ACCELERATION_FACTOR

        with Session(engine) as session:
            # Lecture dynamique de TOUS les nœuds actifs (scalable)
            nodes = session.exec(
                select(Device).where(Device.role == RoleEnum.NODE)
            ).all()
            master_db = session.exec(
                select(Device).where(Device.role == RoleEnum.MASTER)
            ).first()

            if not master_db:
                continue

            pf = round(random.uniform(0.90, 0.99), 2)
            freq = round(50.0 + random.uniform(-0.15, 0.15), 2)

            # Simuler chaque nœud
            node_readings = []
            total_node_power = 0.0

            for node in nodes:
                node_on = node.is_active
                # Profil de puissance réaliste selon le type de nœud
                if "Climatiseur" in node.name:
                    w = random.uniform(900, 1300) if node_on else 0.0
                elif "Chauffe" in node.name:
                    w = random.uniform(1500, 2200) if node_on else 0.0
                else:
                    w = random.uniform(50, 400) if node_on else 0.0

                energy[node.mac_address] = energy.get(node.mac_address, 0.0) + (w / 1000.0) * time_h
                kwh = energy[node.mac_address]
                delta_wh = (w * time_h) # w est en W, time_h en h -> Wh

                telemetry = Telemetry(
                    device_id=node.id,
                    voltage_v=volts,
                    current_a=round(w / volts, 3),
                    power_w=round(w, 2),
                    energy_kwh=round(kwh, 4),
                    energy_delta_wh=round(delta_wh, 4),
                    frequency_hz=freq,
                    power_factor=pf,
                )
                session.add(telemetry)
                total_node_power += w
                node_readings.append({
                    "name": node.name,
                    "mac": node.mac_address,
                    "is_active": node_on,
                    "power": round(w, 2),
                    "voltage_v": round(volts, 1),
                    "current_a": round(w / volts, 3),
                    "energy_kwh": round(kwh, 3),
                    "power_factor": pf,
                })
                total_node_power += 0  # évite double count

            # Charge inconnue (différentiel)
            w_unknown = random.uniform(80, 400)
            energy["unknown"] = energy.get("unknown", 0.0) + (w_unknown / 1000.0) * time_h
            w_master = total_node_power + w_unknown

            energy[master_db.mac_address] = energy.get(master_db.mac_address, 0.0) + (w_master / 1000.0) * time_h
            kwh_master = energy[master_db.mac_address]
            delta_wh_master = w_master * time_h

            # Calcul du coût mensuel depuis la DB
            cost = calculate_monthly_cost(kwh_master, session)
            active_tariff = None
            from app.services.billing import get_active_tariff
            t = get_active_tariff(kwh_master, session)
            if t:
                active_tariff = {"name": t.name, "price_per_kwh": t.price_per_kwh}

            telemetry_master = Telemetry(
                device_id=master_db.id,
                voltage_v=round(volts, 1),
                current_a=round(w_master / volts, 3),
                power_w=round(w_master, 2),
                energy_kwh=round(kwh_master, 4),
                energy_delta_wh=round(delta_wh_master, 4),
                frequency_hz=freq,
                power_factor=pf,
            )
            session.add(telemetry_master)
            session.commit()

        payload = {
            "type": "TELEMETRY_UPDATE",
            "timestamp": now.isoformat(),
            "master_power": round(w_master, 2),
            "voltage": round(volts, 1),
            "current": round(w_master / volts, 3),
            "power_factor": pf,
            "frequency_hz": freq,
            "total_kwh": round(kwh_master, 3),
            "unknown_power": round(w_unknown, 2),
            "nodes": node_readings,
            # Facturation mensuelle
            "billing": {
                "month_kwh": round(kwh_master, 3),
                "estimated_cost_fcfa": cost,
                "active_tariff": active_tariff,
            },
        }
        await manager.broadcast(payload)
