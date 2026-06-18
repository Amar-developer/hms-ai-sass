"""patient membership rule fields

Revision ID: 20260611_0051
Revises: 20260608_0050
Create Date: 2026-06-11
"""

from alembic import op
import sqlalchemy as sa


revision = "20260611_0051"
down_revision = "20260608_0050"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in set(inspector.get_table_names()):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    columns = _columns("patientsubscriptionplan")
    if "activation_after_days" not in columns:
        op.add_column(
            "patientsubscriptionplan",
            sa.Column(
                "activation_after_days",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )
    if "pharmacy_discount_slabs_json" not in columns:
        op.add_column(
            "patientsubscriptionplan",
            sa.Column(
                "pharmacy_discount_slabs_json",
                sa.String(),
                nullable=False,
                server_default="[]",
            ),
        )


def downgrade() -> None:
    columns = _columns("patientsubscriptionplan")
    if "pharmacy_discount_slabs_json" in columns:
        op.drop_column("patientsubscriptionplan", "pharmacy_discount_slabs_json")
    if "activation_after_days" in columns:
        op.drop_column("patientsubscriptionplan", "activation_after_days")
