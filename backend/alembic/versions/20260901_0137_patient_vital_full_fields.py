"""Extend patientvital with BP/pulse/SpO2/temperature so the reusable vitals
form (appointment intake + patient Overview) has one shared table to write."""

import sqlalchemy as sa
from alembic import op


revision = "20260901_0137"
down_revision = "20260901_0136"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _has_column(table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    )


def upgrade() -> None:
    if not _table_exists("patientvital"):
        return
    if not _has_column("patientvital", "bp"):
        op.add_column(
            "patientvital", sa.Column("bp", sa.String(length=20), nullable=True)
        )
    if not _has_column("patientvital", "pulse_bpm"):
        op.add_column(
            "patientvital", sa.Column("pulse_bpm", sa.Integer(), nullable=True)
        )
    if not _has_column("patientvital", "spo2_percent"):
        op.add_column(
            "patientvital", sa.Column("spo2_percent", sa.Float(), nullable=True)
        )
    if not _has_column("patientvital", "temperature_f"):
        op.add_column(
            "patientvital", sa.Column("temperature_f", sa.Float(), nullable=True)
        )
    # A reading may capture only BP/pulse/SpO2/temp without a height/weight
    # measurement (e.g. a routine triage re-check), so these can no longer be
    # mandatory on every row.
    op.alter_column(
        "patientvital", "height_cm", existing_type=sa.Float(), nullable=True
    )
    op.alter_column(
        "patientvital", "weight_kg", existing_type=sa.Float(), nullable=True
    )


def downgrade() -> None:
    if not _table_exists("patientvital"):
        return
    op.alter_column(
        "patientvital", "weight_kg", existing_type=sa.Float(), nullable=False
    )
    op.alter_column(
        "patientvital", "height_cm", existing_type=sa.Float(), nullable=False
    )
    op.drop_column("patientvital", "temperature_f")
    op.drop_column("patientvital", "spo2_percent")
    op.drop_column("patientvital", "pulse_bpm")
    op.drop_column("patientvital", "bp")
