from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///database.db"
    
    # CORS — Restreindre en production
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    
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

    # Simulation
    ACCELERATION_FACTOR: int = 1800

    class Config:
        env_file = ".env"

settings = Settings()
