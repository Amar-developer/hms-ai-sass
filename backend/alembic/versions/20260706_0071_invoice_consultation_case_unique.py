"""Add unique indexes on Invoice.consultation_id and Invoice.physiotherapy_case_id.

Closes a check-then-insert race: sign-consultation and generate-physiotherapy
-invoice both looked up "does an invoice already exist for this
consultation/case" with a plain unlocked SELECT before inserting, so two
concurrent requests could both pass the check and create duplicate invoices.
Neither column previously had an index at all, despite the model declaring
index=True, so this is a net-new, purely additive constraint. NULL is not
considered equal to NULL by a unique index in either SQLite or Postgres, so
invoices with no consultation/case link (lab, pharmacy, subscription, etc.)
are unaffected.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260706_0071"
down_revision = "20260706_0070"
branch_labels = None
depends_on = None


def _indexes(table_name: str) -> set[str]:
    return {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def upgrade() -> None:
    existing = _indexes("invoice")
    if "uq_invoice_consultation_id" not in existing:
        op.create_index(
            "uq_invoice_consultation_id",
            "invoice",
            ["consultation_id"],
            unique=True,
        )
    if "uq_invoice_physiotherapy_case_id" not in existing:
        op.create_index(
            "uq_invoice_physiotherapy_case_id",
            "invoice",
            ["physiotherapy_case_id"],
            unique=True,
        )


def downgrade() -> None:
    existing = _indexes("invoice")
    if "uq_invoice_physiotherapy_case_id" in existing:
        op.drop_index("uq_invoice_physiotherapy_case_id", table_name="invoice")
    if "uq_invoice_consultation_id" in existing:
        op.drop_index("uq_invoice_consultation_id", table_name="invoice")
