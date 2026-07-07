# 🔌 SENTINEL — Firmwares (ESP32 Master / ESP8266 Node)

Firmwares PlatformIO des deux microcontrôleurs du système. Ils lisent un capteur **PZEM-004T v3**, publient la télémétrie en **MQTT** et gèrent la connexion WiFi (avec portail de secours) de façon non bloquante.

```text
firmware/
├── Master/            # ESP32 — mesure générale + LCD 16x2
├── node-esp8266/      # ESP8266 (NodeMCU) — mesure locale + relais
└── NodeSimulator/     # Simulateurs Python (tests MQTT sans matériel)
```

## 🧭 Master vs Node

| | **Master (ESP32)** | **Node (ESP8266)** |
|---|---|---|
| Carte | `esp32dev` | `nodemcuv2` |
| Capteur PZEM | HardwareSerial2 (GPIO16/17) | SoftwareSerial (D5=GPIO14 / D6=GPIO12) |
| Afficheur | LCD 16x2 I2C (SDA=21, SCL=22) | — |
| Relais | — | GPIO5 (D1), actif HIGH |
| Rôle | Mesure générale + barrière tension | Mesure d'une charge + coupure ON/OFF |
| Portail WiFi | `SENTINEL-Master-Setup` (ouvert) | `SENTINEL-Node-Setup` (ouvert) |

> Le Master n'exécute **pas** de commande relais : il ne coupe pas lui-même les charges.

## 🛠️ Prérequis

- **PlatformIO** (extension VS Code)
- Pilotes USB : CP2102 / CH340 selon la carte
- Un broker MQTT (Mosquitto) accessible sur le réseau local

Les bibliothèques sont déclarées dans chaque `platformio.ini` et installées automatiquement :
`PZEM-004T-v30`, `PubSubClient`, `ArduinoJson v7`, `WiFiManager`, `NTPClient`
(+ `LiquidCrystal_I2C` pour le Master, `EspSoftwareSerial @ 6.17.1` **figé** pour le Node).

> ⚠️ **Node : ne pas mettre à jour `EspSoftwareSerial`.** Les versions récentes (8.x) renvoient `NaN` avec la lib PZEM sur ESP8266. La version `6.17.1` est volontairement épinglée.

## 🔐 Configuration des secrets

Chaque firmware a besoin d'un `include/secrets.h` (gitignoré). Le créer à partir du template :

```bash
# Master
copy firmware\Master\include\secrets.h.example firmware\Master\include\secrets.h
# Node
copy firmware\node-esp8266\include\secrets.h.example firmware\node-esp8266\include\secrets.h
```

Puis renseigner :
```cpp
#define WIFI_SSID       "…"        // réseau WiFi domicile
#define WIFI_PASSWORD   "…"
#define MQTT_BROKER     "192.168.X.X"   // IP du PC qui fait tourner Mosquitto
#define MQTT_PORT       1883
#define DEVICE_SECRET   "…"        // = DEVICE_SHARED_SECRET du backend/.env
```

> 🔑 `MQTT_BROKER` est la **source unique** de l'IP du broker (la persistance Flash a été retirée : après un changement de réseau, elle rechargeait une ancienne IP injoignable). Pour changer de broker : éditer `secrets.h` + reflasher. Récupérer l'IP du PC avec `ipconfig` (ou via `start-sentinel.ps1` qui l'affiche).

## ⚙️ Modes de compilation

Dans `platformio.ini` (`build_flags`) :

```ini
-D SIMULATION_MODE=false   ; true = mesures générées sans PZEM (test de la chaîne)
```

- `SIMULATION_MODE=true` — l'ESP produit des mesures réalistes sans capteur (valide MQTT → backend → web).
- `SIMULATION_MODE=false` — lecture réelle du PZEM sur secteur 220 V.

## ▶️ Compiler, flasher, monitorer

Depuis chaque dossier (`Master/` ou `node-esp8266/`) :

```bash
pio run                 # compiler
pio run -t upload       # flasher
pio device monitor      # moniteur série (115200 baud)
```
Ou via les boutons PlatformIO dans VS Code (✔ Build, → Upload, 🔌 Monitor).

## 🌐 Comportement réseau (non bloquant)

1. **Essai WiFi domicile** (8 s) avec les identifiants de `secrets.h`.
2. Échec → **portail captif AP ouvert** (sans mot de passe) : se connecter au SSID `SENTINEL-*-Setup` depuis un téléphone pour choisir le réseau. Timeout 3 min, puis mode hors-ligne.
3. **Hors-ligne** → les mesures sont mises en file en Flash (LittleFS) et rejouées à la reconnexion.
4. MQTT : reconnexion non bloquante toutes les 5 s ; annonce d'un statut **ONLINE retenu** dès la connexion, LWT `OFFLINE` en cas de coupure.

## 💡 LEDs de diagnostic

| LED | Master | Node |
|---|---|---|
| Réseau | GPIO25 | GPIO16 (D0) |
| Activité | GPIO4 | GPIO13 (D7) |

Les broches de strapping sensibles (ESP32 GPIO2 ; ESP8266 D3/D4/D8) sont **évitées** pour ne pas perturber le boot.

## 🩺 Dépannage rapide

| Symptôme | Cause probable | Action |
|---|---|---|
| PZEM `NaN` sur toutes les mesures | Pas de 220 V L/N, ou câblage RX/TX, ou pont diviseur sur les lignes data | Alimenter L/N ; câblage **direct** D5/D6 (le pont protecteur casse l'UART de l'ESP8266) |
| Node redémarre / se fige | Brownout de l'alim (relais + rafales WiFi) | Buck stable ~5,2 V + condensateur 2200 µF à l'ESP |
| MQTT ne connecte jamais | `MQTT_BROKER` = ancienne IP | Mettre l'IP actuelle du PC dans `secrets.h` + reflasher |
| LCD allumé mais figé | Plantage / brownout | Brancher l'USB, lire le moniteur au reset |

## 🧪 Simulateurs Python

`NodeSimulator/simulate_master.py` et `simulate_node.py` publient des trames MQTT réalistes sans matériel — utile pour tester le backend + frontend seuls.
