# 🖥️ SENTINEL — Frontend (React / Vite)

Dashboard temps réel du système SENTINEL. Il se connecte au backend via **WebSocket** pour afficher en direct la consommation, l'audit de charge inconnue, la facturation SBEE et le pilotage des équipements.

## 🧱 Stack technique

- **React 19** + **Vite 8**
- **Tailwind CSS 4** (via `@tailwindcss/vite`)
- **Zustand** — store de télémétrie (`useTelemetryStore.js`)
- **Recharts** — graphiques de consommation
- **@tanstack/react-query** — requêtes REST
- **lucide-react** — icônes

## 📂 Arborescence

```text
frontend/
├── index.html
├── vite.config.js
├── src/
│   ├── main.jsx                # Point d'entrée
│   ├── App.jsx
│   ├── layouts/MainLayout.jsx  # Barre latérale + navigation
│   ├── pages/
│   │   ├── Dashboard.jsx       # Vue temps réel (puissance, tension, charge inconnue)
│   │   ├── Billing.jsx         # Facturation progressive SBEE
│   │   ├── Equipments.jsx      # Liste des appareils + toggle relais
│   │   └── Settings.jsx        # Simulation tension, seed/clear historique
│   └── store/
│       └── useTelemetryStore.js # Connexion WebSocket + état global
└── .env.example
```

## 🚀 Installation & lancement

```bash
cd frontend
npm install
copy .env.example .env       # puis ajuster si le backend n'est pas en local
npm run dev                  # http://localhost:5173
```

Scripts disponibles :

| Script | Rôle |
|---|---|
| `npm run dev` | Serveur de développement Vite (HMR) |
| `npm run build` | Build de production (`dist/`) |
| `npm run preview` | Prévisualise le build |
| `npm run lint` | ESLint |

## 🔧 Configuration (`.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `VITE_API_URL` | `http://127.0.0.1:8000` | Base de l'API REST |
| `VITE_WS_URL` | `ws://127.0.0.1:8000` | Base du WebSocket |

Le store se connecte à `${VITE_WS_URL}/api/telemetry/ws/telemetry` et reçoit un **snapshot unifié** à chaque mise à jour côté backend.

## 🗺️ Pages

- **Dashboard** — Puissance Master, somme des Nodes, **charge inconnue** (`P_Master − Σ P_Nodes`), tension, courbes temps réel.
- **Facturation** — Coût FCFA par tranches SBEE, référence mémoire 280 kWh → 34 950 FCFA.
- **Équipements** — État en ligne/hors-ligne, **toggle du relais** de chaque Node (réarmement après coupure de protection).
- **Paramètres** — Injection de tension simulée (test de la barrière de sécurité), génération / suppression de l'historique de démonstration.

> ℹ️ Après une coupure de protection (tension instable), le relais d'un Node **ne se réarme pas seul** : le réarmer manuellement depuis **Équipements**.
