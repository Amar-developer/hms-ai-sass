"""Fail startup when production-critical environment controls are unsafe."""

from __future__ import annotations

import os
from urllib.parse import urlparse

from app.core.config import Settings, get_settings


UNSAFE_CREDENTIAL_KEYS = {
    "local-development-credential-key-change-before-production",
    "replace-with-at-least-32-random-characters",
    "replace-with-at-least-32-secret-characters",
}


def production_environment_issues(
    settings: Settings, environ: dict[str, str]
) -> list[str]:
    if settings.environment.strip().lower() not in {"production", "prod"}:
        return []

    issues: list[str] = []
    if settings.enable_docs:
        issues.append("MEDIZINHUB_ENABLE_DOCS must be false")
    if settings.auto_create_tables:
        issues.append("MEDIZINHUB_AUTO_CREATE_TABLES must be false")
    if settings.file_storage_backend != "s3":
        issues.append("MEDIZINHUB_FILE_STORAGE_BACKEND must be s3")
    if not settings.secure_cookie_enabled:
        issues.append("MEDIZINHUB_SECURE_COOKIE must be true")
    if settings.credential_encryption_key in UNSAFE_CREDENTIAL_KEYS:
        issues.append("MEDIZINHUB_CREDENTIAL_ENCRYPTION_KEY must be rotated")
    if not settings.database_url.startswith("postgresql"):
        issues.append("MEDIZINHUB_DATABASE_URL must use PostgreSQL")
    redis = urlparse(settings.redis_url)
    if redis.scheme not in {"redis", "rediss"} or redis.hostname in {
        None,
        "localhost",
        "127.0.0.1",
    }:
        issues.append("MEDIZINHUB_REDIS_URL must use the production Redis service")
    if not settings.cors_origins or any(
        not origin.lower().startswith("https://") for origin in settings.cors_origins
    ):
        issues.append("MEDIZINHUB_CORS_ORIGINS must contain only HTTPS origins")
    if settings.build_commit == "unknown" or not settings.build_time:
        issues.append("build commit and build time must be injected")
    if not environ.get("MEDIZINHUB_MIGRATION_DATABASE_URL", "").startswith(
        "postgresql"
    ):
        issues.append("MEDIZINHUB_MIGRATION_DATABASE_URL must use PostgreSQL")
    if not environ.get("MEDIZINHUB_BOOTSTRAP_TOKEN", "").strip():
        issues.append("MEDIZINHUB_BOOTSTRAP_TOKEN must be configured")
    if environ.get("MEDIZINHUB_FORWARDED_ALLOW_IPS", "").strip() == "*":
        issues.append("MEDIZINHUB_FORWARDED_ALLOW_IPS cannot be '*' in production")
    return issues


def main() -> None:
    settings = get_settings()
    issues = production_environment_issues(settings, dict(os.environ))
    if issues:
        formatted = "\n".join(f"- {issue}" for issue in issues)
        raise RuntimeError(f"Production environment verification failed:\n{formatted}")
    print("Production environment verification passed.")


if __name__ == "__main__":
    main()
