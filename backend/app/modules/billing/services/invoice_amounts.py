from collections.abc import Callable
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import enforce_entitlement, require_user_branch_access
from app.modules.appointments.models import AppointmentType
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.billing.repositories import BillingAdjustmentRepository
from app.modules.billing.schemas import InvoiceAmountUpdate, InvoiceDetailRead
from app.modules.billing.service import (
    calculate_fee_split,
    calculate_offer_discount,
    find_tax_rule,
    update_invoice_payment_status,
)
from app.modules.identity.models import User

InvoiceDetailReader = Callable[[Session, Invoice], InvoiceDetailRead]

INVOICE_AMOUNT_FIELDS = (
    "subtotal_amount",
    "discount_amount",
    "membership_discount_amount",
    "taxable_amount",
    "tax_amount",
    "total_amount",
    "balance_amount",
    "doctor_share_amount",
    "clinic_share_amount",
)


def update_consultation_invoice_amount(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    payload: InvoiceAmountUpdate,
    current_user: User,
    read_invoice_detail: InvoiceDetailReader,
) -> InvoiceDetailRead:
    """Edit a non-OP consultation invoice before payment is recorded."""
    enforce_entitlement(session, tenant_id, "billing_basic")
    adjustment_repo = BillingAdjustmentRepository(session)
    invoice = adjustment_repo.get_invoice_for_tenant(
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
            detail=f"Cannot edit {invoice.status.value} invoice",
        )
    if int(invoice.paid_amount or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot edit amount after a payment is recorded",
        )
    if (
        not invoice.consultation_id
        or invoice.lab_order_id
        or invoice.pharmacy_issue_id
        or invoice.ip_admission_id
        or invoice.physiotherapy_case_id
        or invoice.home_care_booking_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount can be edited only for consultation invoices",
        )
    appointment = (
        adjustment_repo.get_appointment(invoice.appointment_id)
        if invoice.appointment_id
        else None
    )
    if (
        not appointment
        or appointment.tenant_id != tenant_id
        or appointment.appointment_type == AppointmentType.OP
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount can be edited only for non-OP consultation visits",
        )

    new_subtotal = int(payload.amount)
    membership_discount = min(
        int(invoice.membership_discount_amount or 0), new_subtotal
    )
    offer_discount, offer = calculate_offer_discount(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        service_scope="consultation",
        subtotal=new_subtotal,
        discount_offer_id=invoice.discount_offer_id,
    )
    discount = min(membership_discount + offer_discount, new_subtotal)
    taxable = new_subtotal - discount
    tax_rule = find_tax_rule(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        service_scope="consultation",
        tax_rule_id=invoice.tax_rule_id,
    )
    tax_amount = round(taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100)
    total = taxable + tax_amount
    doctor_share = 0
    fee_rule = (
        adjustment_repo.get_fee_rule(invoice.fee_rule_id)
        if invoice.fee_rule_id
        else None
    )
    if fee_rule and new_subtotal > 0:
        split = calculate_fee_split(fee_rule, new_subtotal)
        share_basis = total if fee_rule.share_tax_with_doctor else taxable
        doctor_share = round(split.doctor_share_amount * share_basis / new_subtotal)

    before = {key: getattr(invoice, key) for key in INVOICE_AMOUNT_FIELDS}
    invoice.subtotal_amount = new_subtotal
    invoice.discount_amount = discount
    invoice.membership_discount_amount = membership_discount
    invoice.taxable_amount = taxable
    invoice.tax_amount = tax_amount
    invoice.tax_rule_id = tax_rule.id if tax_rule else invoice.tax_rule_id
    invoice.total_amount = total
    invoice.balance_amount = total
    invoice.doctor_share_amount = doctor_share
    invoice.clinic_share_amount = total - doctor_share
    invoice.discount_offer_id = offer.id if offer else invoice.discount_offer_id
    session.add(invoice)
    item = adjustment_repo.get_first_invoice_item(
        tenant_id=tenant_id,
        invoice_id=invoice.id,
    )
    if item:
        item.unit_amount = new_subtotal
        item.total_amount = new_subtotal
        session.add(item)
    appointment.custom_fee_amount = new_subtotal
    appointment.updated_at = datetime.now(timezone.utc)
    session.add(appointment)
    session.commit()
    session.refresh(invoice)
    invoice = update_invoice_payment_status(session, invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.updated_by_user_id or current_user.id,
        action="invoice.amount_updated",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing",
        changes=diff_changes(
            before, {key: getattr(invoice, key) for key in INVOICE_AMOUNT_FIELDS}
        ),
    )
    return read_invoice_detail(session, invoice)
