from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="MedizinHub HMS API")
    app_version: str = Field(default="0.1.0")
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    slow_request_ms: int = Field(default=1000, ge=1)

    api_prefix: str = Field(default="/api/v1")

    enable_docs: bool = Field(default=True)

    database_url: str = Field(default="sqlite:///./medizinhub_hms.db")
    redis_url: str = Field(default="redis://localhost:6379/0")
    report_queue_name: str = Field(default="medizinhub:reports:monthly")
    report_scheduler_lock_key: str = Field(
        default="medizinhub:reports:monthly:scheduler"
    )

    smtp_host: str | None = Field(default=None)
    smtp_port: int = Field(default=587)
    smtp_username: str | None = Field(default=None)
    smtp_password: str | None = Field(default=None)
    smtp_from_email: str = Field(default="reports@medizinhub.local")
    smtp_from_name: str = Field(default="MedizinHub HMS Reports")
    smtp_use_tls: bool = Field(default=True)

    maha_clinic_url: str | None = Field(default=None)
    maha_clinic_token: str | None = Field(default=None)
    maha_clinic_timeout_seconds: int = Field(default=10)
    medicine_graphql_url: str | None = Field(
        default="https://www.medizinhub.com/graphql"
    )
    medicine_graphql_timeout_seconds: int = Field(default=10)
    external_lab_items_enabled: bool = Field(default=False)

    auto_create_tables: bool = Field(default=True)

    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            "http://localhost:3002",
            "http://127.0.0.1:3002",
            "http://localhost:3003",
            "http://127.0.0.1:3003",
        ]
    )

    model_config = SettingsConfigDict(
        env_prefix="MEDIZINHUB_",
        env_file=(".env", "../.env"),
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
