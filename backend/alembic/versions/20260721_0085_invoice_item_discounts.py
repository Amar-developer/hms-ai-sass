"""store exact invoice item discount allocations

Revision ID: 20260721_0085
Revises: 20260721_0084
Create Date: 2026-07-21
"""

import sqlalchemy as sa
from alembic import op


revision = "20260721_0085"
down_revision = "20260721_0084"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    columns = _columns("invoiceitem")
    if "discount_amount" not in columns:
        op.add_column(
            "invoiceitem",
            sa.Column("discount_amount", sa.Integer(), nullable=True),
        )
    if "membership_discount_amount" not in columns:
        op.add_column(
            "invoiceitem",
            sa.Column(
                "membership_discount_amount",
                sa.Integer(),
                nullable=True,
            ),
        )


def downgrade() -> None:
    columns = _columns("invoiceitem")
    if "membership_discount_amount" in columns:
        op.drop_column("invoiceitem", "membership_discount_amount")
    if "discount_amount" in columns:
        op.drop_column("invoiceitem", "discount_amount")
