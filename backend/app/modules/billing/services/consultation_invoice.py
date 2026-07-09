from fastapi import HTTPException
from sqlmodel import Session

from app.modules.appointments.models import Appointment, AppointmentType
from app.modules.billing.models import Invoice, InvoiceItem, InvoiceStatus
from app.modules.billing.services.invoice_status import update_invoice_payment_status
from app.modules.billing.services.numbering import next_invoice_number
from app.modules.billing.services.rules import (
    calculate_fee_split,
    calculate_offer_discount,
    find_fee_rule,
    find_tax_rule,
)
from app.modules.patient_subscriptions.service import (
    active_patient_enrollment,
    benefit_preview,
    sync_free_item_usage_from_invoices,
)
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting


def create_consultation_invoice(
    session: Session,
    *,
    appointment: Appointment,
    consultation_id: str,
    discount_amount: int,
    created_by_user_id: str | None,
    discount_approval_id: str | None = None,
    discount_offer_id: str | None = None,
    tax_rule_id: str | None = None,
    treatment_type: str | None = None,
) -> tuple[Invoice, InvoiceItem]:
    """Builds and persists the invoice + line item for a signed consultation,
    composing the fee, tax, discount, and membership-benefit rules."""
    if appointment.is_billable:
        # Non-OP visits can carry a custom price set at booking. Use it as the
        # subtotal and still derive the doctor share from a matching fee rule's
        # share config when one exists; otherwise the clinic keeps the full fee.
        custom_amount = getattr(appointment, "custom_fee_amount", None)
        use_custom = (
            custom_amount is not None
            and appointment.appointment_type != AppointmentType.OP
        )
        if use_custom:
            try:
                fee_rule = find_fee_rule(session, appointment, treatment_type)
            except HTTPException:
                fee_rule = None
            subtotal = int(custom_amount)
            calculation = calculate_fee_split(fee_rule, subtotal) if fee_rule else None
            fee_rule_id = fee_rule.id if fee_rule else None
        else:
            calculation = calculate_fee_split(
                find_fee_rule(session, appointment, treatment_type)
            )
            subtotal = calculation.consultation_amount
            fee_rule_id = calculation.fee_rule.id
    else:
        calculation = None
        subtotal = 0
        fee_rule_id = None
    invoice_prefix, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=appointment.tenant_id,
        module="invoice",
        key=SettingKey.INVOICE_PREFIX,
        branch_id=appointment.branch_id,
    )
    membership_discount = 0
    membership_enrollment_id = None
    membership_plan_id = None
    membership = active_patient_enrollment(
        session,
        tenant_id=appointment.tenant_id,
        patient_id=appointment.patient_id,
    )
    if membership:
        enrollment, plan = membership
        sync_free_item_usage_from_invoices(session, enrollment, plan)
        preview = benefit_preview(
            plan=plan,
            enrollment=enrollment,
            service_type="consultation",
            item_ids=[],
            subtotal_amount=subtotal,
            department_id=appointment.department_id,
            session=session,
        )
        membership_discount = int(preview["discount_amount"] or 0)
        if membership_discount > 0:
            membership_enrollment_id = enrollment.id
            membership_plan_id = plan.id
            enrollment.used_consultations += 1
            session.add(enrollment)

    offer_discount, offer = calculate_offer_discount(
        session,
        tenant_id=appointment.tenant_id,
        branch_id=appointment.branch_id,
        service_scope="consultation",
        subtotal=subtotal,
        discount_offer_id=discount_offer_id,
    )
    discount = min(discount_amount + offer_discount + membership_discount, subtotal)
    taxable = subtotal - discount
    tax_rule = find_tax_rule(
        session,
        tenant_id=appointment.tenant_id,
        branch_id=appointment.branch_id,
        service_scope="consultation",
        tax_rule_id=tax_rule_id,
    )
    tax_amount = round(taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100)
    total = taxable + tax_amount
    if subtotal and calculation:
        share_basis = total if calculation.fee_rule.share_tax_with_doctor else taxable
        doctor_share = round(calculation.doctor_share_amount * share_basis / subtotal)
    else:
        doctor_share = 0
    clinic_share = total - doctor_share

    invoice = Invoice(
        tenant_id=appointment.tenant_id,
        branch_id=appointment.branch_id,
        patient_id=appointment.patient_id,
        appointment_id=appointment.id,
        consultation_id=consultation_id,
        invoice_number=next_invoice_number(
            session,
            appointment.tenant_id,
            str(invoice_prefix or "INV"),
            appointment.branch_id,
        ),
        subtotal_amount=subtotal,
        discount_amount=discount,
        membership_discount_amount=membership_discount,
        taxable_amount=taxable,
        tax_amount=tax_amount,
        tax_rule_id=tax_rule.id if tax_rule else None,
        total_amount=total,
        status=InvoiceStatus.PAID if total <= 0 else InvoiceStatus.ISSUED,
        balance_amount=total,
        doctor_share_amount=doctor_share,
        clinic_share_amount=clinic_share,
        fee_rule_id=fee_rule_id,
        discount_approval_id=discount_approval_id,
        discount_offer_id=offer.id if offer else None,
        patient_subscription_enrollment_id=membership_enrollment_id,
        patient_subscription_plan_id=membership_plan_id,
        created_by_user_id=created_by_user_id,
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    treatment_label = (
        treatment_type or appointment.visit_purpose or "consultation"
    ).replace("_", " ")
    billable_label = "" if appointment.is_billable else " Free"
    item = InvoiceItem(
        tenant_id=appointment.tenant_id,
        invoice_id=invoice.id,
        item_type="consultation",
        description=f"{appointment.appointment_type.value.replace('_', ' ').title()} {treatment_label}{billable_label}",
        quantity=1,
        unit_amount=subtotal,
        total_amount=subtotal,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    session.refresh(invoice)
    return invoice, item


def refresh_consultation_invoice(session: Session, invoice: Invoice) -> Invoice:
    return update_invoice_payment_status(session, invoice)
