"""subscription revenue operations

Revision ID: 20260502_0017
Revises: 20260502_0016
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa

revision = "20260502_0017"
down_revision = "20260502_0016"
branch_labels = None
depends_on = None


def _add(table_name: str, column_name: str, column: sa.Column) -> None:
    bind = op.get_bind()
    existing = {col["name"] for col in sa.inspect(bind).get_columns(table_name)}
    if column_name not in existing:
        op.add_column(table_name, column)


def upgrade() -> None:
    _add(
        "subscriptioninvoice",
        "taxable_amount",
        sa.Column("taxable_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add(
        "subscriptioninvoice",
        "tax_amount",
        sa.Column("tax_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add(
        "subscriptioninvoice",
        "total_amount",
        sa.Column("total_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add(
        "subscriptioninvoice",
        "paid_amount",
        sa.Column("paid_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add(
        "subscriptioninvoice",
        "balance_amount",
        sa.Column("balance_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add(
        "subscriptioninvoice",
        "payment_method",
        sa.Column("payment_method", sa.String(length=80), nullable=True),
    )
    _add(
        "subscriptioninvoice",
        "payment_reference",
        sa.Column("payment_reference", sa.String(length=160), nullable=True),
    )
    _add(
        "subscriptioninvoice",
        "gateway_transaction_id",
        sa.Column("gateway_transaction_id", sa.String(length=160), nullable=True),
    )
    _add(
        "subscriptioninvoice",
        "gateway_status",
        sa.Column("gateway_status", sa.String(length=80), nullable=True),
    )
    _add(
        "subscriptioninvoice",
        "failed_reason",
        sa.Column("failed_reason", sa.String(length=500), nullable=True),
    )
    _add(
        "subscriptioninvoice",
        "last_payment_attempt_at",
        sa.Column("last_payment_attempt_at", sa.DateTime(), nullable=True),
    )
    op.execute(
        "UPDATE subscriptioninvoice SET taxable_amount = amount WHERE taxable_amount = 0"
    )
    op.execute(
        "UPDATE subscriptioninvoice SET total_amount = amount WHERE total_amount = 0"
    )
    op.execute(
        "UPDATE subscriptioninvoice SET balance_amount = amount WHERE balance_amount = 0 AND status != 'PAID'"
    )
    op.execute(
        "UPDATE subscriptioninvoice SET paid_amount = amount, balance_amount = 0 WHERE status = 'PAID'"
    )


def downgrade() -> None:
    for column_name in [
        "last_payment_attempt_at",
        "failed_reason",
        "gateway_status",
        "gateway_transaction_id",
        "payment_reference",
        "payment_method",
        "balance_amount",
        "paid_amount",
        "total_amount",
        "tax_amount",
        "taxable_amount",
    ]:
        op.drop_column("subscriptioninvoice", column_name)
