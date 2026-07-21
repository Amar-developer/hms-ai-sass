import importlib.util
from pathlib import Path

import sqlalchemy as sa


MIGRATION_PATH = (
    Path(__file__).parents[1] / "alembic" / "versions" / "20260716_0080_error_logs.py"
)


def _migration_module():
    spec = importlib.util.spec_from_file_location("migration_0080", MIGRATION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _patch_non_table_operations(migration, monkeypatch):
    monkeypatch.setattr(migration.op, "execute", lambda _statement: None)
    monkeypatch.setattr(migration.op, "f", lambda name: name)


def test_upgrade_skips_error_log_table_when_initial_schema_already_created_it(
    test_engine, monkeypatch
):
    migration = _migration_module()
    created_tables: list[str] = []
    created_indexes: list[str] = []
    monkeypatch.setattr(migration.op, "get_bind", lambda: test_engine)
    monkeypatch.setattr(
        migration.op,
        "create_table",
        lambda table_name, *_columns, **_kwargs: created_tables.append(table_name),
    )
    monkeypatch.setattr(
        migration.op,
        "create_index",
        lambda index_name, *_args, **_kwargs: created_indexes.append(index_name),
    )
    _patch_non_table_operations(migration, monkeypatch)

    migration.upgrade()

    assert created_tables == []
    assert created_indexes == ["ix_errorlog_tenant_resolved_last_seen"]


def test_upgrade_creates_error_log_table_for_existing_upgraded_database(monkeypatch):
    engine = sa.create_engine("sqlite://")
    migration = _migration_module()
    created_tables: list[str] = []
    created_indexes: list[str] = []
    monkeypatch.setattr(migration.op, "get_bind", lambda: engine)
    monkeypatch.setattr(
        migration.op,
        "create_table",
        lambda table_name, *_columns, **_kwargs: created_tables.append(table_name),
    )
    monkeypatch.setattr(
        migration.op,
        "create_index",
        lambda index_name, *_args, **_kwargs: created_indexes.append(index_name),
    )
    _patch_non_table_operations(migration, monkeypatch)

    migration.upgrade()

    assert created_tables == ["errorlog"]
    assert created_indexes == [
        index_name for index_name, _columns in migration.ERROR_LOG_INDEXES
    ]
