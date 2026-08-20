"""Add updated by user to settings catalog records."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260820_0120"
down_revision = "20260819_0119"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    )


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(
        index["name"] == index_name
        for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    )


def _add_indexed_column(table_name: str, column_name: str) -> None:
    if not _table_exists(table_name):
        return
    if not _column_exists(table_name, column_name):
        op.add_column(table_name, sa.Column(column_name, sa.String(), nullable=True))
    index_name = f"ix_{table_name}_{column_name}"
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, [column_name])


def _drop_indexed_column(table_name: str, column_name: str) -> None:
    if not _table_exists(table_name) or not _column_exists(table_name, column_name):
        return
    index_name = f"ix_{table_name}_{column_name}"
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)
    op.drop_column(table_name, column_name)


def _backfill_from_created_by(table_name: str) -> None:
    if not _table_exists(table_name):
        return
    if not _column_exists(table_name, "updated_by_user_id"):
        return
    if not _column_exists(table_name, "created_by_user_id"):
        return
    table = sa.table(
        table_name,
        sa.column("updated_by_user_id"),
        sa.column("created_by_user_id"),
    )
    op.execute(
        table.update()
        .where(table.c.updated_by_user_id.is_(None))
        .where(table.c.created_by_user_id.is_not(None))
        .values(updated_by_user_id=table.c.created_by_user_id)
    )


def upgrade() -> None:
    for table_name in ("pharmacysupplier", "taxrule", "discountoffer"):
        _add_indexed_column(table_name, "updated_by_user_id")
        _backfill_from_created_by(table_name)


def downgrade() -> None:
    for table_name in ("discountoffer", "taxrule", "pharmacysupplier"):
        _drop_indexed_column(table_name, "updated_by_user_id")
