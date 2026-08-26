"""Add manual membership benefit usage baselines.

Revision ID: 20260826_0128
Revises: 20260824_0127
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260826_0128"
down_revision = "20260824_0127"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return inspector.has_table(table_name) and any(
        column["name"] == column_name for column in inspector.get_columns(table_name)
    )


def upgrade() -> None:
    table = "patientsubscriptionenrollment"
    columns = (
        sa.Column("manual_used_consultations", sa.Integer(), nullable=True),
        sa.Column("manual_used_free_lab_json", sa.String(), nullable=True),
        sa.Column("manual_used_free_medicine_json", sa.String(), nullable=True),
    )
    for column in columns:
        if not _column_exists(table, column.name):
            op.add_column(table, column)


def downgrade() -> None:
    table = "patientsubscriptionenrollment"
    for column_name in (
        "manual_used_free_medicine_json",
        "manual_used_free_lab_json",
        "manual_used_consultations",
    ):
        if _column_exists(table, column_name):
            op.drop_column(table, column_name)
