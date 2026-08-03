"""Run migration/readiness once under a database lock, then exec Uvicorn.

Every API replica may run this entrypoint safely. PostgreSQL serializes the
migration gate, while ``os.execvp`` makes Uvicorn the container process so it
receives shutdown signals directly.
"""

from __future__ import annotations

import os
import subprocess
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool


MIGRATION_LOCK_ID = 4_873_249_117


def _required_environment(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    if value < 1:
        raise RuntimeError(f"{name} must be greater than zero")
    return value


@contextmanager
def migration_lock(database_url: str):
    engine = create_engine(database_url, poolclass=NullPool, pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            if connection.dialect.name == "postgresql":
                connection.execute(
                    text("SELECT pg_advisory_lock(:lock_id)"),
                    {"lock_id": MIGRATION_LOCK_ID},
                )
            try:
                yield
            finally:
                if connection.dialect.name == "postgresql":
                    connection.execute(
                        text("SELECT pg_advisory_unlock(:lock_id)"),
                        {"lock_id": MIGRATION_LOCK_ID},
                    )
    finally:
        engine.dispose()


def run_deployment_gate(database_url: str) -> None:
    command_environment = {**os.environ, "MEDIZINHUB_DATABASE_URL": database_url}
    subprocess.run(
        ["python", "scripts/verify_production_environment.py"],
        check=True,
        env=os.environ,
    )
    with migration_lock(database_url):
        subprocess.run(
            ["alembic", "-c", "alembic/alembic.ini", "upgrade", "head"],
            check=True,
            env=command_environment,
        )
        subprocess.run(
            [
                "python",
                "scripts/verify_runtime_readiness.py",
                "--ensure-pg-stat-statements",
            ],
            check=True,
            env=command_environment,
        )


def uvicorn_command() -> list[str]:
    return [
        "uvicorn",
        "app.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8080",
        "--workers",
        str(_positive_int("MEDIZINHUB_WEB_CONCURRENCY", 2)),
        "--limit-concurrency",
        str(_positive_int("MEDIZINHUB_WEB_LIMIT_CONCURRENCY", 80)),
        "--backlog",
        str(_positive_int("MEDIZINHUB_WEB_BACKLOG", 2048)),
        "--timeout-keep-alive",
        str(_positive_int("MEDIZINHUB_WEB_TIMEOUT_KEEP_ALIVE", 5)),
        "--timeout-graceful-shutdown",
        str(_positive_int("MEDIZINHUB_WEB_GRACEFUL_SHUTDOWN_SECONDS", 30)),
        "--proxy-headers",
        "--forwarded-allow-ips",
        os.getenv("MEDIZINHUB_FORWARDED_ALLOW_IPS", "127.0.0.1"),
    ]


def main() -> None:
    run_deployment_gate(_required_environment("MEDIZINHUB_MIGRATION_DATABASE_URL"))
    os.execvp("uvicorn", uvicorn_command())


if __name__ == "__main__":
    main()
