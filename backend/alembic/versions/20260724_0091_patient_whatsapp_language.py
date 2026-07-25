"""Add patient WhatsApp preferred language.

Revision ID: 20260724_0091
Revises: 20260724_0090
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260724_0091"
down_revision: str | None = "20260724_0090"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if "patient" not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns("patient")}


def upgrade() -> None:
    columns = _columns()
    if columns and "whatsapp_preferred_language" not in columns:
        op.add_column(
            "patient",
            sa.Column(
                "whatsapp_preferred_language",
                sa.String(length=20),
                nullable=False,
                server_default="tenant_default",
            ),
        )


def downgrade() -> None:
    columns = _columns()
    if columns and "whatsapp_preferred_language" in columns:
        op.drop_column("patient", "whatsapp_preferred_language")
