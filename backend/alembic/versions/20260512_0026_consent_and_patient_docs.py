"""admission documents, physiotherapy consent files, and patient photo upload

Revision ID: 20260512_0026
Revises: 20260511_0025
Create Date: 2026-05-12
"""

from alembic import op
import sqlalchemy as sa


revision = "20260512_0026"
down_revision = "20260511_0025"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    if table_name not in _tables():
        return set()
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _add(table_name: str, column_name: str, column: sa.Column) -> None:
    if table_name in _tables() and column_name not in _columns(table_name):
        op.add_column(table_name, column)


def upgrade() -> None:
    # Physiotherapy consent form columns
    _add(
        "physiotherapycase",
        "consent_form_url",
        sa.Column("consent_form_url", sa.String(length=500), nullable=True),
    )
    _add(
        "physiotherapycase",
        "consent_form_name",
        sa.Column("consent_form_name", sa.String(length=220), nullable=True),
    )
    _add(
        "physiotherapycase",
        "consent_files_json",
        sa.Column(
            "consent_files_json",
            sa.String(length=6000),
            nullable=False,
            server_default="[]",
        ),
    )
    _add(
        "physiotherapycase",
        "consent_notes",
        sa.Column("consent_notes", sa.String(length=1000), nullable=True),
    )
    _add(
        "physiotherapycase",
        "consent_submitted_at",
        sa.Column("consent_submitted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # IP admission Aadhaar and admission document columns
    _add(
        "ipadmission",
        "aadhaar_number",
        sa.Column("aadhaar_number", sa.String(length=12), nullable=True),
    )
    _add(
        "ipadmission",
        "admission_document_url",
        sa.Column("admission_document_url", sa.String(length=500), nullable=True),
    )
    _add(
        "ipadmission",
        "admission_document_name",
        sa.Column("admission_document_name", sa.String(length=220), nullable=True),
    )
    _add(
        "ipadmission",
        "admission_document_uploaded_at",
        sa.Column(
            "admission_document_uploaded_at", sa.DateTime(timezone=True), nullable=True
        ),
    )

    # Patient photo / document columns
    _add(
        "patient",
        "photo_url",
        sa.Column("photo_url", sa.String(length=500), nullable=True),
    )
    _add(
        "patient",
        "photo_file_name",
        sa.Column("photo_file_name", sa.String(length=220), nullable=True),
    )


def downgrade() -> None:
    for col in (
        "consent_form_url",
        "consent_form_name",
        "consent_files_json",
        "consent_notes",
        "consent_submitted_at",
    ):
        try:
            op.drop_column("physiotherapycase", col)
        except Exception:
            pass
    for col in (
        "aadhaar_number",
        "admission_document_url",
        "admission_document_name",
        "admission_document_uploaded_at",
    ):
        try:
            op.drop_column("ipadmission", col)
        except Exception:
            pass
    for col in ("photo_url", "photo_file_name"):
        try:
            op.drop_column("patient", col)
        except Exception:
            pass
