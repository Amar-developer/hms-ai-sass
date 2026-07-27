from sqlalchemy import event
from sqlmodel import Session

from app.modules.billing.models import Invoice, InvoiceStatus, Payment, PaymentMethod
from app.modules.billing.repositories.read_repository import BillingReadRepository
from app.modules.billing.services.read_models import invoice_reads


def test_invoice_list_batches_related_data_queries(test_engine):
    with Session(test_engine) as session:
        for index in range(25):
            invoice = Invoice(
                tenant_id="tenant_invoice_batch",
                branch_id="branch_invoice_batch",
                patient_id=f"patient-{index}",
                invoice_number=f"BATCH-INV-{index:03d}",
                status=InvoiceStatus.PAID,
                subtotal_amount=100,
                total_amount=100,
                paid_amount=100,
                balance_amount=0,
            )
            session.add(invoice)
            session.flush()
            session.add(
                Payment(
                    tenant_id=invoice.tenant_id,
                    branch_id=invoice.branch_id,
                    invoice_id=invoice.id,
                    method=PaymentMethod.CASH,
                    amount=100,
                )
            )
        session.commit()

    statements = 0

    def count_statement(*_args):
        nonlocal statements
        statements += 1

    with Session(test_engine) as session:
        invoices = BillingReadRepository(session).list_invoices(
            tenant_id="tenant_invoice_batch",
            branch_id=None,
            patient_id=None,
        )
        event.listen(test_engine, "before_cursor_execute", count_statement)
        try:
            rows = invoice_reads(session, invoices)
        finally:
            event.remove(test_engine, "before_cursor_execute", count_statement)

    assert len(rows) == 25
    assert all(row.payment_methods == [PaymentMethod.CASH] for row in rows)
    assert all(row.status == InvoiceStatus.PAID for row in rows)
    # Payments, adjustments/discount metadata, and patient display references
    # are fetched in three bounded queries regardless of invoice count.
    assert statements == 3
