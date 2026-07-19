import importlib.util
from pathlib import Path

import sqlalchemy as sa


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "20260719_0082_comment_mentions.py"
)


def _migration_module():
    spec = importlib.util.spec_from_file_location("migration_0082", MIGRATION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upgrade_is_noop_when_comment_mentions_already_exist(test_engine, monkeypatch):
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

    migration.upgrade()

    assert created_tables == []
    assert created_indexes == []


def test_upgrade_creates_comment_mentions_for_an_existing_database(monkeypatch):
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

    migration.upgrade()

    assert created_tables == ["documentcommentmention"]
    assert created_indexes == [
        "ix_documentcommentmention_tenant_id",
        "ix_documentcommentmention_comment_id",
        "ix_documentcommentmention_mentioned_user_id",
        "ix_documentcommentmention_created_at",
    ]
