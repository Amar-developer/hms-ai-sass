"""patient membership free item usage counters

Revision ID: 20260611_0053
Revises: 20260611_0052
Create Date: 2026-06-11
"""

from alembic import op
import sqlalchemy as sa


revision = "20260611_0053"
down_revision = "20260611_0052"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in set(inspector.get_table_names()):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    columns = _columns("patientsubscriptionenrollment")
    if not columns:
        return
    if "used_free_lab_json" not in columns:
        op.add_column(
            "patientsubscriptionenrollment",
            sa.Column(
                "used_free_lab_json", sa.String(), nullable=False, server_default="{}"
            ),
        )
    if "used_free_medicine_json" not in columns:
        op.add_column(
            "patientsubscriptionenrollment",
            sa.Column(
                "used_free_medicine_json",
                sa.String(),
                nullable=False,
                server_default="{}",
            ),
        )


def downgrade() -> None:
    columns = _columns("patientsubscriptionenrollment")
    if "used_free_medicine_json" in columns:
        op.drop_column("patientsubscriptionenrollment", "used_free_medicine_json")
    if "used_free_lab_json" in columns:
        op.drop_column("patientsubscriptionenrollment", "used_free_lab_json")
