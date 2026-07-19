import re
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


SEMVER_PATTERN = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)


def _repository_version() -> str:
    """Read the tracked release version during local/source-based execution."""
    repository_version = Path(__file__).resolve().parents[3] / "VERSION"
    try:
        value = repository_version.read_text(encoding="utf-8").strip()
    except OSError:
        return "0.1.0"
    return value or "0.1.0"


class Settings(BaseSettings):
    app_name: str = Field(default="MedizinHub HMS API")
    app_version: str = Field(default_factory=_repository_version)
    build_commit: str = Field(default="unknown")
    build_time: str | None = Field(default=None)
    environment: str = Field(default="local")
    log_level: str = Field(default="INFO")
    slow_request_ms: int = Field(default=1000, ge=1)

    api_prefix: str = Field(default="/api/v1")
    uploads_dir: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[2] / "uploads"
    )

    enable_docs: bool = Field(default=True)

    database_url: str = Field(default="sqlite:///./medizinhub_hms.db")
    redis_url: str = Field(default="redis://localhost:6379/0")
    report_queue_name: str = Field(default="medizinhub:reports:monthly")
    report_scheduler_lock_key: str = Field(
        default="medizinhub:reports:monthly:scheduler"
    )
    # A finished month is frozen into a snapshot once it ends. For this many days
    # into the new month the snapshot is kept in sync with late same-period
    # entries (payments collected a day into the new month, backdated invoices);
    # after the window the month is final and later changes fall to the current
    # month, as the accounting model intends.
    report_snapshot_grace_days: int = Field(default=3, ge=0)

    smtp_host: str | None = Field(default=None)
    smtp_port: int = Field(default=587)
    smtp_username: str | None = Field(default=None)
    smtp_password: str | None = Field(default=None)
    smtp_from_email: str = Field(default="reports@medizinhub.local")
    smtp_from_name: str = Field(default="MedizinHub HMS Reports")
    smtp_use_tls: bool = Field(default=True)

    medicine_graphql_url: str | None = Field(
        default="https://www.medizinhub.com/graphql"
    )
    medicine_graphql_timeout_seconds: int = Field(default=10)

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

    @field_validator("cors_origins")
    @classmethod
    def _reject_wildcard_origin(cls, value: list[str]) -> list[str]:
        # The app sends CORS with allow_credentials=True. A "*" origin combined
        # with credentials is a real cross-origin credential-leak, and browsers
        # reject it anyway — fail fast instead of shipping an insecure config.
        if any(origin.strip() == "*" for origin in value):
            raise ValueError(
                "cors_origins cannot contain '*' while credentials are enabled; "
                "list explicit origins."
            )
        return value

    @field_validator("app_version")
    @classmethod
    def _validate_app_version(cls, value: str) -> str:
        normalized = value.strip()
        if not SEMVER_PATTERN.fullmatch(normalized):
            raise ValueError(
                "app_version must use Semantic Versioning, for example 1.2.44"
            )
        return normalized

    model_config = SettingsConfigDict(
        env_prefix="MEDIZINHUB_",
        env_file=(".env", "../.env"),
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
