"""appointment custom fee amount

Revision ID: 20260616_0055
Revises: 20260611_0054
Create Date: 2026-06-16
"""

from alembic import op
import sqlalchemy as sa


revision = "20260616_0055"
down_revision = "20260611_0054"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def _columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if "appointment" in _tables() and "custom_fee_amount" not in _columns(
        "appointment"
    ):
        op.add_column(
            "appointment", sa.Column("custom_fee_amount", sa.Integer(), nullable=True)
        )


def downgrade() -> None:
    if "appointment" in _tables() and "custom_fee_amount" in _columns("appointment"):
        op.drop_column("appointment", "custom_fee_amount")
