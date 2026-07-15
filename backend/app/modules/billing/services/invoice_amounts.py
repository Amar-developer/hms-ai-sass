from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.billing.repositories.adjustment_repository import (
    BillingAdjustmentRepository,
)
from app.modules.billing.services.invoice_status import update_invoice_payment_status
from app.modules.billing.services.rules import (
    calculate_offer_discount,
    calculate_fee_split,
    find_tax_rule,
)

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


def ensure_invoice_eligible_for_discount_request(
    *, tenant_id: str, invoice: Invoice
) -> None:
    """Any invoice type can carry a discount request, as long as it's before
    payment — a discount reduces what's owed; once anything is paid, a
    refund is the correct action instead.
    """
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot discount a {invoice.status.value} invoice",
        )
    if int(invoice.paid_amount or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot request a discount after a payment is recorded — "
            "request a refund instead",
        )


def is_consultation_invoice(invoice: Invoice) -> bool:
    """A "pure" consultation invoice — the only shape that carries a
    fee-rule/tax-recompute structure discount execution can recalculate.
    """
    return bool(
        invoice.consultation_id
        and not invoice.lab_order_id
        and not invoice.pharmacy_issue_id
        and not invoice.ip_admission_id
        and not invoice.physiotherapy_case_id
        and not invoice.home_care_booking_id
    )


def apply_consultation_invoice_discount(
    session: Session,
    *,
    tenant_id: str,
    invoice: Invoice,
    discount_amount: int,
    actor_user_id: str | None,
) -> Invoice:
    """Apply an approved discount without hiding the original consultation fee.

    The invoice item and subtotal remain the gross charge (for example, ₹1,000)
    while ``discount_amount`` records the approved deduction (for example,
    ₹100).  This lets invoice screens and receipts show the complete
    gross -> discount -> payable calculation instead of rewriting the service
    itself to ₹900.
    """
    ensure_invoice_eligible_for_discount_request(tenant_id=tenant_id, invoice=invoice)
    adjustment_repo = BillingAdjustmentRepository(session)
    appointment = (
        adjustment_repo.get_appointment(invoice.appointment_id)
        if invoice.appointment_id
        else None
    )
    if not appointment or appointment.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Discounts can be requested only for consultation visits",
        )
    subtotal = int(invoice.subtotal_amount or 0)
    if int(discount_amount or 0) > max(subtotal - int(invoice.discount_amount or 0), 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Discount amount cannot exceed the invoice subtotal",
        )
    membership_discount = min(int(invoice.membership_discount_amount or 0), subtotal)
    offer_discount, offer = calculate_offer_discount(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        service_scope="consultation",
        subtotal=subtotal,
        discount_offer_id=invoice.discount_offer_id,
    )
    existing_non_membership_discount = max(
        int(invoice.discount_amount or 0) - membership_discount, 0
    )
    existing_approved_discount = max(
        existing_non_membership_discount - offer_discount, 0
    )
    approved_discount = existing_approved_discount + int(discount_amount or 0)
    discount = min(membership_discount + offer_discount + approved_discount, subtotal)
    taxable = subtotal - discount
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
    if fee_rule and subtotal > 0:
        split = calculate_fee_split(fee_rule, subtotal)
        share_basis = total if fee_rule.share_tax_with_doctor else taxable
        doctor_share = round(split.doctor_share_amount * share_basis / subtotal)

    before = {key: getattr(invoice, key) for key in INVOICE_AMOUNT_FIELDS}
    invoice.subtotal_amount = subtotal
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
    # Keep the original invoice item and appointment fee intact. The approved
    # reduction belongs in invoice.discount_amount, not in the service rate.
    session.commit()
    session.refresh(invoice)
    invoice = update_invoice_payment_status(session, invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=actor_user_id,
        action="invoice.discount_applied",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing",
        changes=diff_changes(
            before, {key: getattr(invoice, key) for key in INVOICE_AMOUNT_FIELDS}
        ),
    )
    return invoice


def apply_generic_invoice_discount(
    session: Session,
    *,
    invoice: Invoice,
    discount_amount: int,
    actor_user_id: str | None,
) -> Invoice:
    """Apply an approved discount to any non-consultation invoice — lab,
    pharmacy, physiotherapy, home care, IP, or a direct invoice. These types
    don't share the consultation fee-rule structure. Their common invoice
    totals are still recomputed in gross -> discount -> taxable -> tax order
    so the configured percentage remains accurate after approval.
    """
    ensure_invoice_eligible_for_discount_request(
        tenant_id=invoice.tenant_id, invoice=invoice
    )
    subtotal = int(invoice.subtotal_amount or 0)
    existing_discount = min(int(invoice.discount_amount or 0), subtotal)
    if int(discount_amount or 0) > max(subtotal - existing_discount, 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Discount amount cannot exceed the remaining invoice subtotal",
        )
    before = {key: getattr(invoice, key) for key in INVOICE_AMOUNT_FIELDS}
    total_discount = min(existing_discount + int(discount_amount or 0), subtotal)
    taxable = max(subtotal - total_discount, 0)
    service_scope = (
        "lab"
        if invoice.lab_order_id
        else "pharmacy"
        if invoice.pharmacy_issue_id
        else "physiotherapy"
        if invoice.physiotherapy_case_id
        else "home_care"
        if invoice.home_care_booking_id
        else "ip"
        if invoice.ip_admission_id
        else "service"
    )
    tax_rule = find_tax_rule(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        service_scope=service_scope,
        tax_rule_id=invoice.tax_rule_id,
    )
    tax_amount = round(taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100)
    total = taxable + tax_amount
    old_total = int(invoice.total_amount or 0)
    old_doctor_share = int(invoice.doctor_share_amount or 0)
    doctor_share = round(old_doctor_share * total / old_total) if old_total > 0 else 0
    invoice.discount_amount = total_discount
    invoice.taxable_amount = taxable
    invoice.tax_amount = tax_amount
    invoice.tax_rule_id = tax_rule.id if tax_rule else invoice.tax_rule_id
    invoice.total_amount = total
    invoice.balance_amount = max(total - int(invoice.paid_amount or 0), 0)
    invoice.doctor_share_amount = min(doctor_share, total)
    invoice.clinic_share_amount = max(total - invoice.doctor_share_amount, 0)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    invoice = update_invoice_payment_status(session, invoice)
    record_audit_event(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=actor_user_id,
        action="invoice.discount_applied",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing",
        changes=diff_changes(
            before, {key: getattr(invoice, key) for key in INVOICE_AMOUNT_FIELDS}
        ),
    )
    return invoice
