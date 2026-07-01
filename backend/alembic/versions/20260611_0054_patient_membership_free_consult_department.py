"""patient membership free consultation department restriction

Revision ID: 20260611_0054
Revises: 20260611_0053
Create Date: 2026-06-11
"""

from alembic import op
import sqlalchemy as sa


revision = "20260611_0054"
down_revision = "20260611_0053"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in set(inspector.get_table_names()):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    columns = _columns("patientsubscriptionplan")
    if not columns:
        return
    if "free_consultation_department_ids_json" not in columns:
        op.add_column(
            "patientsubscriptionplan",
            sa.Column(
                "free_consultation_department_ids_json",
                sa.String(),
                nullable=False,
                server_default="[]",
            ),
        )


def downgrade() -> None:
    columns = _columns("patientsubscriptionplan")
    if "free_consultation_department_ids_json" in columns:
        op.drop_column(
            "patientsubscriptionplan", "free_consultation_department_ids_json"
        )
