from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="MedizinHub HMS API")
    app_version: str = Field(default="0.1.0")
    environment: str = Field(default="local")

    api_prefix: str = Field(default="/api/v1")

    enable_docs: bool = Field(default=True)

    database_url: str = Field(default="sqlite:///./medizinhub_hms.db")
    redis_url: str = Field(default="redis://localhost:6379/0")

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
        env_file=".env",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
