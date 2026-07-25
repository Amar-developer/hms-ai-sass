"""Repair missing patient WhatsApp preference columns.

Revision ID: 20260724_0093
Revises: 20260724_0092
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260724_0093"
down_revision: str | None = "20260724_0092"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if "patient" not in inspector.get_table_names():
        raise RuntimeError("patient table must exist before applying revision 0093")
    return {column["name"] for column in inspector.get_columns("patient")}


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {index["name"] for index in inspector.get_indexes("patient")}


def upgrade() -> None:
    columns = _columns()
    additions = {
        "whatsapp_consent_status": sa.Column(
            "whatsapp_consent_status",
            sa.String(length=30),
            nullable=False,
            server_default="NOT_RECORDED",
        ),
        "whatsapp_consent_source": sa.Column(
            "whatsapp_consent_source", sa.String(length=80), nullable=True
        ),
        "whatsapp_consent_updated_at": sa.Column(
            "whatsapp_consent_updated_at", sa.DateTime(timezone=True), nullable=True
        ),
        "whatsapp_preferred_language": sa.Column(
            "whatsapp_preferred_language",
            sa.String(length=20),
            nullable=False,
            server_default="tenant_default",
        ),
    }
    for name, column in additions.items():
        if name not in columns:
            op.add_column("patient", column)

    indexes = _indexes()
    for name, fields in {
        "ix_patient_whatsapp_consent_status": ["whatsapp_consent_status"],
        "ix_patient_whatsapp_consent_updated_at": ["whatsapp_consent_updated_at"],
    }.items():
        if name not in indexes:
            op.create_index(name, "patient", fields)


def downgrade() -> None:
    # This is a repair revision. Earlier revisions own these columns, so rolling
    # back this repair must not remove schema that those revisions declare.
    pass
