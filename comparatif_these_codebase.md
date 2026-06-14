# Rapport Comparatif : Thèses Rédigées vs Codebase Sentinel

> [!IMPORTANT]
> *Ce rapport technique dresse un état des lieux rigoureux entre les affirmations de votre document de mémoire déposé et la réalité de l'implémentation dans le code source de la solution Sentinel. Il met en évidence les points de concordance parfaite ainsi que les deux légers écarts identifiés, et vous propose des solutions immédiates pour y faire face.*

---

## 1. Tableau Synthétique de Conformité

| Axe Fonctionnel | Spécification dans le Mémoire | Implémentation dans la Codebase | Statut | Fichier(s) Source(s) de Référence |
| :--- | :--- | :--- | :---: | :--- |
| **Topologie Réseau** | Topologie en étoile Master (ESP32) / Nodes (ESP8266) via MQTT. | Dossiers firmwares distincts configurés pour ESP32 et ESP8266. | **Conforme** | [/firmware/Master](file:///c:/Users/togno/SENTINEL/firmware/Master) & [/node-esp8266](file:///c:/Users/togno/SENTINEL/firmware/node-esp8266) |
| **Métrologie fine** | Lecture de 6 paramètres (Tension, Courant, Puissance, Énergie, Fréquence, Cos φ). | Lecture directe du PZEM-004T v3 via liaison UART (Hardware ou Software). | **Conforme** | [Master/src/pzem_reader.cpp](file:///c:/Users/togno/SENTINEL/firmware/Master/src/pzem_reader.cpp) |
| **Résilience Réseau** | Sauvegarde locale en flash sous LittleFS si WiFi/MQTT coupé. | Écriture en mode ajout dans `/queue.jsonl` et envoi automatique via `flush_queue()`. | **Conforme** | [Master/src/mqtt_handler.cpp](file:///c:/Users/togno/SENTINEL/firmware/Master/src/mqtt_handler.cpp#L25-L49) |
| **Audit Différentiel** | Calcul : $P_{\text{Inconnue}} = P_{\text{Master}} - \sum P_{\text{Nodes}}$. | Calcul mathématique dynamique et diffusion asynchrone par Snapshot WebSocket. | **Conforme** | [backend/app/core/mqtt_client.py](file:///c:/Users/togno/SENTINEL/backend/app/core/mqtt_client.py#L167) |
| **Auto-découverte** | Authentification et ajout dynamique des Nodes via clé partagée. | Fonction `_validate_and_register` vérifiant la clé secrète partagée. | **Conforme** | [backend/app/core/mqtt_client.py](file:///c:/Users/togno/SENTINEL/backend/app/core/mqtt_client.py#L19-L50) |
| **Tarification SBEE** | Modélisation progressive par tranches de consommation (Sociale, Normale 1 & 2). | Calcul par paliers progressifs en base de données SQLite/PostgreSQL. | **Conforme** | [backend/app/services/billing.py](file:///c:/Users/togno/SENTINEL/backend/app/services/billing.py#L74-L106) |
| **TVA de 18%** | Application de la TVA de 18% sur les tranches supérieures de la SBEE. | Le calcul applique uniquement le tarif unitaire net (sans multiplication par 1.18). | **Écart mineur** | [backend/app/services/billing.py](file:///c:/Users/togno/SENTINEL/backend/app/services/billing.py#L99) |
| **Barrière de Tension** | Coupure et blocage automatique si la tension Master est $< 180\text{V}$ ou $> 250\text{V}$. | Implémenté uniquement lors du *Toggle* HTTP (bloque l'allumage). Pas de coupure automatique en tâche de fond. | **Écart mineur** | [backend/app/api/devices.py](file:///c:/Users/togno/SENTINEL/backend/app/api/devices.py#L32-L44) |

---

## 2. Analyse Détaillée des Écarts et Solutions Proposées

### Écart A : L'application de la TVA de 18% sur la Facture SBEE
*   **Ce que dit le mémoire :** Le système intègre la grille progressive en calculant le coût réel TTC avec application de la TVA (18%) sur les tranches supérieures (Normale 1 et Normale 2), la tranche sociale étant exonérée.
*   **Ce que fait le code actuel :** Il multiplie directement les kWh par le tarif de la tranche (88, 125, 148 FCFA) sans appliquer de coefficient de taxe.
*   **Impact devant le jury :** Si un membre du jury s'amuse à refaire les calculs sur le dashboard, il constatera l'absence de la taxe de 18% sur la tranche supérieure.
*   **Solution technique :** Nous pouvons mettre à jour le code de calcul dans `billing.py` pour ajouter automatiquement les 18% de TVA sur les kWh consommés au-delà du palier social (20 kWh).

### Écart B : L'automatisation active de la Coupure de Sécurité
*   **Ce que dit le mémoire :** Le système coupe automatiquement les charges sensibles (relais des Nodes) dès que la tension générale d'entrée mesurée par le Master sort de la plage de sécurité ($180\text{V} - 250\text{V}$).
*   **Ce que fait le code actuel :** La vérification est uniquement "passive" : si l'utilisateur tente d'allumer un Node via l'interface web, le backend FastAPI rejette la requête en renvoyant une erreur HTTP 400. Cependant, si un climatiseur est déjà allumé (relais ON) et qu'une baisse soudaine de tension survient à 170V, le système ne va pas envoyer activement d'ordre d'extinction automatique MQTT.
*   **Impact devant le jury :** C'est une question classique de soutenance : *"Votre barrière de tension fonctionne-t-elle en temps réel en tâche de fond, ou est-ce seulement un contrôle à l'allumage ?"*
*   **Solution technique :** Nous pouvons implémenter un chien de garde (Watchdog) dans la réception des messages MQTT du Master dans `mqtt_client.py` : si la tension reçue est hors-plage, le backend balaie la base de données et envoie un ordre MQTT `OFF` à tous les Nodes actifs.

---

## 3. Synthèse de la Refonte Graphique Réalisée (Conformité Académique)

Conformément à vos attentes d'un **fond clair et lisible, avec de grandes polices propres pour l'impression du manuscrit et une ergonomie professionnelle**, j'ai procédé aux modifications suivantes :

1.  **Refonte Typographique (`index.css` & `index.html`)** :
    *   Remplacement complet des polices à empattement (*Garamond*, *Source Serif*) qui donnaient un style "livre d'histoire" par la police moderne sans empattement **Inter** (chargée depuis Google Fonts).
    *   Taille de police augmentée pour les valeurs numériques et unités.
2.  **Harmonisation Thématique de l'Interface (`MainLayout.jsx`)** :
    *   Changement du fond d'écran global vers un gris industriel très clair (`#F8FAFC`).
    *   Suppression des classes `font-serif` au profit de `font-sans`.
3.  **Refonte du Dashboard (`Dashboard.jsx`)** :
    *   **Barre d'état industrielle (Nouveauté)** : Ajout d'une barre de diagnostic réseau en tête d'écran affichant l'état de fonctionnement en temps réel des 4 piliers du système : *Compteur ESP32*, *Broker MQTT*, *Serveur backend FastAPI*, et *Base de données SQL*.
    *   **Cartes (Cards) épurées** : Suppression des en-têtes de couleur sombre au profit d'un design minimaliste blanc à bordure fine (`border-slate-200`) avec effet de survol dynamique.
    *   **Lisibilité des Unités** : Toutes les unités ($W$, $V$, $A$, $Hz$, $kWh$) sont affichées de façon distincte avec une hiérarchie de taille claire (valeur en gras et grand format, label en petits caractères grisés).
4.  **Refonte de la Page de Facturation (`Billing.jsx`)** :
    *   Remplacement de la carte sombre `bg-slate-900` par une carte blanche à pastilles claires.
    *   **Barre de progression visuelle** : Intégration d'une jauge verte/orange pour visualiser la progression de la consommation mensuelle vis-à-vis du palier social (20 kWh), avec un message d'alerte contextuel si le seuil est franchi.
