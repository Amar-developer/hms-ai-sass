from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.appointments.models import Appointment, AppointmentType
from app.modules.billing.models import (
    DoctorFeeRule,
    DiscountOffer,
    DiscountType,
    FeeShareType,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    Payment,
    PaymentStatus,
    TaxRule,
)
from app.modules.settings.models import SettingKey
from app.modules.settings.numbering import next_document_number
from app.modules.settings.service import resolve_setting
from app.modules.patient_subscriptions.service import active_patient_enrollment, benefit_preview


@dataclass(frozen=True)
class FeeCalculation:
    fee_rule: DoctorFeeRule
    consultation_amount: int
    doctor_share_amount: int
    clinic_share_amount: int


def next_invoice_number(session: Session, tenant_id: str, prefix: str | None = None, branch_id: str | None = None) -> str:
    return next_document_number(session, tenant_id=tenant_id, branch_id=branch_id, entity="invoice", prefix_override=prefix)


def next_credit_note_number(session: Session, tenant_id: str) -> str:
    from app.modules.billing.models import CreditNote

    count = session.exec(select(func.count()).select_from(CreditNote).where(CreditNote.tenant_id == tenant_id)).one()
    return f"CN-{count + 1:06d}"


def find_fee_rule(session: Session, appointment: Appointment, treatment_type: str | None = None) -> DoctorFeeRule:
    def _rules_for(appointment_type: AppointmentType) -> list[DoctorFeeRule]:
        return list(
            session.exec(
                select(DoctorFeeRule).where(
                    DoctorFeeRule.tenant_id == appointment.tenant_id,
                    DoctorFeeRule.appointment_type == appointment_type,
                    DoctorFeeRule.is_active == True,  # noqa: E712
                )
            ).all()
        )

    rules = _rules_for(appointment.appointment_type)
    # Emergency visits are urgent OP consultations. When no emergency-specific
    # fee rule is configured, fall back to the standard OP fee so the visit can
    # still be invoiced instead of failing with "no fee rule".
    if not rules and appointment.appointment_type == AppointmentType.EMERGENCY:
        rules = _rules_for(AppointmentType.OP)
    if not rules:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active fee rule found for appointment type",
        )

    def score(rule: DoctorFeeRule) -> int:
        value = 0
        if rule.branch_id == appointment.branch_id:
            value += 4
        elif rule.branch_id is not None:
            value -= 100
        if rule.practitioner_id == appointment.practitioner_id:
            value += 8
        elif rule.practitioner_id is not None:
            value -= 100
        if rule.department_id == appointment.department_id:
            value += 6
        elif rule.department_id is not None:
            value -= 100
        if treatment_type and rule.treatment_type == treatment_type:
            value += 10
        elif rule.treatment_type is not None:
            value -= 100
        return value

    eligible = [rule for rule in rules if score(rule) >= 0]
    if not eligible:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No matching fee rule found for appointment context",
        )
    return sorted(eligible, key=score, reverse=True)[0]


def calculate_fee_split(fee_rule: DoctorFeeRule, amount: int | None = None) -> FeeCalculation:
    fee = fee_rule.fee_amount if amount is None else amount
    if fee_rule.share_type == FeeShareType.FIXED:
        doctor_share = min(fee_rule.doctor_fixed_amount or 0, fee)
    else:
        percentage = fee_rule.doctor_share_percentage if fee_rule.doctor_share_percentage is not None else 0
        doctor_share = round(fee * percentage / 100)
    clinic_share = fee - doctor_share
    return FeeCalculation(
        fee_rule=fee_rule,
        consultation_amount=fee,
        doctor_share_amount=doctor_share,
        clinic_share_amount=clinic_share,
    )


def _service_matches(rule_scope: str | None, service_scope: str) -> bool:
    return (rule_scope or "all") in {"all", service_scope}


def find_tax_rule(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    service_scope: str,
    tax_rule_id: str | None = None,
) -> TaxRule | None:
    if tax_rule_id:
        tax_rule = session.get(TaxRule, tax_rule_id)
        if (
            tax_rule
            and tax_rule.tenant_id == tenant_id
            and tax_rule.is_active
            and tax_rule.branch_id in {None, branch_id}
            and _service_matches(tax_rule.service_scope, service_scope)
        ):
            return tax_rule
        return None

    rules = session.exec(
        select(TaxRule).where(
            TaxRule.tenant_id == tenant_id,
            TaxRule.is_active == True,  # noqa: E712
        )
    ).all()
    matching_rules = [
        rule
        for rule in rules
        if rule.branch_id in {None, branch_id} and _service_matches(rule.service_scope, service_scope)
    ]
    if not matching_rules:
        return None
    matching_rules.sort(
        key=lambda rule: (
            rule.service_scope == service_scope,
            rule.branch_id == branch_id,
            rule.created_at,
        ),
        reverse=True,
    )
    return matching_rules[0]


def _offer_discount_value(offer: DiscountOffer, subtotal: int) -> int:
    """Discount this offer yields for the subtotal, or 0 if it is not eligible."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    valid_from = offer.valid_from.replace(tzinfo=timezone.utc) if offer.valid_from and offer.valid_from.tzinfo is None else offer.valid_from
    valid_until = offer.valid_until.replace(tzinfo=timezone.utc) if offer.valid_until and offer.valid_until.tzinfo is None else offer.valid_until
    if valid_from and valid_from > now:
        return 0
    if valid_until and valid_until < now:
        return 0
    if subtotal < offer.minimum_bill_amount:
        return 0
    if offer.discount_type == DiscountType.FIXED:
        discount = offer.value
    else:
        discount = round(subtotal * offer.value / 100)
    if offer.max_discount_amount is not None:
        discount = min(discount, offer.max_discount_amount)
    return max(min(discount, subtotal), 0)


def calculate_offer_discount(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    service_scope: str,
    subtotal: int,
    discount_offer_id: str | None,
) -> tuple[int, DiscountOffer | None]:
    if subtotal <= 0:
        return 0, None
    # An explicitly chosen offer is used as-is. Otherwise auto-apply the best
    # eligible active offer (mirrors tax-rule auto-selection), so configured
    # offers actually reach the bill instead of showing "Offer not applied".
    if discount_offer_id:
        offer = session.get(DiscountOffer, discount_offer_id)
        if (
            not offer
            or offer.tenant_id != tenant_id
            or not offer.is_active
            or not _service_matches(offer.service_scope, service_scope)
            or (offer.branch_id and offer.branch_id != branch_id)
        ):
            return 0, None
        discount = _offer_discount_value(offer, subtotal)
        return (discount, offer) if discount > 0 else (0, None)

    offers = session.exec(
        select(DiscountOffer).where(
            DiscountOffer.tenant_id == tenant_id,
            DiscountOffer.is_active == True,  # noqa: E712
        )
    ).all()
    best_offer: DiscountOffer | None = None
    best_discount = 0
    for offer in offers:
        if not _service_matches(offer.service_scope, service_scope):
            continue
        if offer.branch_id and offer.branch_id != branch_id:
            continue
        discount = _offer_discount_value(offer, subtotal)
        if discount > best_discount:
            best_discount = discount
            best_offer = offer
    return (best_discount, best_offer) if best_offer else (0, None)


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
    if appointment.is_billable:
        # Non-OP visits can carry a custom price set at booking. Use it as the
        # subtotal and still derive the doctor share from a matching fee rule's
        # share config when one exists; otherwise the clinic keeps the full fee.
        custom_amount = getattr(appointment, "custom_fee_amount", None)
        use_custom = custom_amount is not None and appointment.appointment_type != AppointmentType.OP
        if use_custom:
            try:
                fee_rule = find_fee_rule(session, appointment, treatment_type)
            except HTTPException:
                fee_rule = None
            subtotal = int(custom_amount)
            calculation = calculate_fee_split(fee_rule, subtotal) if fee_rule else None
            fee_rule_id = fee_rule.id if fee_rule else None
        else:
            calculation = calculate_fee_split(find_fee_rule(session, appointment, treatment_type))
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
        branch_id=appointment.branch_id,
        patient_id=appointment.patient_id,
    )
    if membership:
        enrollment, plan = membership
        preview = benefit_preview(
            plan=plan,
            enrollment=enrollment,
            service_type="consultation",
            item_ids=[],
            subtotal_amount=subtotal,
            department_id=appointment.department_id,
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
        invoice_number=next_invoice_number(session, appointment.tenant_id, str(invoice_prefix or "INV"), appointment.branch_id),
        subtotal_amount=subtotal,
        discount_amount=discount,
        membership_discount_amount=membership_discount,
        taxable_amount=taxable,
        tax_amount=tax_amount,
        tax_rule_id=tax_rule.id if tax_rule else None,
        total_amount=total,
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

    treatment_label = (treatment_type or appointment.visit_purpose or "consultation").replace("_", " ")
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


def update_invoice_payment_status(session: Session, invoice: Invoice) -> Invoice:
    paid_amount = session.exec(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.tenant_id == invoice.tenant_id,
            Payment.invoice_id == invoice.id,
            Payment.status == PaymentStatus.RECORDED,
        )
    ).one()
    invoice.paid_amount = int(paid_amount or 0)
    invoice.balance_amount = max(invoice.total_amount - invoice.paid_amount, 0)
    if invoice.total_amount <= 0 or invoice.balance_amount <= 0:
        invoice.status = InvoiceStatus.PAID
    elif invoice.paid_amount <= 0:
        invoice.status = InvoiceStatus.ISSUED
    elif invoice.paid_amount < invoice.total_amount:
        invoice.status = InvoiceStatus.PARTIALLY_PAID
    else:
        invoice.status = InvoiceStatus.PAID
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return invoice


def refundable_paid_total(session: Session, invoice: Invoice) -> int:
    paid_amount = session.exec(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.tenant_id == invoice.tenant_id,
            Payment.invoice_id == invoice.id,
            Payment.status == PaymentStatus.RECORDED,
        )
    ).one()
    return int(paid_amount or 0)
