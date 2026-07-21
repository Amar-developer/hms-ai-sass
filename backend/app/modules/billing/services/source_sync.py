from datetime import datetime, timezone

from sqlmodel import Session

from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.billing.repositories.source_sync_repository import (
    BillingSourceSyncRepository,
)
from app.modules.tenants.models import now_utc


def sync_physiotherapy_case_status(session: Session, invoice: Invoice) -> None:
    case = BillingSourceSyncRepository(session).get_physiotherapy_case_for_invoice(
        invoice
    )
    if not case:
        return
    target_status = (
        "paid"
        if invoice.status not in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}
        and invoice.balance_amount <= 0
        and invoice.total_amount > 0
        else "completed"
    )
    if case.status == target_status:
        return
    case.status = target_status
    case.updated_at = now_utc()
    session.add(case)
    session.commit()


def sync_home_care_booking_status(session: Session, invoice: Invoice) -> None:
    booking = BillingSourceSyncRepository(session).get_home_care_booking_for_invoice(
        invoice
    )
    if not booking:
        return
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        # Reopen a voided source booking so it can be corrected and re-billed.
        target_status = "scheduled"
    elif invoice.balance_amount <= 0 and invoice.total_amount > 0:
        target_status = "paid"
    else:
        target_status = "invoiced"
    if booking.status == target_status:
        return
    booking.status = target_status
    booking.updated_at = now_utc()
    session.add(booking)
    session.commit()


def sync_patient_membership_payment(session: Session, invoice: Invoice) -> None:
    enrollment = BillingSourceSyncRepository(
        session
    ).get_patient_subscription_enrollment_for_invoice(invoice)
    if not enrollment:
        return
    # Only the plan-purchase invoice drives the membership's paid amount.
    # Benefit-usage invoices also carry the enrollment id, but their payment or
    # reversal must not overwrite the membership purchase payment state.
    is_purchase_invoice = (
        invoice.id == enrollment.purchase_invoice_id
        if enrollment.purchase_invoice_id
        else not (
            invoice.lab_order_id
            or invoice.pharmacy_issue_id
            or invoice.consultation_id
            or invoice.ip_admission_id
            or invoice.physiotherapy_case_id
            or invoice.home_care_booking_id
        )
    )
    if not is_purchase_invoice:
        return
    paid_amount = max(
        0, min(int(invoice.paid_amount or 0), int(invoice.total_amount or 0))
    )
    if enrollment.paid_amount == paid_amount:
        return
    enrollment.paid_amount = paid_amount
    enrollment.updated_at = datetime.now(timezone.utc)
    session.add(enrollment)
    session.commit()


def sync_invoice_source_after_reversal(session: Session, invoice: Invoice) -> None:
    sync_physiotherapy_case_status(session, invoice)
    sync_home_care_booking_status(session, invoice)
    sync_patient_membership_payment(session, invoice)
    issue = BillingSourceSyncRepository(session).get_pharmacy_issue_for_invoice(invoice)
    if issue:
        if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
            issue.billing_invoice_id = None
        else:
            issue.billing_invoice_id = invoice.id
        issue.updated_at = datetime.now(timezone.utc)
        session.add(issue)
        session.commit()
