from collections.abc import Callable
from datetime import timedelta

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import enforce_entitlement, require_user_branch_access
from app.core.config import get_settings
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.billing.models import Invoice, InvoiceStatus, Payment
from app.modules.billing.repositories.payment_repository import BillingPaymentRepository
from app.modules.billing.schemas import InvoiceDetailRead, PaymentCreate
from app.modules.billing.services.invoice_status import update_invoice_payment_status
from app.modules.identity.models import User
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import (
    queue_notification_if_allowed,
    queue_sms_template_if_allowed,
    queue_whatsapp_template_if_allowed,
    whatsapp_template_integration_enabled,
)
from app.modules.tenants.models import now_utc

LedgerRecorder = Callable[..., object]
InvoiceSyncer = Callable[[Session, Invoice], None]
InvoiceDetailReader = Callable[[Session, Invoice], InvoiceDetailRead]

INVOICE_PAYMENT_FIELDS = ("status", "paid_amount", "balance_amount")


def record_invoice_payment(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    payload: PaymentCreate,
    current_user: User,
    record_billing_ledger: LedgerRecorder,
    sync_physiotherapy_case_status: InvoiceSyncer,
    sync_home_care_booking_status: InvoiceSyncer,
    sync_patient_membership_payment: InvoiceSyncer,
    read_invoice_detail: InvoiceDetailReader,
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    payment_repo = BillingPaymentRepository(session)
    invoice = payment_repo.get_invoice_for_tenant(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot record payment for {invoice.status.value} invoice",
        )
    if payload.amount > invoice.balance_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount cannot exceed invoice balance",
        )

    before = {key: getattr(invoice, key) for key in INVOICE_PAYMENT_FIELDS}
    payment = Payment(
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        method=payload.method,
        amount=payload.amount,
        reference_number=payload.reference_number,
        collected_by_user_id=payload.collected_by_user_id,
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    invoice = update_invoice_payment_status(session, invoice)
    record_billing_ledger(
        session,
        invoice,
        entry_type="payment_recorded",
        description="Payment recorded",
        credit_amount=payment.amount,
        paid_amount_delta=payment.amount,
        balance_amount_delta=-payment.amount,
        actor_user_id=payload.collected_by_user_id or current_user.id,
        related_payment_id=payment.id,
    )
    sync_physiotherapy_case_status(session, invoice)
    sync_home_care_booking_status(session, invoice)
    sync_patient_membership_payment(session, invoice)
    patient = payment_repo.get_patient(invoice.patient_id)
    if (
        patient
        and invoice.status == InvoiceStatus.PAID
        and before["status"] != InvoiceStatus.PAID
        and get_settings().permanent_invoice_delivery_enabled
    ):
        paid_event = queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=invoice.branch_id,
            flow_key="invoice_paid_patient",
            recipient=patient.mobile,
            resource_type="invoice",
            resource_id=invoice.id,
            dedupe_key=f"whatsapp:invoice:{invoice.id}:paid",
            queued_by_user_id=payload.collected_by_user_id,
        )
        queue_sms_template_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=invoice.branch_id,
            flow_key="payment_receipt_patient",
            patient=patient,
            resource_type="invoice",
            resource_id=invoice.id,
            dedupe_key=f"sms:invoice:{invoice.id}:receipt",
            variables={
                "patient_name": patient.full_name,
                "invoice_number": invoice.invoice_number,
                "total_amount": f"{invoice.total_amount:.2f}",
            },
            queued_by_user_id=payload.collected_by_user_id,
        )
        if paid_event and paid_event.attempt_count == 0:
            # The SPA uploads the exact branded Print Invoice PDF immediately
            # after this response. Delay processing so the worker never races
            # ahead and falls back to a different document design.
            paid_event.next_attempt_at = now_utc() + timedelta(minutes=2)
            session.add(paid_event)
            session.commit()
    elif invoice.balance_amount > 0 and patient:
        queue_sms_template_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=invoice.branch_id,
            flow_key="payment_pending_patient",
            patient=patient,
            resource_type="invoice",
            resource_id=invoice.id,
            dedupe_key=f"sms:invoice:{invoice.id}:pending:{payment.id}",
            variables={
                "patient_name": patient.full_name,
                "invoice_number": invoice.invoice_number,
                "balance_amount": f"{invoice.balance_amount:.2f}",
            },
            queued_by_user_id=payload.collected_by_user_id,
        )
        pending_template_event = queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=invoice.branch_id,
            flow_key="payment_pending_patient",
            recipient=patient.mobile,
            resource_type="invoice",
            resource_id=invoice.id,
            dedupe_key=f"whatsapp:invoice:{invoice.id}:pending:{payment.id}",
            queued_by_user_id=payload.collected_by_user_id,
        )
        if not pending_template_event and not whatsapp_template_integration_enabled(
            session, tenant_id
        ):
            queue_notification_if_allowed(
                session,
                tenant_id=tenant_id,
                branch_id=invoice.branch_id,
                provider=NotificationProvider.WHATSAPP,
                event_type=NotificationEventType.PAYMENT_REMINDER,
                recipient=patient.mobile,
                subject="Payment pending",
                message=(
                    f"Payment pending for invoice {invoice.invoice_number}: "
                    f"Rs. {invoice.balance_amount}."
                ),
                resource_type="invoice",
                resource_id=invoice.id,
                queued_by_user_id=payload.collected_by_user_id,
            )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.collected_by_user_id,
        action="payment.recorded",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="payment_collection",
        changes=diff_changes(
            before, {key: getattr(invoice, key) for key in INVOICE_PAYMENT_FIELDS}
        ),
    )
    return read_invoice_detail(session, invoice)
