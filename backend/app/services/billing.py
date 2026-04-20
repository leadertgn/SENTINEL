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
    Calcul SBEE progressif par paliers (conforme au cahier des charges).
    
    Chaque tranche est facturée à son propre tarif :
    - kWh dans [0 ; 50]    → 86 FCFA/kWh  (Tranche Sociale)
    - kWh au-delà de 50    → 130 FCFA/kWh (Tranche Normale)
    
    Exemple : 80 kWh → (50 × 86) + (30 × 130) = 4 300 + 3 900 = 8 200 FCFA
    """
    tariffs = session.exec(
        select(BillingTariff).order_by(BillingTariff.min_kwh)
    ).all()
    
    if not tariffs:
        return 0.0
    
    total_cost = 0.0
    remaining_kwh = kwh
    
    for i, tariff in enumerate(tariffs):
        if remaining_kwh <= 0:
            break
        
        # Calculer la borne supérieure de cette tranche
        if tariff.max_kwh is not None:
            tranche_size = tariff.max_kwh - tariff.min_kwh
        else:
            # Dernière tranche : illimitée — on prend tout le reste
            tranche_size = remaining_kwh
        
        kwh_in_this_tranche = min(remaining_kwh, tranche_size)
        total_cost += kwh_in_this_tranche * tariff.price_per_kwh
        remaining_kwh -= kwh_in_this_tranche
    
    return round(total_cost, 2)
