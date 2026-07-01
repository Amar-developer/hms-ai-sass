"""pharmacy purchase tax returns

Revision ID: 20260502_0015
Revises: 20260502_0014
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260502_0015"
down_revision = "20260502_0014"
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
        "pharmacypurchase",
        "purchase_order_id",
        sa.Column("purchase_order_id", sa.String(length=120), nullable=True),
    )
    _add(
        "pharmacypurchase",
        "purchase_date",
        sa.Column("purchase_date", sa.DateTime(), nullable=True),
    )
    _add(
        "pharmacypurchase",
        "discount_percentage",
        sa.Column(
            "discount_percentage", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    _add(
        "pharmacypurchase",
        "discount_amount",
        sa.Column("discount_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add(
        "pharmacypurchase",
        "taxable_amount",
        sa.Column("taxable_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add(
        "pharmacypurchase",
        "cgst_amount",
        sa.Column("cgst_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add(
        "pharmacypurchase",
        "sgst_amount",
        sa.Column("sgst_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add(
        "pharmacypurchase",
        "gst_amount",
        sa.Column("gst_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    for name in [
        "discount_percentage",
        "discount_amount",
        "taxable_amount",
        "cgst_percentage",
        "sgst_percentage",
        "cgst_amount",
        "sgst_amount",
        "gst_amount",
        "line_total",
    ]:
        _add(
            "pharmacypurchaseitem",
            name,
            sa.Column(name, sa.Integer(), nullable=False, server_default="0"),
        )
    existing = _tables()
    if "pharmacyreturn" not in existing:
        op.create_table(
            "pharmacyreturn",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("supplier_id", sa.String(), nullable=True),
            sa.Column("purchase_id", sa.String(), nullable=True),
            sa.Column("return_date", sa.DateTime(), nullable=False),
            sa.Column("reason", sa.String(length=500), nullable=False),
            sa.Column("total_amount", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("returned_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_pharmacyreturn_tenant_id", "pharmacyreturn", ["tenant_id"])
        op.create_index("ix_pharmacyreturn_branch_id", "pharmacyreturn", ["branch_id"])
        op.create_index(
            "ix_pharmacyreturn_purchase_id", "pharmacyreturn", ["purchase_id"]
        )
    if "pharmacyreturnitem" not in existing:
        op.create_table(
            "pharmacyreturnitem",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("return_id", sa.String(), nullable=False),
            sa.Column("medicine_id", sa.String(), nullable=False),
            sa.Column("batch_id", sa.String(), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("amount", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_pharmacyreturnitem_tenant_id", "pharmacyreturnitem", ["tenant_id"]
        )
        op.create_index(
            "ix_pharmacyreturnitem_return_id", "pharmacyreturnitem", ["return_id"]
        )


def downgrade() -> None:
    for table in ["pharmacyreturnitem", "pharmacyreturn"]:
        if table in _tables():
            op.drop_table(table)
    for name in [
        "line_total",
        "gst_amount",
        "sgst_amount",
        "cgst_amount",
        "sgst_percentage",
        "cgst_percentage",
        "taxable_amount",
        "discount_amount",
        "discount_percentage",
    ]:
        if name in _columns("pharmacypurchaseitem"):
            op.drop_column("pharmacypurchaseitem", name)
    for name in [
        "gst_amount",
        "sgst_amount",
        "cgst_amount",
        "taxable_amount",
        "discount_amount",
        "discount_percentage",
        "purchase_date",
        "purchase_order_id",
    ]:
        if name in _columns("pharmacypurchase"):
            op.drop_column("pharmacypurchase", name)
