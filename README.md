# 🛡️ SENTINEL — Supervision Énergétique Résidentielle Intelligente

**SENTINEL** est une solution IoT distribuée de télégestion et d'audit énergétique résidentiel, conçue pour le contexte du réseau **SBEE (Bénin)**. Le système mesure la consommation en temps réel, calcule la facturation progressive par tranches, protège les équipements contre les instabilités de tension et permet le pilotage à distance des charges.

> Projet de Fin d'Études (PFE) — soutenance **8 juillet 2026**.

---

## 🏗️ Architecture du système

```
     ┌──────────────┐        ┌──────────────┐
     │  MASTER ESP32│        │  NODE ESP8266│
     │  PZEM + LCD  │        │  PZEM + Relais│
     └──────┬───────┘        └──────┬───────┘
            │  MQTT (JSON)          │
            └───────────┬───────────┘
                        ▼
                 ┌─────────────┐   Mosquitto
                 │   BROKER     │   (127.0.0.1:1883)
                 │  MQTT        │
                 └──────┬───────┘
                        ▼
                 ┌─────────────┐   FastAPI + SQLModel (SQLite)
                 │   BACKEND    │   REST + WebSocket
                 └──────┬───────┘
                        ▼ WebSocket temps réel
                 ┌─────────────┐   React 19 + Vite + Tailwind 4
                 │   FRONTEND   │   Dashboard, Facturation, Équipements
                 └─────────────┘
```

Topologie **Master / Node** :

| Élément | Matériel | Rôle |
|---|---|---|
| **Master** | ESP32 + PZEM-004T + LCD 16x2 I2C | Mesure générale au compteur, barrière de sécurité tension, affichage local |
| **Node** | ESP8266 (NodeMCU) + PZEM-004T + relais | Mesure d'une charge individuelle + coupure/réarmement ON-OFF |
| **Broker** | Mosquitto | Bus MQTT entre firmwares et backend |
| **Backend** | FastAPI, SQLModel, SQLite, paho-mqtt | Agrégation, calcul des deltas, audit différentiel, facturation, WebSocket |
| **Frontend** | React 19, Vite, Tailwind 4, Zustand, Recharts | Dashboard temps réel |

---

## ✨ Fonctionnalités clés

- **Audit différentiel temps réel** — Charge inconnue : `P_inconnue = P_Master − Σ P_Nodes`.
- **Facturation progressive SBEE** — Coût en FCFA par tranches tarifaires (référence mémoire : **280 kWh → 34 950 FCFA**, sans TVA sur le réseau SBEE).
- **Barrière de sécurité électrique** — Coupure automatique des charges en cas de tension haute/basse (protection compresseurs/moteurs).
- **Portail WiFi de secours (AP ouvert)** — Si le WiFi domicile est indisponible, l'ESP ouvre un point d'accès *sans mot de passe* pour reconfigurer le réseau.
- **Résilience hors-ligne** — Les mesures sont mises en file d'attente en Flash (LittleFS) et rejouées à la reconnexion.
- **Watchdog appareils** — Un appareil sans télémétrie depuis 3 min est marqué HORS-LIGNE côté backend.

---

## 📂 Structure du projet

```text
SENTINEL/
├── start-sentinel.ps1      # Démarre broker + backend + frontend (Windows, sans Docker)
├── firmware/
│   ├── Master/             # ESP32 — mesure générale + LCD          → firmware/Master/README.md
│   ├── node-esp8266/       # ESP8266 — relais + mesure locale
│   └── NodeSimulator/      # Simulateurs Python (tests sans matériel)
├── backend/                # API FastAPI + client MQTT + SQLModel    → backend/README.md
└── frontend/               # Dashboard React / Vite                  → frontend/README.md
```

Chaque sous-système a son propre README détaillé.

---

## 📡 Contrat de données MQTT

**Topics** (`{mac}` = adresse MAC sans `:`) :

| Topic | Sens | Contenu |
|---|---|---|
| `sbee/devices/{mac}/data` | ESP → Backend | Télémétrie (mesures) |
| `sbee/devices/{mac}/status` | ESP → Backend | ONLINE / OFFLINE (retenu, + LWT) |
| `sbee/devices/{mac}/cmd` | Backend → ESP | Commande relais `{"action":"ON\|OFF"}` |

**Payload de télémétrie** (`/data`) :
```json
{
  "mac_address": "A1B2C3D4E5F6",
  "secret_key": "…",
  "role": "MASTER",
  "timestamp": 1720000000,
  "voltage_v": 220.5,
  "current_a": 1.2,
  "power_w": 260.0,
  "energy_kwh": 45.12,
  "frequency_hz": 50.0,
  "pf": 0.98,
  "is_active": true
}
```

---

## 🚀 Démarrage rapide

### Prérequis
- **Mosquitto** (broker MQTT) — https://mosquitto.org/download/
- **Python 3.10+**
- **Node.js 18+**
- **PlatformIO** (extension VS Code) pour flasher les firmwares

### Option A — Script tout-en-un (recommandé, jour J)
```powershell
.\start-sentinel.ps1
```
Le script lance Mosquitto + backend + frontend dans des fenêtres séparées, affiche l'IP du PC (à reporter dans les `secrets.h` des firmwares) et ouvre l'interface web.

> Si l'exécution est bloquée : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (une seule fois).

### Option B — Manuel
```bash
# 1. Broker (si non installé en service)
mosquitto -v

# 2. Backend
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env                            # puis ajuster
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 3. Frontend
cd frontend
npm install
copy .env.example .env
npm run dev
```

Interfaces :
- **API** : http://localhost:8000 (docs interactives : `/docs`)
- **Web** : http://localhost:5173

---

## 🧪 Modes de fonctionnement

| Mode | Où | Effet |
|---|---|---|
| **Simulation firmware** | `SIMULATION_MODE=true` dans `platformio.ini` | L'ESP génère des mesures réalistes sans PZEM (test complet de la chaîne MQTT → web) |
| **Simulation backend** | `SIMULATION_MODE=true` dans `backend/.env` | Bascule d'affichage ; le simulateur de tension/seed reste disponible via `/api/sim/*` |
| **Production** | `SIMULATION_MODE=false` partout | Mesures réelles PZEM sur secteur 220 V |

---

## 🔐 Sécurité & secrets

- Les `secrets.h` (WiFi, IP broker, clé IoT) et le `.env` backend contiennent des **valeurs réelles** et sont **gitignorés**. Seuls les `*.example` sont versionnés.
- La clé `DEVICE_SECRET` (firmware) doit correspondre à `DEVICE_SHARED_SECRET` (backend).
- Ne jamais committer un `secrets.h` ou un `.env` réel.

---

## 👨‍💻 Auteur
Projet de Fin d'Études — Emeric. Encadrement : Dr. Sanya.

*SENTINEL IoT Infrastructure — 2026*
