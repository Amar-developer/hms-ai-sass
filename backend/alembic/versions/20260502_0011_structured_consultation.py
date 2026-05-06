"""structured consultation rows

Revision ID: 20260502_0011
Revises: 20260502_0010
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260502_0011"
down_revision = "20260502_0010"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    existing = _tables()
    if "consultationvital" not in existing:
        op.create_table(
            "consultationvital",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("consultation_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(length=80), nullable=False),
            sa.Column("value", sa.String(length=80), nullable=False),
            sa.Column("unit", sa.String(length=40), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_consultationvital_consultation_id", "consultationvital", ["consultation_id"])
        op.create_index("ix_consultationvital_tenant_id", "consultationvital", ["tenant_id"])
    if "consultationcomplaint" not in existing:
        op.create_table(
            "consultationcomplaint",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("consultation_id", sa.String(), nullable=False),
            sa.Column("complaint", sa.String(length=300), nullable=False),
            sa.Column("duration", sa.String(length=120), nullable=True),
            sa.Column("severity", sa.String(length=80), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_consultationcomplaint_consultation_id", "consultationcomplaint", ["consultation_id"])
        op.create_index("ix_consultationcomplaint_tenant_id", "consultationcomplaint", ["tenant_id"])
    if "consultationdiagnosis" not in existing:
        op.create_table(
            "consultationdiagnosis",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("consultation_id", sa.String(), nullable=False),
            sa.Column("diagnosis", sa.String(length=300), nullable=False),
            sa.Column("diagnosis_type", sa.String(length=80), nullable=True),
            sa.Column("notes", sa.String(length=500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_consultationdiagnosis_consultation_id", "consultationdiagnosis", ["consultation_id"])
        op.create_index("ix_consultationdiagnosis_tenant_id", "consultationdiagnosis", ["tenant_id"])
    if "consultationmedicine" not in existing:
        op.create_table(
            "consultationmedicine",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("consultation_id", sa.String(), nullable=False),
            sa.Column("medicine_name", sa.String(length=220), nullable=False),
            sa.Column("dosage", sa.String(length=120), nullable=True),
            sa.Column("frequency", sa.String(length=120), nullable=True),
            sa.Column("duration", sa.String(length=120), nullable=True),
            sa.Column("instructions", sa.String(length=500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_consultationmedicine_consultation_id", "consultationmedicine", ["consultation_id"])
        op.create_index("ix_consultationmedicine_tenant_id", "consultationmedicine", ["tenant_id"])
    if "consultationreferral" not in existing:
        op.create_table(
            "consultationreferral",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("consultation_id", sa.String(), nullable=False),
            sa.Column("referral_type", sa.String(length=40), nullable=False),
            sa.Column("item_name", sa.String(length=220), nullable=False),
            sa.Column("priority", sa.String(length=80), nullable=True),
            sa.Column("instructions", sa.String(length=500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_consultationreferral_consultation_id", "consultationreferral", ["consultation_id"])
        op.create_index("ix_consultationreferral_tenant_id", "consultationreferral", ["tenant_id"])
        op.create_index("ix_consultationreferral_referral_type", "consultationreferral", ["referral_type"])
    if "clinicaltemplate" not in existing:
        op.create_table(
            "clinicaltemplate",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("department_id", sa.String(), nullable=True),
            sa.Column("name", sa.String(length=180), nullable=False),
            sa.Column("template_type", sa.String(length=80), nullable=False),
            sa.Column("content_json", sa.String(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_clinicaltemplate_tenant_id", "clinicaltemplate", ["tenant_id"])
        op.create_index("ix_clinicaltemplate_department_id", "clinicaltemplate", ["department_id"])
        op.create_index("ix_clinicaltemplate_template_type", "clinicaltemplate", ["template_type"])
        op.create_index("ix_clinicaltemplate_is_active", "clinicaltemplate", ["is_active"])


def downgrade() -> None:
    for table in [
        "clinicaltemplate",
        "consultationreferral",
        "consultationmedicine",
        "consultationdiagnosis",
        "consultationcomplaint",
        "consultationvital",
    ]:
        if table in _tables():
            op.drop_table(table)
