"""repair subscription metadata columns for upgraded local databases

Revision ID: 20260507_0021
Revises: 20260505_0020
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260507_0021"
down_revision = "20260505_0020"
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
        "subscriptionplan",
        "created_by_user_id",
        sa.Column("created_by_user_id", sa.String(), nullable=True),
    )
    _add(
        "subscriptionplan",
        "updated_by_user_id",
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
    )
    _add(
        "subscriptionplan",
        "updated_at",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    if "subscriptionplan" in _tables():
        op.execute(
            "UPDATE subscriptionplan SET updated_at = created_at WHERE updated_at IS NULL"
        )

    _add(
        "tenantsubscription",
        "status",
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
    )
    _add(
        "tenantsubscription",
        "billing_amount",
        sa.Column("billing_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    _add(
        "tenantsubscription",
        "notes",
        sa.Column("notes", sa.String(length=1000), nullable=True),
    )
    _add(
        "tenantsubscription",
        "created_by_user_id",
        sa.Column("created_by_user_id", sa.String(), nullable=True),
    )
    _add(
        "tenantsubscription",
        "updated_by_user_id",
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
    )
    _add(
        "tenantsubscription",
        "updated_at",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    if "tenantsubscription" in _tables():
        op.execute(
            "UPDATE tenantsubscription SET updated_at = created_at WHERE updated_at IS NULL"
        )

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
        sa.Column("last_payment_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )
    if "subscriptioninvoice" in _tables():
        invoice_columns = _columns("subscriptioninvoice")
        if {
            "amount",
            "taxable_amount",
            "total_amount",
            "balance_amount",
            "paid_amount",
            "status",
        }.issubset(invoice_columns):
            op.execute(
                "UPDATE subscriptioninvoice SET taxable_amount = amount WHERE taxable_amount = 0"
            )
            op.execute(
                "UPDATE subscriptioninvoice SET total_amount = amount WHERE total_amount = 0"
            )
            status_text = (
                "status::text"
                if op.get_bind().dialect.name == "postgresql"
                else "status"
            )
            op.execute(
                f"UPDATE subscriptioninvoice SET balance_amount = amount "
                f"WHERE balance_amount = 0 AND lower({status_text}) != 'paid'"
            )
            op.execute(
                f"UPDATE subscriptioninvoice SET paid_amount = amount, balance_amount = 0 "
                f"WHERE lower({status_text}) = 'paid'"
            )


def downgrade() -> None:
    # Repair migrations are intentionally non-destructive.
    pass
