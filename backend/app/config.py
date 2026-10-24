from __future__ import annotations

import getpass
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "平安区时空智能物联网 API"
    version: str = "1.0.0"
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    database_url: str = (
        f"postgresql+asyncpg://{getpass.getuser()}@127.0.0.1:5432/iot_platform"
    )
    timezone: str = "Asia/Shanghai"

    mqtt_enabled: bool = True
    mqtt_host: str = "127.0.0.1"
    mqtt_port: int = 8883
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    mqtt_topic_prefix: str = "iot/pingan"
    mqtt_tls: bool = True
    mqtt_ca_certs: str | None = None
    mqtt_certfile: str | None = None
    mqtt_keyfile: str | None = None
    mqtt_tls_insecure: bool = False

    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "pingan-iot"
    access_token_minutes: int = 480
    ws_ticket_seconds: int = 60
    login_max_attempts: int = 5
    login_window_seconds: int = 300

    demo_login_enabled: bool = True

    admin_username: str = "admin"
    admin_password: str = ""
    admin_display_name: str = "系统管理员"
    operator_username: str = "operator"
    operator_password: str = ""
    operator_display_name: str = "值班长"
    viewer_username: str = "viewer"
    viewer_password: str = ""
    viewer_display_name: str = "观察员"

    tls_enabled: bool = False

    simulation_enabled: bool = True
    simulation_interval_seconds: float = 1.0
    history_interval_seconds: int = 5
    history_size: int = 36
    persist_interval_seconds: int = 10

    cors_origins: List[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "https://127.0.0.1:5173",
        "https://localhost:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
        "https://127.0.0.1:4173",
        "https://localhost:4173",
        "https://127.0.0.1:8443",
        "https://localhost:8443",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="IOT_",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
