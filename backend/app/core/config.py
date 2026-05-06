from functools import lru_cache
from os import getenv

from pydantic import BaseModel, Field


class Settings(BaseModel):
    app_name: str = Field(default="MedizinHub HMS API")
    app_version: str = Field(default="0.1.0")
    environment: str = Field(default="local")
    api_prefix: str = Field(default="/api/v1")
    enable_docs: bool = Field(default=True)
    database_url: str | None = Field(default=None)
    redis_url: str | None = Field(default=None)
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


def _to_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _to_list(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    default_cors_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
    ]
    return Settings(
        app_name=getenv("MEDIZINHUB_APP_NAME", "MedizinHub HMS API"),
        app_version=getenv("MEDIZINHUB_APP_VERSION", "0.1.0"),
        environment=getenv("MEDIZINHUB_ENVIRONMENT", "local"),
        api_prefix=getenv("MEDIZINHUB_API_PREFIX", "/api/v1"),
        enable_docs=_to_bool(getenv("MEDIZINHUB_ENABLE_DOCS"), True),
        database_url=getenv("MEDIZINHUB_DATABASE_URL"),
        redis_url=getenv("MEDIZINHUB_REDIS_URL"),
        auto_create_tables=_to_bool(getenv("MEDIZINHUB_AUTO_CREATE_TABLES"), True),
        cors_origins=_to_list(getenv("MEDIZINHUB_CORS_ORIGINS"), default_cors_origins),
    )
