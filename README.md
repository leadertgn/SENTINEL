# 🛡️ Sentinel — Smart Energy Home Infrastructure

**Sentinel** est une solution IoT de pointe dédiée à la télégestion et à l'audit énergétique résidentiel. Conçu pour répondre aux défis du secteur électrique béninois, le système offre un suivi métrologique haute précision, une facturation progressive en temps réel (SBEE) et une protection intelligente des équipements.

## 🏗️ Architecture du Système

Le projet repose sur une topologie **Master/Node** distribuée :
- **Master (ESP32)** : Installé au point d'entrée (compteur général), il assure la mesure globale de la maison et sert de barrière de sécurité (tension).
- **Nodes (ESP8266)** : Déployés sur les prises des gros consommateurs (Climatisation, Chauffe-eau), ils permettent le monitoring individuel et le pilotage ON/OFF.
- **Backend (FastAPI)** : Le moteur de traitement qui agrège les données, calcule les deltas de consommation et gère l'audit différentiel.
- **Frontend (React)** : Un dashboard premium en temps réel offrant une visibilité totale sur le flux énergétique et les coûts.

---

## ✨ Fonctionnalités Clés

- **Audit Différentiel Temps Réel** : Identification automatique de la "Charge Inconnue" (P_inconnue = P_Master - Σ P_Nodes).
- **Facturation Progressive (SBEE)** : Calcul automatique du coût en FCFA basé sur les tranches tarifaires sociales et normales du Bénin.
- **Barrière de Sécurité Électrique** : Protection des compresseurs et moteurs par blocage automatique des charges en cas de tension instable (Haut/Bas).
- **Auto-Découverte IoT** : Ajout transparent de nouveaux équipements sur le réseau via authentification par clé secrète.
- **Monitoring Local** : Affichage des métriques critiques sur écran LCD 16x2 directement au compteur.

---

## 📂 Structure du Projet

```text
SENTINEL/
├── firmware/
│   ├── Master/             # Code ESP32 (Mesure générale + LCD)
│   └── node-esp8266/       # Code ESP8266 (Pilotage relais + Mesure locale)
├── backend/                # API FastAPI, MQTT Client & SQLModel
└── frontend/               # Dashboard React (Tailwind 4, Zustand, Recharts)
```

---

## 📡 Contrat de Données (IoT)

Les appareils communiquent via MQTT avec le payload JSON suivant :
```json
{
  "mac_address": "...",
  "secret_key": "...",
  "role": "MASTER|NODE",
  "voltage_v": 220.5,
  "current_a": 1.2,
  "power_w": 260.0,
  "energy_kwh": 45.12,
  "is_active": true,
  "pf": 0.98
}
```

---

## 🚀 Installation & Lancement

### 1. Prérequis
- Broker MQTT (Mosquitto)
- Python 3.10+
- Node.js 18+
- PlatformIO (VS Code Extension)

### 2. Backend
```bash
cd backend
pip install -r requirements.txt
# Modifier .env avec vos accès MQTT/DB
uvicorn main:app --reload
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 4. Firmwares
- Ouvrir `firmware/Master` ou `firmware/node-esp8266` dans PlatformIO.
- Configurer les identifiants WiFi dans `include/secrets.h`.
- Flasher les microcontrôleurs.

---

## 🛠️ Modes de Développement
- **SIMULATION_MODE** : Activé par défaut dans les firmwares pour tester sans source 220V. Les ESP génèrent des données aléatoires cohérentes pour valider la communication MQTT et l'interface Web.

---

## 👨‍💻 Auteur
Projet de Fin d'Études (PFE) — Encadré par le Dr. Sanya.

---
*Propriété de Sentinel IoT Infrastructure — 2026*
