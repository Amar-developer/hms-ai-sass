"""revenue grade billing

Revision ID: 20260502_0012
Revises: 20260502_0011
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260502_0012"
down_revision = "20260502_0011"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _add(table: str, name: str, column) -> None:
    if name not in _columns(table):
        op.add_column(table, column)


def upgrade() -> None:
    _add(
        "invoice",
        "taxable_amount",
        sa.Column("taxable_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add(
        "invoice",
        "tax_amount",
        sa.Column("tax_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add("invoice", "tax_rule_id", sa.Column("tax_rule_id", sa.String(), nullable=True))
    _add(
        "invoice",
        "discount_approval_id",
        sa.Column("discount_approval_id", sa.String(), nullable=True),
    )

    existing = _tables()
    if "taxrule" not in existing:
        op.create_table(
            "taxrule",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("tax_percentage", sa.Integer(), nullable=False),
            sa.Column("tax_label", sa.String(length=40), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_taxrule_tenant_id", "taxrule", ["tenant_id"])
        op.create_index("ix_taxrule_branch_id", "taxrule", ["branch_id"])
        op.create_index("ix_taxrule_is_active", "taxrule", ["is_active"])
    if "discountapproval" not in existing:
        op.create_table(
            "discountapproval",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("appointment_id", sa.String(), nullable=True),
            sa.Column("consultation_id", sa.String(), nullable=True),
            sa.Column("requested_amount", sa.Integer(), nullable=False),
            sa.Column("reason", sa.String(length=500), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("requested_by_user_id", sa.String(), nullable=True),
            sa.Column("approved_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
        )
        op.create_index(
            "ix_discountapproval_tenant_id", "discountapproval", ["tenant_id"]
        )
        op.create_index(
            "ix_discountapproval_branch_id", "discountapproval", ["branch_id"]
        )
        op.create_index("ix_discountapproval_status", "discountapproval", ["status"])
    if "creditnote" not in existing:
        op.create_table(
            "creditnote",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("invoice_id", sa.String(), nullable=False),
            sa.Column("credit_note_number", sa.String(length=60), nullable=False),
            sa.Column("amount", sa.Integer(), nullable=False),
            sa.Column("reason", sa.String(length=500), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_creditnote_tenant_id", "creditnote", ["tenant_id"])
        op.create_index("ix_creditnote_branch_id", "creditnote", ["branch_id"])
        op.create_index("ix_creditnote_invoice_id", "creditnote", ["invoice_id"])
    if "doctorsettlement" not in existing:
        op.create_table(
            "doctorsettlement",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("practitioner_id", sa.String(), nullable=True),
            sa.Column("invoice_count", sa.Integer(), nullable=False),
            sa.Column("total_invoice_amount", sa.Integer(), nullable=False),
            sa.Column("total_paid_amount", sa.Integer(), nullable=False),
            sa.Column("total_doctor_share", sa.Integer(), nullable=False),
            sa.Column("settlement_amount", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("finalized_by_user_id", sa.String(), nullable=True),
            sa.Column("finalized_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_doctorsettlement_tenant_id", "doctorsettlement", ["tenant_id"]
        )
        op.create_index(
            "ix_doctorsettlement_branch_id", "doctorsettlement", ["branch_id"]
        )
        op.create_index(
            "ix_doctorsettlement_practitioner_id",
            "doctorsettlement",
            ["practitioner_id"],
        )


def downgrade() -> None:
    for table in ["doctorsettlement", "creditnote", "discountapproval", "taxrule"]:
        if table in _tables():
            op.drop_table(table)
    for name in ["discount_approval_id", "tax_rule_id", "tax_amount", "taxable_amount"]:
        if name in _columns("invoice"):
            op.drop_column("invoice", name)
