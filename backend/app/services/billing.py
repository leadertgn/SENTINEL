"""
Service de seed des données initiales :
- Appareils de démonstration (Master + Nodes)
- Tranches tarifaires SBEE scalables en base
"""
from sqlmodel import Session, select
from app.models.base import Device, BillingTariff, RoleEnum

# ─── Tranches SBEE ─────────────────────────────────────────────────────────────
SBEE_TARIFFS = [
    {"name": "Tranche Sociale", "min_kwh": 0.0,  "max_kwh": 50.0,  "price_per_kwh": 86.0},
    {"name": "Tranche Normale", "min_kwh": 50.0, "max_kwh": None,  "price_per_kwh": 130.0},
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
        select(BillingTariff).order_by(BillingTariff.min_kwh.desc())
    ).all()
    for t in tariffs:
        if kwh >= t.min_kwh:
            return t
    return None


def calculate_monthly_cost(kwh: float, session: Session) -> float:
    """
    Calcule le coût du mois selon la tranche active.
    La logique SBEE applique UN tarif unique sur la totalité de la conso du mois.
    """
    tariff = get_active_tariff(kwh, session)
    if not tariff:
        return 0.0
    return round(kwh * tariff.price_per_kwh, 2)
