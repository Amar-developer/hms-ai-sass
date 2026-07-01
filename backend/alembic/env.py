from logging.config import fileConfig
from pathlib import Path
import sys
import os

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.database import SQLModel
import app.models  # noqa

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BASE_DIR))

config = context.config

if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


# STRICT ENV-ONLY DB LOADER (NO dotenv)
def get_database_url():
    url = os.getenv("MEDIZINHUB_DATABASE_URL")
    if not url:
        raise RuntimeError("MEDIZINHUB_DATABASE_URL is missing")
    return url


def run_migrations_online():
    db_url = get_database_url()

    # FORCE OVERRIDE EVERY TIME (important)
    config.set_main_option("sqlalchemy.url", db_url)

    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as conn:
        context.configure(
            connection=conn,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


def run_migrations_offline():
    url = get_database_url()

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
