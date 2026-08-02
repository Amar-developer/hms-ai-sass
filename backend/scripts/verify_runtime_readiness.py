"""Fail deployment when migrations or required PostgreSQL telemetry are missing."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _script_heads() -> set[str]:
    config = Config(str(BACKEND_ROOT / "alembic" / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    return set(ScriptDirectory.from_config(config).get_heads())


def verify(*, ensure_pg_stat_statements: bool) -> None:
    database_url = os.getenv("MEDIZINHUB_DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("MEDIZINHUB_DATABASE_URL is required")

    engine = create_engine(database_url, pool_pre_ping=True)
    try:
        with engine.begin() as connection:
            database_heads = set(
                MigrationContext.configure(connection).get_current_heads()
            )
            expected_heads = _script_heads()
            if database_heads != expected_heads:
                raise RuntimeError(
                    "Database migration mismatch: "
                    f"database={sorted(database_heads)} code={sorted(expected_heads)}"
                )

            if ensure_pg_stat_statements:
                if connection.dialect.name != "postgresql":
                    raise RuntimeError("pg_stat_statements requires PostgreSQL")
                connection.execute(
                    text("CREATE EXTENSION IF NOT EXISTS pg_stat_statements")
                )
                preload = str(
                    connection.execute(
                        text("SHOW shared_preload_libraries")
                    ).scalar_one()
                )
                if "pg_stat_statements" not in {
                    item.strip() for item in preload.split(",") if item.strip()
                }:
                    raise RuntimeError(
                        "PostgreSQL must preload pg_stat_statements; add it to "
                        "shared_preload_libraries and restart PostgreSQL"
                    )
                connection.execute(text("SELECT count(*) FROM pg_stat_statements"))
    finally:
        engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ensure-pg-stat-statements", action="store_true")
    args = parser.parse_args()
    verify(ensure_pg_stat_statements=args.ensure_pg_stat_statements)
    print("Runtime readiness verified: migrations current and telemetry available.")


if __name__ == "__main__":
    main()
