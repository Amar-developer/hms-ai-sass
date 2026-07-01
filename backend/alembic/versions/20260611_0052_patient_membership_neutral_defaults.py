"""patient membership neutral defaults

Revision ID: 20260611_0052
Revises: 20260611_0051
Create Date: 2026-06-11
"""

from alembic import op
import sqlalchemy as sa


revision = "20260611_0052"
down_revision = "20260611_0051"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in set(inspector.get_table_names()):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    columns = _columns("patientsubscriptionplan")
    if "min_discount_amount" in columns:
        with op.batch_alter_table("patientsubscriptionplan") as batch_op:
            batch_op.alter_column(
                "min_discount_amount",
                existing_type=sa.Integer(),
                server_default="0",
                existing_nullable=False,
            )
    if "duration_days" in columns:
        with op.batch_alter_table("patientsubscriptionplan") as batch_op:
            batch_op.alter_column(
                "duration_days",
                existing_type=sa.Integer(),
                server_default=None,
                existing_nullable=False,
            )


def downgrade() -> None:
    columns = _columns("patientsubscriptionplan")
    if "min_discount_amount" in columns:
        with op.batch_alter_table("patientsubscriptionplan") as batch_op:
            batch_op.alter_column(
                "min_discount_amount",
                existing_type=sa.Integer(),
                server_default="0",
                existing_nullable=False,
            )
    if "duration_days" in columns:
        with op.batch_alter_table("patientsubscriptionplan") as batch_op:
            batch_op.alter_column(
                "duration_days",
                existing_type=sa.Integer(),
                server_default=None,
                existing_nullable=False,
            )
