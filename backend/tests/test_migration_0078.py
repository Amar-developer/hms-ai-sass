import importlib.util
from pathlib import Path

import sqlalchemy as sa


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "20260715_0078_membership_benefit_breakdown.py"
)


def _migration_module():
    spec = importlib.util.spec_from_file_location("migration_0078", MIGRATION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upgrade_is_noop_when_current_model_columns_already_exist(
    test_engine, monkeypatch
):
    migration = _migration_module()
    added: list[str] = []
    monkeypatch.setattr(migration.op, "get_bind", lambda: test_engine)
    monkeypatch.setattr(
        migration.op,
        "add_column",
        lambda _table, column: added.append(column.name),
    )

    migration.upgrade()

    assert added == []


def test_upgrade_adds_all_breakdown_columns_to_legacy_invoice(monkeypatch):
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE invoice (id VARCHAR PRIMARY KEY)"))

    migration = _migration_module()
    added: list[str] = []
    monkeypatch.setattr(migration.op, "get_bind", lambda: engine)
    monkeypatch.setattr(
        migration.op,
        "add_column",
        lambda _table, column: added.append(column.name),
    )

    migration.upgrade()

    assert added == list(migration.COLUMNS)
