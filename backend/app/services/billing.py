"""
Service de seed des données initiales :
- Appareils de démonstration (Master + Nodes)
- Tranches tarifaires SBEE scalables en base
"""
from sqlmodel import Session, select
from sqlalchemy import desc
from app.models.base import Device, BillingTariff, RoleEnum

# ─── Tranches SBEE (Postpayé Basse Tension) ────────────────────────────────────
SBEE_TARIFFS = [
    {"name": "Tranche Sociale", "min_kwh": 0.0,   "max_kwh": 20.0,   "price_per_kwh": 88.0},
    {"name": "Tranche 1",       "min_kwh": 20.0,  "max_kwh": 250.0,  "price_per_kwh": 125.0},
    {"name": "Tranche 2",       "min_kwh": 250.0, "max_kwh": None,   "price_per_kwh": 148.0},
]

# ─── Appareils de démo ─────────────────────────────────────────────────────────
DEMO_DEVICES = [
    {"mac_address": "MAC_MASTER", "name": "Compteur Central SBEE", "role": RoleEnum.MASTER},
    {"mac_address": "MAC_NODE_1", "name": "Climatiseur Salon",      "role": RoleEnum.NODE, "master_mac": "MAC_MASTER"},
    {"mac_address": "MAC_NODE_2", "name": "Chauffe-eau",            "role": RoleEnum.NODE, "master_mac": "MAC_MASTER"},
]


def seed_tariffs(session: Session):
    """Insère les tranches SBEE si elles n'existent pas déjà."""
    existing = session.exec(select(BillingTariff)).all()
    if existing:
        return
    for t in SBEE_TARIFFS:
        session.add(BillingTariff(**t))
    session.commit()


def seed_devices(session: Session):
    """Insère les appareils de démo si le Master n'existe pas encore."""
    master = session.exec(
        select(Device).where(Device.mac_address == "MAC_MASTER")
    ).first()
    if master:
        return None, None, None

    import logging
    logging.getLogger("seed").info("🌱 Seeding appareils et tranches SBEE…")

    master = Device(mac_address="MAC_MASTER", name="Compteur Central SBEE", role=RoleEnum.MASTER)
    node1 = Device(mac_address="MAC_NODE_1", name="Climatiseur Salon", role=RoleEnum.NODE)
    node2 = Device(mac_address="MAC_NODE_2", name="Chauffe-eau", role=RoleEnum.NODE)

    session.add_all([master, node1, node2])
    session.commit()
    session.refresh(master); session.refresh(node1); session.refresh(node2)

    node1.master_device_id = master.id
    node2.master_device_id = master.id
    session.add_all([node1, node2])
    session.commit()
    session.refresh(master); session.refresh(node1); session.refresh(node2)

    return master, node1, node2


def get_active_tariff(kwh: float, session: Session) -> BillingTariff | None:
    """Retourne la tranche applicable en fonction de la conso totale du mois."""
    tariffs = session.exec(
        select(BillingTariff).order_by(desc(BillingTariff.min_kwh))
    ).all()
    for t in tariffs:
        if kwh >= t.min_kwh:
            return t
    return None


def calculate_monthly_cost(kwh: float, session: Session) -> dict:
    """
    Calcul SBEE progressif par paliers (Postpayé).
    Applique la TVA de 18% uniquement sur les tranches supérieures (tranches non-sociales).
    """
    tariffs = session.exec(
        select(BillingTariff).order_by(BillingTariff.min_kwh)
    ).all()
    
    if not tariffs:
        return {
            "energy_cost_ht": 0.0,
            "energy_cost": 0.0,
            "tva_fcfa": 0.0,
            "fixed_premium": 0.0,
            "total_fcfa": 0.0,
        }
    
    energy_cost_ht = 0.0
    tva_fcfa = 0.0
    remaining_kwh = kwh
    
    for tariff in tariffs:
        if remaining_kwh <= 0:
            break
        
        if tariff.max_kwh is not None:
            tranche_size = tariff.max_kwh - tariff.min_kwh
        else:
            tranche_size = remaining_kwh
        
        kwh_in_this_tranche = min(remaining_kwh, tranche_size)

        cost_tranche_ht = kwh_in_this_tranche * tariff.price_per_kwh
        energy_cost_ht += cost_tranche_ht

        # La tranche sociale (0-20 kWh) est exonérée de TVA. Les tranches supérieures y sont assujetties (18%)
        if tariff.min_kwh >= 20.0:
            tva_fcfa += cost_tranche_ht * 0.18

        remaining_kwh -= kwh_in_this_tranche
    
    return {
        "energy_cost_ht": round(energy_cost_ht, 2),
        "energy_cost": round(energy_cost_ht, 2),
        "tva_fcfa": round(tva_fcfa, 2),
        "fixed_premium": 0.0,  # Conservé dans la structure pour compatibilité
        "total_fcfa": round(energy_cost_ht + tva_fcfa, 2)
    }
