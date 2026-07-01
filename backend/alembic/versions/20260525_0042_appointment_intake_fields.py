"""add intake_vitals and intake_complaints to appointment

Revision ID: 20260525_0042
Revises: 20260525_0041
Create Date: 2026-05-25
"""

from alembic import op
import sqlalchemy as sa

revision = "20260525_0042"
down_revision = "20260525_0041"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def upgrade() -> None:
    if "appointment" not in _tables():
        return
    existing = _columns("appointment")
    if "intake_vitals" not in existing:
        op.add_column(
            "appointment",
            sa.Column("intake_vitals", sa.String(length=1000), nullable=True),
        )
    if "intake_complaints" not in existing:
        op.add_column(
            "appointment",
            sa.Column("intake_complaints", sa.String(length=2000), nullable=True),
        )


def downgrade() -> None:
    if "appointment" not in _tables():
        return
    existing = _columns("appointment")
    if "intake_complaints" in existing:
        op.drop_column("appointment", "intake_complaints")
    if "intake_vitals" in existing:
        op.drop_column("appointment", "intake_vitals")
