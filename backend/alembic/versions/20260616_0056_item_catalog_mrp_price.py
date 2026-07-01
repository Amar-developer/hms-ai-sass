"""add mrp price to item catalogs

Revision ID: 20260616_0056
Revises: 20260616_0055
Create Date: 2026-06-16
"""

from alembic import op
import sqlalchemy as sa


revision = "20260616_0056"
down_revision = "20260616_0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "medicinecatalog",
        sa.Column("mrp_price", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "labtestcatalog",
        sa.Column("mrp_price", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "labtestpackage",
        sa.Column("mrp_price", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "physiotherapyequipment",
        sa.Column("mrp_price", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "homecareservice",
        sa.Column("mrp_price", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("homecareservice", "mrp_price")
    op.drop_column("physiotherapyequipment", "mrp_price")
    op.drop_column("labtestpackage", "mrp_price")
    op.drop_column("labtestcatalog", "mrp_price")
    op.drop_column("medicinecatalog", "mrp_price")
