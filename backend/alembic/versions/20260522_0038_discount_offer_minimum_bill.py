"""discount offer minimum bill amount

Revision ID: 20260522_0038
Revises: 20260521_0037
Create Date: 2026-05-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20260522_0038"
down_revision = "20260521_0037"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def upgrade() -> None:
    if "discountoffer" in _tables() and "minimum_bill_amount" not in _columns(
        "discountoffer"
    ):
        op.add_column(
            "discountoffer",
            sa.Column(
                "minimum_bill_amount", sa.Integer(), nullable=False, server_default="0"
            ),
        )


def downgrade() -> None:
    if "discountoffer" in _tables() and "minimum_bill_amount" in _columns(
        "discountoffer"
    ):
        op.drop_column("discountoffer", "minimum_bill_amount")
