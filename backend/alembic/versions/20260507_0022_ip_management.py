"""ip management foundation

Revision ID: 20260507_0022
Revises: 20260507_0021
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260507_0022"
down_revision = "20260507_0021"
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


def _create_if_missing(table_name: str, *columns: sa.Column) -> None:
    if table_name not in _tables():
        op.create_table(table_name, *columns)


def _add(table_name: str, column_name: str, column: sa.Column) -> None:
    if table_name in _tables() and column_name not in _columns(table_name):
        op.add_column(table_name, column)


def upgrade() -> None:
    _create_if_missing(
        "ipadmission",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=False),
        sa.Column("patient_id", sa.String(), nullable=False),
        sa.Column("source_appointment_id", sa.String(), nullable=True),
        sa.Column("department_id", sa.String(), nullable=True),
        sa.Column("admitting_practitioner_id", sa.String(), nullable=True),
        sa.Column("admission_number", sa.String(length=60), nullable=False),
        sa.Column("ward", sa.String(length=120), nullable=False),
        sa.Column("room", sa.String(length=80), nullable=True),
        sa.Column("bed", sa.String(length=80), nullable=False),
        sa.Column("admission_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(length=1000), nullable=True),
        sa.Column("provisional_diagnosis", sa.String(length=1000), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
        sa.ForeignKeyConstraint(["department_id"], ["department.id"]),
        sa.ForeignKeyConstraint(["patient_id"], ["patient.id"]),
        sa.ForeignKeyConstraint(["source_appointment_id"], ["appointment.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    _create_if_missing(
        "iptreatment",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=False),
        sa.Column("admission_id", sa.String(), nullable=False),
        sa.Column("treatment_date", sa.Date(), nullable=False),
        sa.Column("practitioner_id", sa.String(), nullable=True),
        sa.Column("treatment_type", sa.String(length=80), nullable=False),
        sa.Column("notes", sa.String(length=2000), nullable=False),
        sa.Column("medication_summary", sa.String(length=2000), nullable=True),
        sa.Column("orders", sa.String(length=2000), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["admission_id"], ["ipadmission.id"]),
        sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    _create_if_missing(
        "ipconsultation",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=False),
        sa.Column("admission_id", sa.String(), nullable=False),
        sa.Column("practitioner_id", sa.String(), nullable=True),
        sa.Column("consultation_date", sa.Date(), nullable=False),
        sa.Column("vitals_json", sa.String(length=2000), nullable=False),
        sa.Column("complaints", sa.String(length=2000), nullable=True),
        sa.Column("diagnosis", sa.String(length=2000), nullable=True),
        sa.Column("notes", sa.String(length=4000), nullable=True),
        sa.Column("prescription_text", sa.String(length=4000), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["admission_id"], ["ipadmission.id"]),
        sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    _create_if_missing(
        "ipconsentform",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=False),
        sa.Column("admission_id", sa.String(), nullable=False),
        sa.Column("consent_type", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("content", sa.String(length=5000), nullable=False),
        sa.Column("patient_or_guardian_name", sa.String(length=180), nullable=True),
        sa.Column("relationship", sa.String(length=80), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["admission_id"], ["ipadmission.id"]),
        sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    _create_if_missing(
        "ipdischargesummary",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=False),
        sa.Column("admission_id", sa.String(), nullable=False),
        sa.Column("discharge_date", sa.Date(), nullable=False),
        sa.Column("final_diagnosis", sa.String(length=2000), nullable=False),
        sa.Column("course_in_hospital", sa.String(length=4000), nullable=True),
        sa.Column("procedures", sa.String(length=3000), nullable=True),
        sa.Column("medications", sa.String(length=3000), nullable=True),
        sa.Column("follow_up_advice", sa.String(length=3000), nullable=True),
        sa.Column("condition_at_discharge", sa.String(length=1000), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["admission_id"], ["ipadmission.id"]),
        sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    _create_if_missing(
        "ipcharge",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=False),
        sa.Column("admission_id", sa.String(), nullable=False),
        sa.Column("charge_type", sa.String(length=80), nullable=False),
        sa.Column("description", sa.String(length=260), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_amount", sa.Integer(), nullable=False),
        sa.Column("total_amount", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["admission_id"], ["ipadmission.id"]),
        sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    _add(
        "invoice",
        "ip_admission_id",
        sa.Column("ip_admission_id", sa.String(), nullable=True),
    )
    if (
        "invoice" in _tables()
        and "appointment_id" in _columns("invoice")
        and op.get_bind().dialect.name != "sqlite"
    ):
        op.alter_column(
            "invoice", "appointment_id", existing_type=sa.String(), nullable=True
        )


def downgrade() -> None:
    if "invoice" in _tables() and "ip_admission_id" in _columns("invoice"):
        op.drop_column("invoice", "ip_admission_id")
    for table_name in [
        "ipcharge",
        "ipdischargesummary",
        "ipconsentform",
        "ipconsultation",
        "iptreatment",
        "ipadmission",
    ]:
        if table_name in _tables():
            op.drop_table(table_name)
