from sqlalchemy import event
from sqlmodel import Session

from app.modules.billing.models import (
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    Payment,
    PaymentMethod,
)
from app.modules.billing.repositories.read_repository import BillingReadRepository
from app.modules.billing.services.read_models import invoice_reads
from app.modules.billing.services.ledger import read_invoice_detail_full
from app.modules.patients.models import Patient


def test_invoice_list_batches_related_data_queries(test_engine):
    with Session(test_engine) as session:
        for index in range(25):
            patient = Patient(
                id=f"patient-{index}",
                tenant_id="tenant_invoice_batch",
                patient_number=f"PAT-BATCH-{index:03d}",
                full_name=f"Billing Patient {index}",
                mobile=f"900000{index:04d}",
            )
            session.add(patient)
            invoice = Invoice(
                tenant_id="tenant_invoice_batch",
                branch_id="branch_invoice_batch",
                patient_id=patient.id,
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


def test_invoice_page_filters_and_count_run_in_database(test_engine):
    tenant_id = "tenant_invoice_page"
    with Session(test_engine) as session:
        patient = Patient(
            tenant_id=tenant_id,
            patient_number="PAT-PAGE-001",
            full_name="Anitha Billing Patient",
            mobile="9000000099",
        )
        session.add(patient)
        session.flush()
        session.add_all(
            [
                Invoice(
                    tenant_id=tenant_id,
                    branch_id="branch_invoice_page",
                    patient_id=patient.id,
                    invoice_number="PAGE-LAB-001",
                    lab_order_id="lab-page-1",
                    status=InvoiceStatus.PAID,
                    total_amount=100,
                    paid_amount=100,
                    balance_amount=0,
                ),
                Invoice(
                    tenant_id=tenant_id,
                    branch_id="branch_invoice_page",
                    patient_id=patient.id,
                    invoice_number="PAGE-PHARMACY-001",
                    pharmacy_issue_id="pharmacy-page-1",
                    status=InvoiceStatus.ISSUED,
                    total_amount=200,
                    paid_amount=0,
                    balance_amount=200,
                ),
            ]
        )
        session.commit()

    with Session(test_engine) as session:
        repo = BillingReadRepository(session)
        paid_lab_rows = repo.list_invoices(
            tenant_id=tenant_id,
            branch_id=None,
            patient_id=None,
            q="Anitha Billing",
            source="lab_scan",
            payment_state="paid",
            limit=10,
        )
        due_count = repo.count_invoices(
            tenant_id=tenant_id,
            branch_id=None,
            patient_id=None,
            source="pharmacy",
            payment_state="due",
        )

    assert [row.invoice_number for row in paid_lab_rows] == ["PAGE-LAB-001"]
    assert due_count == 1


def test_invoice_detail_read_does_not_repair_or_write_ledger(test_engine):
    with Session(test_engine) as session:
        invoice = Invoice(
            tenant_id="tenant_read_only_detail",
            branch_id="branch_read_only_detail",
            patient_id="patient_read_only_detail",
            invoice_number="READ-ONLY-001",
            status=InvoiceStatus.PAID,
            subtotal_amount=100,
            total_amount=100,
            paid_amount=100,
            balance_amount=0,
        )
        session.add(invoice)
        session.commit()
        session.refresh(invoice)
        statements: list[str] = []

        def capture_statement(_conn, _cursor, statement, *_args):
            statements.append(statement.strip().split(" ", 1)[0].upper())

        event.listen(test_engine, "before_cursor_execute", capture_statement)
        try:
            detail = read_invoice_detail_full(session, invoice)
        finally:
            event.remove(test_engine, "before_cursor_execute", capture_statement)

    assert detail.invoice.id == invoice.id
    assert statements
    assert set(statements) == {"SELECT"}


def test_report_invoice_items_and_payments_are_two_bounded_queries(test_engine):
    tenant_id = "tenant_report_batch"
    invoice_ids: set[str] = set()
    with Session(test_engine) as session:
        for index in range(25):
            invoice = Invoice(
                tenant_id=tenant_id,
                branch_id="branch_report_batch",
                patient_id=f"patient-report-{index}",
                invoice_number=f"REPORT-{index:03d}",
                status=InvoiceStatus.PAID,
                subtotal_amount=100,
                total_amount=100,
                paid_amount=100,
                balance_amount=0,
            )
            session.add(invoice)
            session.flush()
            invoice_ids.add(invoice.id)
            session.add(
                InvoiceItem(
                    tenant_id=tenant_id,
                    invoice_id=invoice.id,
                    item_type="service",
                    description="Service",
                    quantity=1,
                    unit_amount=100,
                    total_amount=100,
                )
            )
            session.add(
                Payment(
                    tenant_id=tenant_id,
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
        repo = BillingReadRepository(session)
        event.listen(test_engine, "before_cursor_execute", count_statement)
        try:
            items = repo.list_invoice_items_for_invoices(
                tenant_id=tenant_id, invoice_ids=invoice_ids
            )
            payments = repo.list_payments_for_invoices(
                tenant_id=tenant_id, invoice_ids=invoice_ids
            )
        finally:
            event.remove(test_engine, "before_cursor_execute", count_statement)

    assert len(items) == 25
    assert len(payments) == 25
    assert statements == 2
