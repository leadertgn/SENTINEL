# ⚙️ SENTINEL — Backend (FastAPI)

Moteur de traitement du système SENTINEL. Il consomme la télémétrie MQTT des ESP, agrège les mesures, calcule l'audit différentiel et la facturation SBEE, puis diffuse un instantané unifié au frontend via **WebSocket**.

## 🧱 Stack technique

- **FastAPI** — API REST + WebSocket
- **SQLModel / SQLAlchemy** — ORM, base **SQLite** (`database.db`)
- **paho-mqtt** — client MQTT (abonnement aux topics `sbee/devices/+/…`)
- **Alembic** — migrations de schéma
- **Pydantic Settings** — configuration via `.env`

## 📂 Arborescence

```text
backend/
├── main.py                     # Point d'entrée FastAPI, lifespan, watchdog appareils
├── app/
│   ├── core/
│   │   ├── config.py           # Settings (.env) : MQTT, DB, SBEE, simulation
│   │   ├── database.py         # Engine SQLite, create_db_and_tables, get_session
│   │   └── mqtt_client.py      # Client MQTT + construction du snapshot unifié + broadcast
│   ├── api/
│   │   ├── devices.py          # /api/devices — liste + toggle relais
│   │   ├── telemetry.py        # /api/telemetry — WebSocket, history, billing-report
│   │   └── simulation.py       # /api/sim — voltage, reset, seed-history, clear-history
│   ├── models/base.py          # Device, Telemetry, BillingTariff, StatusEnum
│   └── services/
│       ├── billing.py          # Tarifs SBEE + calcul du coût progressif
│       └── mock_hardware.py    # Génération de données simulées
├── alembic/                    # Migrations
├── requirements.txt
└── .env.example
```

## 🚀 Installation & lancement

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (source .venv/bin/activate sous Linux)
pip install -r requirements.txt
copy .env.example .env           # puis ajuster les valeurs
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

- Docs interactives (Swagger) : http://localhost:8000/docs
- `--host 0.0.0.0` permet aux ESP du réseau local d'atteindre l'API si nécessaire.

## 🔧 Configuration (`.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `DATABASE_URL` | `sqlite:///database.db` | Base de données |
| `SIMULATION_MODE` | `true` | Mode d'affichage (simulateur / production) |
| `MQTT_BROKER` | `127.0.0.1` | Adresse du broker Mosquitto |
| `MQTT_PORT` | `1883` | Port MQTT |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | vide | Auth MQTT (optionnelle) |
| `MQTT_TOPIC_DATA/CMD/STATUS` | `sbee/devices/+/…` | Topics abonnés |
| `DEVICE_SHARED_SECRET` | — | **Doit correspondre** à `DEVICE_SECRET` des firmwares |
| `ACCELERATION_FACTOR` | `1800` | Accélérateur temporel de simulation |

> `FIXED_PREMIUM_PER_KVA` (500 FCFA/kVA) et `SUBSCRIBED_KVA` sont **informatifs** : ils ne sont PAS ajoutés au coût énergie, pour rester conforme au chiffre du mémoire (280 kWh → 34 950 FCFA).

## 📡 Flux de données

1. Les ESP publient sur `sbee/devices/{mac}/data` et `/status`.
2. `mqtt_client.py` valide la clé secrète, enregistre la `Telemetry`, met à jour le `Device`.
3. Un **snapshot unifié** (métriques Master, Nodes, charge inconnue, facturation) est reconstruit et poussé dans une file asyncio.
4. Le WebSocket `/api/telemetry/ws/telemetry` diffuse ce snapshot au frontend.
5. Le **watchdog** (`main.py`) passe un appareil HORS-LIGNE si sa dernière télémétrie date de plus de 3 min.

### Fraîcheur des mesures
`mqtt_client.py` applique un seuil `TELEMETRY_FRESH_S = 180 s` : au-delà, les métriques d'un appareil sont considérées **périmées** et ne s'affichent plus comme « live » (évite qu'un ancien seed apparaisse comme une consommation en cours).

## 🌐 Endpoints principaux

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/` | Ping API |
| `GET` | `/api/devices/` | Liste des appareils |
| `POST` | `/api/devices/{mac}/toggle` | Bascule le relais d'un Node |
| `WS` | `/api/telemetry/ws/telemetry` | Flux temps réel (snapshot unifié) |
| `GET` | `/api/telemetry/history` | Historique de télémétrie |
| `GET` | `/api/telemetry/billing-report` | Rapport de facturation |
| `GET` | `/api/telemetry/billing-current` | Facturation du mois en cours |
| `GET` | `/api/tariffs` | Grille tarifaire SBEE |
| `GET` | `/api/billing/simulate?kwh=280` | Simulateur de facture par palier |
| `POST` | `/api/sim/voltage` | Injection d'une tension simulée (test protection) |
| `POST` | `/api/sim/reset` | Retour au hardware réel |
| `POST` | `/api/sim/seed-history` | Injecte 3 mois d'historique de démo |
| `POST` | `/api/sim/clear-history` | Supprime l'historique de démo |

## 🗄️ Base de données & migrations

```bash
alembic upgrade head          # applique les migrations
alembic revision --autogenerate -m "message"   # nouvelle migration
```
Les tables sont aussi créées automatiquement au démarrage (`create_db_and_tables`), et les tarifs SBEE sont injectés (`seed_tariffs`).
