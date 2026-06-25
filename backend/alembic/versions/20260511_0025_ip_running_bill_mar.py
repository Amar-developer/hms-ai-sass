"""ip running bill and medication administration

Revision ID: 20260511_0025
Revises: 20260511_0024
Create Date: 2026-05-11
"""

from alembic import op
import sqlalchemy as sa


revision = "20260511_0025"
down_revision = "20260511_0024"
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
    _add(
        "ipconsultation",
        "consultation_type",
        sa.Column(
            "consultation_type",
            sa.String(length=80),
            nullable=False,
            server_default="ward_round",
        ),
    )
    _add(
        "ipconsultation",
        "fee_amount",
        sa.Column("fee_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add(
        "ipconsultation",
        "billing_item_id",
        sa.Column("billing_item_id", sa.String(), nullable=True),
    )

    if "ipbillingitem" not in _tables():
        op.create_table(
            "ipbillingitem",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("admission_id", sa.String(), nullable=False),
            sa.Column("source_type", sa.String(length=80), nullable=False),
            sa.Column("source_id", sa.String(), nullable=True),
            sa.Column("description", sa.String(length=260), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("unit_amount", sa.Integer(), nullable=False),
            sa.Column("total_amount", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=40), nullable=False),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["admission_id"], ["ipadmission.id"]),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if "ipmedicationorder" not in _tables():
        op.create_table(
            "ipmedicationorder",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("admission_id", sa.String(), nullable=False),
            sa.Column("practitioner_id", sa.String(), nullable=True),
            sa.Column("medicine_name", sa.String(length=180), nullable=False),
            sa.Column("dosage", sa.String(length=120), nullable=True),
            sa.Column("frequency", sa.String(length=120), nullable=True),
            sa.Column("route", sa.String(length=80), nullable=True),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=True),
            sa.Column("unit_amount", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=40), nullable=False),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["admission_id"], ["ipadmission.id"]),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if "ipmedicationadministration" not in _tables():
        op.create_table(
            "ipmedicationadministration",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("admission_id", sa.String(), nullable=False),
            sa.Column("medication_order_id", sa.String(), nullable=False),
            sa.Column("administered_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=40), nullable=False),
            sa.Column("notes", sa.String(length=1000), nullable=True),
            sa.Column("administered_by_user_id", sa.String(), nullable=True),
            sa.Column("billing_item_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["admission_id"], ["ipadmission.id"]),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["medication_order_id"], ["ipmedicationorder.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    pass
