"""subscription management lifecycle

Revision ID: 20260502_0010
Revises: 20260501_0009
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260502_0010"
down_revision = "20260501_0009"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _tables() -> set[str]:
    return set(inspect(op.get_bind()).get_table_names())


def _add(table: str, name: str, column) -> None:
    if name not in _columns(table):
        op.add_column(table, column)


def upgrade() -> None:
    _add("subscriptionplan", "created_by_user_id", sa.Column("created_by_user_id", sa.String(), nullable=True))
    _add("subscriptionplan", "updated_by_user_id", sa.Column("updated_by_user_id", sa.String(), nullable=True))
    _add("subscriptionplan", "updated_at", sa.Column("updated_at", sa.DateTime(), nullable=True))

    _add("tenantsubscription", "status", sa.Column("status", sa.String(), nullable=False, server_default="active"))
    _add("tenantsubscription", "billing_amount", sa.Column("billing_amount", sa.Integer(), nullable=False, server_default="0"))
    _add("tenantsubscription", "notes", sa.Column("notes", sa.String(length=1000), nullable=True))
    _add("tenantsubscription", "created_by_user_id", sa.Column("created_by_user_id", sa.String(), nullable=True))
    _add("tenantsubscription", "updated_by_user_id", sa.Column("updated_by_user_id", sa.String(), nullable=True))
    _add("tenantsubscription", "updated_at", sa.Column("updated_at", sa.DateTime(), nullable=True))

    existing_tables = _tables()
    if "subscriptioncredit" not in existing_tables:
        op.create_table(
            "subscriptioncredit",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("subscription_id", sa.String(), nullable=True),
            sa.Column("credit_type", sa.String(length=80), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("used_quantity", sa.Integer(), nullable=False),
            sa.Column("amount", sa.Integer(), nullable=False),
            sa.Column("starts_on", sa.Date(), nullable=False),
            sa.Column("expires_on", sa.Date(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("reason", sa.String(length=500), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_subscriptioncredit_tenant_id", "subscriptioncredit", ["tenant_id"])
        op.create_index("ix_subscriptioncredit_subscription_id", "subscriptioncredit", ["subscription_id"])
        op.create_index("ix_subscriptioncredit_status", "subscriptioncredit", ["status"])

    if "subscriptioninvoice" not in existing_tables:
        op.create_table(
            "subscriptioninvoice",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("subscription_id", sa.String(), nullable=True),
            sa.Column("credit_id", sa.String(), nullable=True),
            sa.Column("invoice_number", sa.String(length=80), nullable=False),
            sa.Column("description", sa.String(length=500), nullable=False),
            sa.Column("amount", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("issued_on", sa.Date(), nullable=False),
            sa.Column("due_on", sa.Date(), nullable=True),
            sa.Column("paid_on", sa.Date(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_subscriptioninvoice_tenant_id", "subscriptioninvoice", ["tenant_id"])
        op.create_index("ix_subscriptioninvoice_subscription_id", "subscriptioninvoice", ["subscription_id"])
        op.create_index("ix_subscriptioninvoice_credit_id", "subscriptioninvoice", ["credit_id"])
        op.create_index("ix_subscriptioninvoice_invoice_number", "subscriptioninvoice", ["invoice_number"])
        op.create_index("ix_subscriptioninvoice_status", "subscriptioninvoice", ["status"])


def downgrade() -> None:
    existing_tables = _tables()
    if "subscriptioninvoice" in existing_tables:
        op.drop_table("subscriptioninvoice")
    if "subscriptioncredit" in existing_tables:
        op.drop_table("subscriptioncredit")
    for table, names in {
        "tenantsubscription": ["updated_at", "updated_by_user_id", "created_by_user_id", "notes", "billing_amount", "status"],
        "subscriptionplan": ["updated_at", "updated_by_user_id", "created_by_user_id"],
    }.items():
        existing = _columns(table)
        for name in names:
            if name in existing:
                op.drop_column(table, name)
