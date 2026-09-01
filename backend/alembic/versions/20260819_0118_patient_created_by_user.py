"""Add patient creator tracking."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260819_0118"
down_revision = "20260814_0117"
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
    if not _table_exists("patient"):
        return
    if not _column_exists("patient", "created_by_user_id"):
        op.add_column("patient", sa.Column("created_by_user_id", sa.String()))
    if not _index_exists("patient", "ix_patient_created_by_user_id"):
        op.create_index(
            "ix_patient_created_by_user_id",
            "patient",
            ["created_by_user_id"],
        )


def downgrade() -> None:
    if not _table_exists("patient") or not _column_exists(
        "patient", "created_by_user_id"
    ):
        return
    if _index_exists("patient", "ix_patient_created_by_user_id"):
        op.drop_index("ix_patient_created_by_user_id", table_name="patient")
    op.drop_column("patient", "created_by_user_id")
