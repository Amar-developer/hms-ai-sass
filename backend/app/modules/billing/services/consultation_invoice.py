from fastapi import HTTPException
from decimal import Decimal
from sqlmodel import Session

from app.modules.appointments.models import Appointment, AppointmentType
from app.modules.billing.models import Invoice, InvoiceItem, InvoiceStatus
from app.modules.billing.services.discount_policy import compose_invoice_discounts
from app.modules.billing.services.invoice_status import update_invoice_payment_status
from app.modules.billing.services.numbering import next_invoice_number
from app.modules.billing.services.money import money_value, percentage_amount
from app.modules.billing.services.line_discounts import sync_invoice_item_discounts
from app.modules.billing.services.rules import (
    FeeCalculation,
    calculate_offer_discount,
    calculate_fee_split,
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
from app.modules.tenants.repositories import DepartmentRepository


def doctor_share_after_patient_benefits(
    calculation: FeeCalculation | None,
    *,
    subtotal: Decimal,
    taxable: Decimal,
    total: Decimal,
    membership_discount: Decimal,
) -> Decimal:
    if not subtotal or not calculation:
        return Decimal("0")
    if total <= 0 and membership_discount >= subtotal:
        # A membership benefit changes what the patient owes, not what the
        # clinic owes the doctor for delivering the consultation.
        return money_value(calculation.doctor_share_amount)
    share_basis = total if calculation.fee_rule.share_tax_with_doctor else taxable
    return money_value(calculation.doctor_share_amount * share_basis / subtotal)


def consultation_item_description(
    session: Session,
    *,
    appointment: Appointment,
    treatment_type: str | None = None,
) -> str:
    """Return a patient-facing consultation line name from the booked department."""
    department = None
    if appointment.department_id:
        department = DepartmentRepository(session).get_for_tenant(
            appointment.tenant_id,
            appointment.department_id,
        )

    if department and department.name.strip():
        label = department.name.strip()
    else:
        # Historical/imported appointments may not have a valid department.
        # Keep those invoices meaningful without reverting every OP visit to
        # the same generic label.
        raw_label = (
            treatment_type
            or appointment.visit_purpose
            or appointment.appointment_type.value
            or "consultation"
        )
        label = str(raw_label).replace("_", " ").strip().title()

    if not label.lower().endswith("consultation"):
        label = f"{label} Consultation"
    if not appointment.is_billable:
        label = f"{label} Free"
    return label


def create_consultation_invoice(
    session: Session,
    *,
    appointment: Appointment,
    consultation_id: str,
    discount_amount: Decimal | int = 0,
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
            subtotal = money_value(custom_amount)
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
        membership_discount = money_value(preview["discount_amount"])
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
    discount_composition = compose_invoice_discounts(
        subtotal=subtotal,
        membership_discount=membership_discount,
        approved_discount=discount_amount,
        offer_discount=offer_discount,
    )
    discount = discount_composition.total
    if membership_discount > 0:
        # Membership takes precedence over request-based and promotional
        # discounts. Do not retain references that imply those were applied.
        offer = None
        discount_approval_id = None
    taxable = subtotal - discount
    tax_rule = find_tax_rule(
        session,
        tenant_id=appointment.tenant_id,
        branch_id=appointment.branch_id,
        service_scope="consultation",
        tax_rule_id=tax_rule_id,
    )
    tax_amount = percentage_amount(taxable, tax_rule.tax_percentage if tax_rule else 0)
    total = taxable + tax_amount
    doctor_share = doctor_share_after_patient_benefits(
        calculation,
        subtotal=subtotal,
        taxable=taxable,
        total=total,
        membership_discount=membership_discount,
    )
    clinic_share = max(total - doctor_share, 0)

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
        discount_offer_id=offer.id
        if offer and discount_composition.offer > 0
        else None,
        patient_subscription_enrollment_id=membership_enrollment_id,
        patient_subscription_plan_id=membership_plan_id,
        created_by_user_id=created_by_user_id,
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    item = InvoiceItem(
        tenant_id=appointment.tenant_id,
        invoice_id=invoice.id,
        item_type="consultation",
        description=consultation_item_description(
            session,
            appointment=appointment,
            treatment_type=treatment_type,
        ),
        quantity=1,
        unit_amount=subtotal,
        total_amount=subtotal,
    )
    session.add(item)
    session.flush()
    sync_invoice_item_discounts(session, invoice)
    session.commit()
    session.refresh(item)
    session.refresh(invoice)
    return invoice, item


def refresh_consultation_invoice(session: Session, invoice: Invoice) -> Invoice:
    return update_invoice_payment_status(session, invoice)
