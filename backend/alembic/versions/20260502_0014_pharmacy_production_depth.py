"""pharmacy production depth

Revision ID: 20260502_0014
Revises: 20260502_0013
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260502_0014"
down_revision = "20260502_0013"
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
    existing = _tables()
    if "medicinecatalog" not in existing:
        op.create_table(
            "medicinecatalog",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("code", sa.String(length=60), nullable=False),
            sa.Column("name", sa.String(length=220), nullable=False),
            sa.Column("generic_name", sa.String(length=220), nullable=True),
            sa.Column("form", sa.String(length=80), nullable=True),
            sa.Column("strength", sa.String(length=80), nullable=True),
            sa.Column("manufacturer", sa.String(length=220), nullable=True),
            sa.Column(
                "default_sale_price", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "reorder_level", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
            ),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_medicinecatalog_tenant_id", "medicinecatalog", ["tenant_id"]
        )
        op.create_index(
            "ix_medicinecatalog_branch_id", "medicinecatalog", ["branch_id"]
        )
        op.create_index("ix_medicinecatalog_code", "medicinecatalog", ["code"])
        op.create_index("ix_medicinecatalog_name", "medicinecatalog", ["name"])
        op.create_index(
            "ix_medicinecatalog_generic_name", "medicinecatalog", ["generic_name"]
        )
    if "pharmacysupplier" not in existing:
        op.create_table(
            "pharmacysupplier",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(length=220), nullable=False),
            sa.Column("gstin", sa.String(length=40), nullable=True),
            sa.Column("phone", sa.String(length=40), nullable=True),
            sa.Column("email", sa.String(length=160), nullable=True),
            sa.Column("address", sa.String(length=500), nullable=True),
            sa.Column(
                "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
            ),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_pharmacysupplier_tenant_id", "pharmacysupplier", ["tenant_id"]
        )
        op.create_index("ix_pharmacysupplier_name", "pharmacysupplier", ["name"])
    if "pharmacypurchase" not in existing:
        op.create_table(
            "pharmacypurchase",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("supplier_id", sa.String(), nullable=True),
            sa.Column("invoice_number", sa.String(length=120), nullable=True),
            sa.Column("total_amount", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("purchased_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_pharmacypurchase_tenant_id", "pharmacypurchase", ["tenant_id"]
        )
        op.create_index(
            "ix_pharmacypurchase_branch_id", "pharmacypurchase", ["branch_id"]
        )
        op.create_index(
            "ix_pharmacypurchase_supplier_id", "pharmacypurchase", ["supplier_id"]
        )
    if "medicinebatch" not in existing:
        op.create_table(
            "medicinebatch",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("medicine_id", sa.String(), nullable=False),
            sa.Column("purchase_id", sa.String(), nullable=True),
            sa.Column("batch_number", sa.String(length=120), nullable=False),
            sa.Column("expiry_date", sa.DateTime(), nullable=True),
            sa.Column(
                "quantity_on_hand", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column("cost_price", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("sale_price", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_medicinebatch_tenant_id", "medicinebatch", ["tenant_id"])
        op.create_index("ix_medicinebatch_branch_id", "medicinebatch", ["branch_id"])
        op.create_index(
            "ix_medicinebatch_medicine_id", "medicinebatch", ["medicine_id"]
        )
        op.create_index(
            "ix_medicinebatch_batch_number", "medicinebatch", ["batch_number"]
        )
        op.create_index(
            "ix_medicinebatch_expiry_date", "medicinebatch", ["expiry_date"]
        )
    if "pharmacypurchaseitem" not in existing:
        op.create_table(
            "pharmacypurchaseitem",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("purchase_id", sa.String(), nullable=False),
            sa.Column("medicine_id", sa.String(), nullable=False),
            sa.Column("batch_id", sa.String(), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("cost_price", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("sale_price", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_pharmacypurchaseitem_tenant_id", "pharmacypurchaseitem", ["tenant_id"]
        )
        op.create_index(
            "ix_pharmacypurchaseitem_purchase_id",
            "pharmacypurchaseitem",
            ["purchase_id"],
        )
    if "pharmacystockledger" not in existing:
        op.create_table(
            "pharmacystockledger",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("medicine_id", sa.String(), nullable=False),
            sa.Column("batch_id", sa.String(), nullable=True),
            sa.Column("movement_type", sa.String(), nullable=False),
            sa.Column("quantity_delta", sa.Integer(), nullable=False),
            sa.Column("balance_after", sa.Integer(), nullable=False),
            sa.Column("reference_type", sa.String(length=80), nullable=True),
            sa.Column("reference_id", sa.String(length=120), nullable=True),
            sa.Column("actor_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_pharmacystockledger_tenant_id", "pharmacystockledger", ["tenant_id"]
        )
        op.create_index(
            "ix_pharmacystockledger_branch_id", "pharmacystockledger", ["branch_id"]
        )
        op.create_index(
            "ix_pharmacystockledger_medicine_id", "pharmacystockledger", ["medicine_id"]
        )
    if "pharmacyissueitem" not in existing:
        op.create_table(
            "pharmacyissueitem",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("pharmacy_issue_id", sa.String(), nullable=False),
            sa.Column("medicine_id", sa.String(), nullable=True),
            sa.Column("substitute_for_medicine_id", sa.String(), nullable=True),
            sa.Column("batch_id", sa.String(), nullable=True),
            sa.Column("medicine_name", sa.String(length=220), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("unit_price", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "dispensed_quantity", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_pharmacyissueitem_tenant_id", "pharmacyissueitem", ["tenant_id"]
        )
        op.create_index(
            "ix_pharmacyissueitem_pharmacy_issue_id",
            "pharmacyissueitem",
            ["pharmacy_issue_id"],
        )
    _add(
        "pharmacyissue",
        "billing_invoice_id",
        sa.Column("billing_invoice_id", sa.String(), nullable=True),
    )


def downgrade() -> None:
    for table in [
        "pharmacyissueitem",
        "pharmacystockledger",
        "pharmacypurchaseitem",
        "medicinebatch",
        "pharmacypurchase",
        "pharmacysupplier",
        "medicinecatalog",
    ]:
        if table in _tables():
            op.drop_table(table)
    if "billing_invoice_id" in _columns("pharmacyissue"):
        op.drop_column("pharmacyissue", "billing_invoice_id")
