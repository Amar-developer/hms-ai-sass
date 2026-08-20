"""Add updated by user to appointments."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260820_0121"
down_revision = "20260820_0120"
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


def upgrade() -> None:
    table_name = "appointment"
    column_name = "updated_by_user_id"
    if not _table_exists(table_name):
        return
    if not _column_exists(table_name, column_name):
        op.add_column(table_name, sa.Column(column_name, sa.String(), nullable=True))
    index_name = f"ix_{table_name}_{column_name}"
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, [column_name])
    if _column_exists(table_name, "created_by_user_id"):
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


def downgrade() -> None:
    table_name = "appointment"
    column_name = "updated_by_user_id"
    if not _table_exists(table_name) or not _column_exists(table_name, column_name):
        return
    index_name = f"ix_{table_name}_{column_name}"
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)
    op.drop_column(table_name, column_name)
