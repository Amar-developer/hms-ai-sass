"""separate service invoice links

Revision ID: 20260514_0030
Revises: 20260513_0029
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa


revision = "20260514_0030"
down_revision = "20260513_0029"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    columns = _columns("invoice")
    if "lab_order_id" not in columns:
        op.add_column("invoice", sa.Column("lab_order_id", sa.String(), nullable=True))
    if "pharmacy_issue_id" not in columns:
        op.add_column("invoice", sa.Column("pharmacy_issue_id", sa.String(), nullable=True))

    indexes = _indexes("invoice")
    if "ix_invoice_lab_order_id" not in indexes:
        op.create_index("ix_invoice_lab_order_id", "invoice", ["lab_order_id"])
    if "ix_invoice_pharmacy_issue_id" not in indexes:
        op.create_index("ix_invoice_pharmacy_issue_id", "invoice", ["pharmacy_issue_id"])


def downgrade() -> None:
    indexes = _indexes("invoice")
    if "ix_invoice_pharmacy_issue_id" in indexes:
        op.drop_index("ix_invoice_pharmacy_issue_id", table_name="invoice")
    if "ix_invoice_lab_order_id" in indexes:
        op.drop_index("ix_invoice_lab_order_id", table_name="invoice")

    columns = _columns("invoice")
    if "pharmacy_issue_id" in columns:
        op.drop_column("invoice", "pharmacy_issue_id")
    if "lab_order_id" in columns:
        op.drop_column("invoice", "lab_order_id")
