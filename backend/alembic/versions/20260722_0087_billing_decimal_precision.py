"""Store billing money and percentages without whole-number rounding.

Revision ID: 20260722_0087
Revises: 20260722_0086
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260722_0087"
down_revision: str | None = "20260722_0086"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


MONEY_COLUMNS: dict[str, tuple[str, ...]] = {
    "doctorfeerule": ("fee_amount", "doctor_fixed_amount"),
    "invoice": (
        "subtotal_amount",
        "discount_amount",
        "membership_discount_amount",
        "membership_free_items_amount",
        "membership_item_discount_amount",
        "membership_regular_items_amount",
        "taxable_amount",
        "tax_amount",
        "total_amount",
        "paid_amount",
        "balance_amount",
        "doctor_share_amount",
        "clinic_share_amount",
    ),
    "invoiceitem": (
        "unit_amount",
        "total_amount",
        "discount_amount",
        "membership_discount_amount",
        "mrp_amount",
        "selling_amount",
        "buying_amount",
    ),
    "billingledgerentry": (
        "debit_amount",
        "credit_amount",
        "invoice_total_delta",
        "paid_amount_delta",
        "balance_amount_delta",
    ),
    "payment": ("amount", "refunded_amount"),
    "billingadjustmentrequest": ("amount",),
    "discountapproval": ("requested_amount",),
    "discountoffer": ("minimum_bill_amount", "max_discount_amount"),
    "creditnote": ("amount",),
    "doctorsettlement": (
        "total_invoice_amount",
        "total_paid_amount",
        "total_doctor_share",
        "settlement_amount",
    ),
}

PERCENT_COLUMNS: dict[str, tuple[str, ...]] = {
    "taxrule": ("tax_percentage",),
    "doctorfeerule": ("doctor_share_percentage",),
    "discountoffer": ("value",),
}


def _alter_columns(target_type: sa.types.TypeEngine) -> None:
    for table_name, columns in MONEY_COLUMNS.items():
        for column_name in columns:
            op.alter_column(
                table_name,
                column_name,
                existing_type=sa.Integer(),
                type_=target_type,
                postgresql_using=f'"{column_name}"::{target_type.compile()}',
            )


def upgrade() -> None:
    _alter_columns(sa.Numeric(14, 2))
    for table_name, columns in PERCENT_COLUMNS.items():
        for column_name in columns:
            op.alter_column(
                table_name,
                column_name,
                existing_type=sa.Integer(),
                type_=sa.Numeric(14, 4),
                postgresql_using=f'"{column_name}"::numeric(14,4)',
            )


def downgrade() -> None:
    for table_name, columns in PERCENT_COLUMNS.items():
        for column_name in columns:
            op.alter_column(
                table_name,
                column_name,
                existing_type=sa.Numeric(14, 4),
                type_=sa.Integer(),
                postgresql_using=f'round("{column_name}")::integer',
            )
    for table_name, columns in reversed(tuple(MONEY_COLUMNS.items())):
        for column_name in columns:
            op.alter_column(
                table_name,
                column_name,
                existing_type=sa.Numeric(14, 2),
                type_=sa.Integer(),
                postgresql_using=f'round("{column_name}")::integer',
            )
