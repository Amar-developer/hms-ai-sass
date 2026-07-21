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

CHANGED: uq_invoice_consultation_id is a partial index (WHERE lab_order_id,
pharmacy_issue_id, ip_admission_id and physiotherapy_case_id are all NULL)
rather than a plain unique index. A lab-order or pharmacy-issue invoice
legitimately copies the consultation's id onto its own row when the order/
issue is linked to that consultation, so an unscoped unique index would
reject that valid coexistence alongside the "real" consultation invoice.

CHANGED: because production already had duplicate rows sharing a
consultation_id (an unconditional-insert bug in create_consultation_invoice
plus an unlocked check-then-insert in the manual "generate invoice from
consultation" endpoint, both predating this migration), upgrade() first
de-duplicates: for each (tenant_id, consultation_id) group of "pure"
consultation invoices, it keeps the one with the highest total_amount
(ties broken by the most recently created row) and detaches the rest
(consultation_id set to NULL, status set to cancelled) so the new index
can be created without failing and the cancelled duplicates remain in the
table for audit purposes.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260706_0071"
down_revision = "20260706_0070"
branch_labels = None
depends_on = None


_PARTIAL_WHERE = (
    "lab_order_id IS NULL AND pharmacy_issue_id IS NULL "
    "AND ip_admission_id IS NULL AND physiotherapy_case_id IS NULL"
)


def _indexes(table_name: str) -> set[str]:
    return {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def _dedupe_consultation_invoices() -> None:
    bind = op.get_bind()
    invoice = sa.table(
        "invoice",
        sa.column("id", sa.String),
        sa.column("tenant_id", sa.String),
        sa.column("consultation_id", sa.String),
        sa.column("lab_order_id", sa.String),
        sa.column("pharmacy_issue_id", sa.String),
        sa.column("ip_admission_id", sa.String),
        sa.column("physiotherapy_case_id", sa.String),
        sa.column("total_amount", sa.Integer),
        sa.column("created_at", sa.DateTime),
        sa.column("status", sa.String),
    )
    rows = bind.execute(
        sa.select(
            invoice.c.id,
            invoice.c.tenant_id,
            invoice.c.consultation_id,
            invoice.c.total_amount,
            invoice.c.created_at,
        ).where(
            invoice.c.consultation_id.is_not(None),
            invoice.c.lab_order_id.is_(None),
            invoice.c.pharmacy_issue_id.is_(None),
            invoice.c.ip_admission_id.is_(None),
            invoice.c.physiotherapy_case_id.is_(None),
        )
    ).all()

    groups: dict[tuple[str, str], list] = {}
    for row in rows:
        groups.setdefault((row.tenant_id, row.consultation_id), []).append(row)

    for group_rows in groups.values():
        if len(group_rows) <= 1:
            continue
        # Keep the highest-total invoice (the ₹0 placeholder loses to any
        # real-amount invoice); break ties by the most recently created row.
        keeper = max(group_rows, key=lambda r: (r.total_amount, r.created_at))
        for row in group_rows:
            if row.id == keeper.id:
                continue
            bind.execute(
                invoice.update()
                .where(invoice.c.id == row.id)
                .values(consultation_id=None, status="cancelled")
            )


def upgrade() -> None:
    _dedupe_consultation_invoices()
    existing = _indexes("invoice")
    if "uq_invoice_consultation_id" not in existing:
        op.create_index(
            "uq_invoice_consultation_id",
            "invoice",
            ["consultation_id"],
            unique=True,
            postgresql_where=sa.text(_PARTIAL_WHERE),
            sqlite_where=sa.text(_PARTIAL_WHERE),
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
