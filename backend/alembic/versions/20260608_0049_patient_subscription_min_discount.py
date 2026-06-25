"""patient subscription plan minimum discount amount

Revision ID: 20260608_0049
Revises: 20260608_0048
Create Date: 2026-06-08
"""

from alembic import op
import sqlalchemy as sa


revision = "20260608_0049"
down_revision = "20260608_0048"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in set(inspector.get_table_names()):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if "min_discount_amount" not in _columns("patientsubscriptionplan"):
        op.add_column(
            "patientsubscriptionplan",
            sa.Column(
                "min_discount_amount",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )


def downgrade() -> None:
    if "min_discount_amount" in _columns("patientsubscriptionplan"):
        op.drop_column("patientsubscriptionplan", "min_discount_amount")
