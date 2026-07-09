from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///database.db"
    
    # CORS — Restreindre en production
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Regex CORS — autorise localhost ET tout le réseau local privé (10.x,
    # 172.16-31.x, 192.168.x) sur n'importe quel port. Indispensable pour la
    # démo multi-appareils : les téléphones du jury chargent le dashboard
    # depuis http://<IP-du-PC>:5173 → Origin non-localhost à autoriser.
    ALLOWED_ORIGIN_REGEX: str = r"http://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?"
    
    # Mode opérationnel
    SIMULATION_MODE: bool = True

    # MQTT Broker
    MQTT_BROKER: str = "127.0.0.1"
    MQTT_PORT: int = 1883
    MQTT_USERNAME: str = ""
    MQTT_PASSWORD: str = ""
    MQTT_TOPIC_DATA: str = "sbee/devices/+/data"
    MQTT_TOPIC_CMD: str = "sbee/devices/+/cmd"
    MQTT_TOPIC_STATUS: str = "sbee/devices/+/status"
    
    # Sécurité IoT
    DEVICE_SHARED_SECRET: str = "SENTINEL_SECRET_2026"

    # Facturation SBEE — Prime fixe (redevance) : 500 FCFA par kVA souscrit.
    # Affichée à titre informatif, NON incluse dans le coût énergie (paliers)
    # afin de rester strictement conforme au chiffre du mémoire (34 950 FCFA / 280 kWh).
    FIXED_PREMIUM_PER_KVA: float = 500.0
    SUBSCRIBED_KVA: float = 5.0

    # Simulation
    ACCELERATION_FACTOR: int = 1800

    class Config:
        env_file = ".env"

settings = Settings()
