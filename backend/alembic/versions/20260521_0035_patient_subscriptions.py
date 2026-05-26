"""patient subscriptions

Revision ID: 20260521_0035
Revises: 20260521_0034
Create Date: 2026-05-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260521_0035"
down_revision = "20260521_0034"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _index(name: str, table_name: str, columns: list[str]) -> None:
    if table_name in _tables() and name not in _indexes(table_name):
        op.create_index(name, table_name, columns)


def upgrade() -> None:
    if "patientsubscriptionplan" not in _tables():
        op.create_table(
            "patientsubscriptionplan",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("code", sa.String(length=60), nullable=True),
            sa.Column("price_amount", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("duration_days", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("free_consultations", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("lab_discount_percentage", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("pharmacy_discount_percentage", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("free_lab_test_ids_json", sa.String(), nullable=False, server_default="[]"),
            sa.Column("discounted_lab_test_ids_json", sa.String(), nullable=False, server_default="[]"),
            sa.Column("free_medicine_ids_json", sa.String(), nullable=False, server_default="[]"),
            sa.Column("discounted_medicine_ids_json", sa.String(), nullable=False, server_default="[]"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        for column in ("tenant_id", "branch_id", "code", "is_active", "created_by_user_id", "updated_by_user_id", "created_at"):
            _index(f"ix_patientsubscriptionplan_{column}", "patientsubscriptionplan", [column])

    if "patientsubscriptionenrollment" not in _tables():
        op.create_table(
            "patientsubscriptionenrollment",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("patient_id", sa.String(), nullable=False),
            sa.Column("plan_id", sa.String(), nullable=False),
            sa.Column("starts_on", sa.Date(), nullable=False),
            sa.Column("ends_on", sa.Date(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("used_consultations", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("paid_amount", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("cancelled_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["patient_id"], ["patient.id"]),
            sa.ForeignKeyConstraint(["plan_id"], ["patientsubscriptionplan.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        for column in ("tenant_id", "branch_id", "patient_id", "plan_id", "status", "created_by_user_id", "cancelled_by_user_id", "created_at"):
            _index(f"ix_patientsubscriptionenrollment_{column}", "patientsubscriptionenrollment", [column])


def downgrade() -> None:
    if "patientsubscriptionenrollment" in _tables():
        op.drop_table("patientsubscriptionenrollment")
    if "patientsubscriptionplan" in _tables():
        op.drop_table("patientsubscriptionplan")
