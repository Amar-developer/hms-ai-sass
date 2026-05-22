from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
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
from app.modules.settings.service import resolve_setting
from app.modules.patient_subscriptions.service import active_patient_enrollment, benefit_preview


@dataclass(frozen=True)
class FeeCalculation:
    fee_rule: DoctorFeeRule
    consultation_amount: int
    doctor_share_amount: int
    clinic_share_amount: int


def next_invoice_number(session: Session, tenant_id: str, prefix: str | None = None) -> str:
    count = session.exec(select(func.count()).select_from(Invoice).where(Invoice.tenant_id == tenant_id)).one()
    invoice_prefix = prefix or "INV"
    return f"{invoice_prefix}-{count + 1:06d}"


def next_credit_note_number(session: Session, tenant_id: str) -> str:
    from app.modules.billing.models import CreditNote

    count = session.exec(select(func.count()).select_from(CreditNote).where(CreditNote.tenant_id == tenant_id)).one()
    return f"CN-{count + 1:06d}"


def find_fee_rule(session: Session, appointment: Appointment, treatment_type: str | None = None) -> DoctorFeeRule:
    rules = list(
        session.exec(
            select(DoctorFeeRule).where(
                DoctorFeeRule.tenant_id == appointment.tenant_id,
                DoctorFeeRule.appointment_type == appointment.appointment_type,
                DoctorFeeRule.is_active == True,  # noqa: E712
            )
        ).all()
    )
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


def calculate_fee_split(fee_rule: DoctorFeeRule) -> FeeCalculation:
    fee = fee_rule.fee_amount
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


def calculate_offer_discount(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    service_scope: str,
    subtotal: int,
    discount_offer_id: str | None,
) -> tuple[int, DiscountOffer | None]:
    if not discount_offer_id or subtotal <= 0:
        return 0, None
    offer = session.get(DiscountOffer, discount_offer_id)
    if (
        not offer
        or offer.tenant_id != tenant_id
        or not offer.is_active
        or not _service_matches(offer.service_scope, service_scope)
        or (offer.branch_id and offer.branch_id != branch_id)
    ):
        return 0, None
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    valid_from = offer.valid_from.replace(tzinfo=timezone.utc) if offer.valid_from and offer.valid_from.tzinfo is None else offer.valid_from
    valid_until = offer.valid_until.replace(tzinfo=timezone.utc) if offer.valid_until and offer.valid_until.tzinfo is None else offer.valid_until
    if valid_from and valid_from > now:
        return 0, None
    if valid_until and valid_until < now:
        return 0, None
    if offer.discount_type == DiscountType.FIXED:
        discount = offer.value
    else:
        discount = round(subtotal * offer.value / 100)
    if offer.max_discount_amount is not None:
        discount = min(discount, offer.max_discount_amount)
    return min(discount, subtotal), offer


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
        invoice_number=next_invoice_number(session, appointment.tenant_id, str(invoice_prefix or "INV")),
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


def _consultation_invoice_extra_items(session: Session, invoice: Invoice) -> list[InvoiceItem]:
    if not invoice.consultation_id:
        return []
    from app.modules.lab.models import LabOrder, LabOrderStatus
    from app.modules.pharmacy.models import PharmacyIssue, PharmacyIssueItem, PharmacyIssueStatus

    items: list[InvoiceItem] = []
    lab_orders = session.exec(
        select(LabOrder).where(
            LabOrder.tenant_id == invoice.tenant_id,
            LabOrder.consultation_id == invoice.consultation_id,
            LabOrder.status != LabOrderStatus.CANCELLED,
        )
    ).all()
    for order in lab_orders:
        amount = int(order.amount or 0)
        if amount <= 0:
            continue
        items.append(
            InvoiceItem(
                tenant_id=invoice.tenant_id,
                invoice_id=invoice.id,
                item_type="lab",
                description=f"Lab order {order.id}: {order.tests}",
                quantity=1,
                unit_amount=amount,
                total_amount=amount,
            )
        )

    pharmacy_issues = session.exec(
        select(PharmacyIssue).where(
            PharmacyIssue.tenant_id == invoice.tenant_id,
            PharmacyIssue.consultation_id == invoice.consultation_id,
            PharmacyIssue.status != PharmacyIssueStatus.CANCELLED,
        )
    ).all()
    for issue in pharmacy_issues:
        issue_items = session.exec(
            select(PharmacyIssueItem).where(
                PharmacyIssueItem.tenant_id == invoice.tenant_id,
                PharmacyIssueItem.pharmacy_issue_id == issue.id,
            )
        ).all()
        if issue_items:
            for row in issue_items:
                amount = int(row.quantity or 0) * int(row.unit_price or 0)
                if amount <= 0:
                    continue
                items.append(
                    InvoiceItem(
                        tenant_id=invoice.tenant_id,
                        invoice_id=invoice.id,
                        item_type="pharmacy",
                        description=f"Medicine {row.medicine_name}",
                        quantity=row.quantity,
                        unit_amount=row.unit_price,
                        total_amount=amount,
                    )
                )
        elif issue.amount > 0:
            items.append(
                InvoiceItem(
                    tenant_id=invoice.tenant_id,
                    invoice_id=invoice.id,
                    item_type="pharmacy",
                    description=f"Pharmacy issue {issue.id}: {issue.medicine_text}",
                    quantity=1,
                    unit_amount=issue.amount,
                    total_amount=issue.amount,
                )
            )
        if issue.billing_invoice_id != invoice.id:
            issue.billing_invoice_id = invoice.id
            session.add(issue)
    return items


def refresh_consultation_invoice(session: Session, invoice: Invoice) -> Invoice:
    existing_extra_items = session.exec(
        select(InvoiceItem).where(
            InvoiceItem.tenant_id == invoice.tenant_id,
            InvoiceItem.invoice_id == invoice.id,
            InvoiceItem.item_type.in_(("lab", "pharmacy")),
        )
    ).all()
    for item in existing_extra_items:
        session.delete(item)

    extra_items = _consultation_invoice_extra_items(session, invoice)
    for item in extra_items:
        session.add(item)
    session.commit()

    items = session.exec(
        select(InvoiceItem).where(
            InvoiceItem.tenant_id == invoice.tenant_id,
            InvoiceItem.invoice_id == invoice.id,
        )
    ).all()
    subtotal = sum(item.total_amount for item in items)
    discount = min(invoice.discount_amount, subtotal)
    taxable = subtotal - discount
    service_scope = "consultation"
    tax_rule = find_tax_rule(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        service_scope=service_scope,
        tax_rule_id=invoice.tax_rule_id,
    )
    tax_amount = round(taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100)
    total = taxable + tax_amount

    invoice.subtotal_amount = subtotal
    invoice.discount_amount = discount
    invoice.taxable_amount = taxable
    invoice.tax_amount = tax_amount
    invoice.total_amount = total
    invoice.clinic_share_amount = max(total - invoice.doctor_share_amount, 0)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
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
    if invoice.paid_amount <= 0:
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
