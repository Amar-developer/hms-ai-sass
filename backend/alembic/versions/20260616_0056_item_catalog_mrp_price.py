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

TABLES = (
    "medicinecatalog",
    "labtestcatalog",
    "labtestpackage",
    "physiotherapyequipment",
    "homecareservice",
)


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def upgrade() -> None:
    # Migration 0001 creates every table from the *current* SQLModel
    # definitions (SQLModel.metadata.create_all), so on a fresh database
    # these models' mrp_price column already exists by the time this
    # migration runs. Guard each add so this stays a no-op there while
    # still adding the column on older databases provisioned before
    # mrp_price was added to the models.
    for table_name in TABLES:
        if "mrp_price" not in _columns(table_name):
            op.add_column(
                table_name,
                sa.Column(
                    "mrp_price", sa.Integer(), nullable=False, server_default="0"
                ),
            )


def downgrade() -> None:
    for table_name in reversed(TABLES):
        if "mrp_price" in _columns(table_name):
            op.drop_column(table_name, "mrp_price")
