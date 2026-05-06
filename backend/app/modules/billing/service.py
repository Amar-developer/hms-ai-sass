from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.billing.models import (
    DoctorFeeRule,
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


def create_consultation_invoice(
    session: Session,
    *,
    appointment: Appointment,
    consultation_id: str,
    discount_amount: int,
    created_by_user_id: str | None,
    discount_approval_id: str | None = None,
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
    discount = min(discount_amount, subtotal)
    taxable = subtotal - discount
    tax_rule = session.get(TaxRule, tax_rule_id) if tax_rule_id else None
    if tax_rule and tax_rule.tenant_id != appointment.tenant_id:
        tax_rule = None
    if not tax_rule:
        tax_rule = session.exec(
            select(TaxRule).where(
                TaxRule.tenant_id == appointment.tenant_id,
                TaxRule.is_active == True,  # noqa: E712
                (TaxRule.branch_id == appointment.branch_id) | (TaxRule.branch_id.is_(None)),
            )
        ).first()
    tax_amount = round(taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100)
    total = taxable + tax_amount
    if subtotal and calculation:
        doctor_share = round(calculation.doctor_share_amount * total / subtotal)
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
        taxable_amount=taxable,
        tax_amount=tax_amount,
        tax_rule_id=tax_rule.id if tax_rule else None,
        total_amount=total,
        balance_amount=total,
        doctor_share_amount=doctor_share,
        clinic_share_amount=clinic_share,
        fee_rule_id=fee_rule_id,
        discount_approval_id=discount_approval_id,
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
