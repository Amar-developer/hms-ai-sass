import re
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
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
    web_concurrency: int = Field(default=2, ge=1, le=64)
    web_limit_concurrency: int = Field(default=80, ge=10, le=10000)
    # Almost every route handler is a sync `def`, so it runs on AnyIO's thread
    # pool rather than the event loop. That pool's size is a real concurrency
    # limit sitting between web_limit_concurrency above and the database pool
    # below, and AnyIO's default of 40 was never chosen by anyone. Naming it
    # here keeps the capacity chain complete: admitted requests are bounded by
    # web_concurrency × web_limit_concurrency, handlers actually executing by
    # web_concurrency × web_thread_limit, and database work by the pool sizes.
    # Raising it past the pool only converts running handlers into handlers
    # blocked on a connection checkout.
    web_thread_limit: int = Field(default=40, ge=8, le=512)
    web_backlog: int = Field(default=2048, ge=128, le=65535)
    web_timeout_keep_alive: int = Field(default=5, ge=1, le=120)
    web_graceful_shutdown_seconds: int = Field(default=30, ge=5, le=600)

    api_prefix: str = Field(default="/api/v1")
    uploads_dir: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[2] / "uploads"
    )
    file_storage_backend: str = Field(default="local", pattern="^(local|s3)$")
    aws_s3_bucket: str | None = Field(default=None)
    aws_s3_region: str = Field(default="ap-south-1", min_length=1)
    aws_s3_prefix: str = Field(default="", max_length=120)
    aws_s3_endpoint_url: str | None = Field(default=None)
    aws_s3_kms_key_id: str | None = Field(default=None)
    aws_s3_presigned_url_ttl_seconds: int = Field(default=900, ge=60, le=86400)
    permanent_invoice_delivery_enabled: bool = Field(default=True)
    # Whether outbound template messages actually reach the provider. Left
    # unset this follows the environment, so a developer stack restored from a
    # production dump cannot message real patients: every send is refused at
    # the adapter before any network call. Set it explicitly to true to send
    # for real from a non-production environment.
    whatsapp_live_delivery: bool | None = Field(default=None)

    enable_docs: bool = Field(default=True)

    database_url: str = Field(default="sqlite:///./medizinhub_hms.db")
    # With PgBouncer in front of Postgres (recommended in production), these
    # only bound how many client connections *this process* holds against
    # PgBouncer, not Postgres itself — PgBouncer's own pool_size is what
    # bounds real Postgres connections. Keep these modest per-process; raising
    # them without also raising PgBouncer/Postgres capacity just moves the
    # exhaustion point.
    db_pool_size: int = Field(default=10, ge=1)
    db_max_overflow: int = Field(default=20, ge=0)
    db_pool_timeout: int = Field(default=10, ge=1)
    db_statement_timeout_ms: int = Field(default=30000, ge=0)
    db_lock_timeout_ms: int = Field(default=5000, ge=0)
    db_idle_transaction_timeout_ms: int = Field(default=60000, ge=0)
    db_disable_prepared_statements: bool = Field(default=False)
    redis_url: str = Field(default="redis://localhost:6379/0")
    # TTL for caching per-user permission/role keys and tenant lookups in
    # Redis so the auth hot path (run on almost every request) doesn't hit
    # Postgres each time. Bounds how long a revoked permission or suspended
    # tenant can still appear valid.
    auth_cache_ttl_seconds: int = Field(default=30, ge=0)
    login_rate_limit_attempts: int = Field(default=10, ge=3, le=100)
    login_rate_limit_ip_attempts: int = Field(default=50, ge=10, le=1000)
    login_rate_limit_window_seconds: int = Field(default=900, ge=60, le=86400)
    secure_cookie: bool | None = Field(default=None)
    credential_encryption_key: str = Field(
        default="local-development-credential-key-change-before-production",
        min_length=32,
    )
    report_queue_name: str = Field(default="medizinhub:reports:monthly")
    report_scheduler_lock_key: str = Field(
        default="medizinhub:reports:monthly:scheduler"
    )
    report_worker_heartbeat_key: str = Field(
        default="medizinhub:workers:reports:heartbeat"
    )
    report_worker_heartbeat_ttl_seconds: int = Field(default=30, ge=10)
    report_queue_dedupe_ttl_seconds: int = Field(default=60, ge=10)
    report_job_stale_after_seconds: int = Field(default=900, ge=60)
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

    @model_validator(mode="after")
    def _validate_storage_configuration(self):
        environment = self.environment.strip().lower()
        prefix = self.aws_s3_prefix.strip()
        if prefix.startswith("/") or ".." in prefix.split("/"):
            raise ValueError(
                "aws_s3_prefix must be a relative server-controlled prefix"
            )
        if (
            self.file_storage_backend == "s3"
            and not str(self.aws_s3_bucket or "").strip()
        ):
            raise ValueError(
                "aws_s3_bucket is required when file_storage_backend is s3"
            )
        if environment in {"production", "prod"}:
            if self.secure_cookie is False:
                raise ValueError(
                    "production cannot disable secure authentication cookies"
                )
            if self.file_storage_backend != "s3":
                raise ValueError("production must use the s3 file storage backend")
            if self.aws_s3_endpoint_url:
                raise ValueError("production cannot use a custom S3 endpoint URL")
            bucket = str(self.aws_s3_bucket or "").strip().lower()
            unsafe_markers = ("local", "dev", "staging", "stage", "test")
            if any(marker in bucket for marker in unsafe_markers):
                raise ValueError(
                    "production cannot use a local, development, staging, or test bucket"
                )
            if self.aws_s3_presigned_url_ttl_seconds > 3600:
                raise ValueError(
                    "production S3 presigned URL TTL cannot exceed 3600 seconds"
                )
        elif self.file_storage_backend == "s3":
            bucket = str(self.aws_s3_bucket or "").strip().lower()
            if "prod" in bucket or "production" in bucket:
                raise ValueError(
                    "non-production environments cannot use a production bucket"
                )
        return self

    @property
    def secure_cookie_enabled(self) -> bool:
        if self.secure_cookie is not None:
            return self.secure_cookie
        return self.environment.strip().lower() in {"production", "prod"}

    @property
    def whatsapp_live_delivery_enabled(self) -> bool:
        if self.whatsapp_live_delivery is not None:
            return self.whatsapp_live_delivery
        return self.environment.strip().lower() in {"production", "prod"}

    model_config = SettingsConfigDict(
        env_prefix="MEDIZINHUB_",
        env_file=(".env", "../.env"),
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
