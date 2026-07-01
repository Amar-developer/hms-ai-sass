"""physiotherapy management foundation

Revision ID: 20260507_0023
Revises: 20260507_0022
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260507_0023"
down_revision = "20260507_0022"
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
        "physiotherapyequipment",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("modality_type", sa.String(length=80), nullable=False),
        sa.Column("manufacturer", sa.String(length=120), nullable=True),
        sa.Column("model_number", sa.String(length=120), nullable=True),
        sa.Column("serial_number", sa.String(length=120), nullable=True),
        sa.Column(
            "is_portable", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    _create_if_missing(
        "physiotherapycase",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=False),
        sa.Column("patient_id", sa.String(), nullable=False),
        sa.Column("source_appointment_id", sa.String(), nullable=True),
        sa.Column("ip_admission_id", sa.String(), nullable=True),
        sa.Column("physiotherapist_id", sa.String(), nullable=True),
        sa.Column("department_id", sa.String(), nullable=True),
        sa.Column("care_context", sa.String(length=20), nullable=False),
        sa.Column("case_number", sa.String(length=60), nullable=False),
        sa.Column("assessment_date", sa.Date(), nullable=False),
        sa.Column("body_region", sa.String(length=120), nullable=True),
        sa.Column("condition", sa.String(length=500), nullable=True),
        sa.Column("pain_score", sa.Integer(), nullable=True),
        sa.Column("range_of_motion", sa.String(length=500), nullable=True),
        sa.Column("muscle_strength", sa.String(length=500), nullable=True),
        sa.Column("treatment_goal", sa.String(length=1000), nullable=True),
        sa.Column("planned_sessions", sa.Integer(), nullable=False),
        sa.Column("frequency", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
        sa.ForeignKeyConstraint(["department_id"], ["department.id"]),
        sa.ForeignKeyConstraint(["ip_admission_id"], ["ipadmission.id"]),
        sa.ForeignKeyConstraint(["patient_id"], ["patient.id"]),
        sa.ForeignKeyConstraint(["source_appointment_id"], ["appointment.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    _create_if_missing(
        "physiotherapysession",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=False),
        sa.Column("case_id", sa.String(), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("session_number", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.String(), nullable=True),
        sa.Column("modality_type", sa.String(length=80), nullable=False),
        sa.Column("treatment_area", sa.String(length=160), nullable=True),
        sa.Column("intensity", sa.String(length=120), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("pre_pain_score", sa.Integer(), nullable=True),
        sa.Column("post_pain_score", sa.Integer(), nullable=True),
        sa.Column("exercises", sa.String(length=2000), nullable=True),
        sa.Column("home_program", sa.String(length=2000), nullable=True),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column("charge_amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
        sa.ForeignKeyConstraint(["case_id"], ["physiotherapycase.id"]),
        sa.ForeignKeyConstraint(["equipment_id"], ["physiotherapyequipment.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    _add(
        "invoice",
        "physiotherapy_case_id",
        sa.Column("physiotherapy_case_id", sa.String(), nullable=True),
    )


def downgrade() -> None:
    if "invoice" in _tables() and "physiotherapy_case_id" in _columns("invoice"):
        op.drop_column("invoice", "physiotherapy_case_id")
    for table_name in [
        "physiotherapysession",
        "physiotherapycase",
        "physiotherapyequipment",
    ]:
        if table_name in _tables():
            op.drop_table(table_name)
