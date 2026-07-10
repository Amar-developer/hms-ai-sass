from collections.abc import Callable

from fastapi import HTTPException
from sqlmodel import Session

from app.modules.billing.models import Invoice, InvoiceItem, InvoiceStatus
from app.modules.billing.services.numbering import next_invoice_number
from app.modules.billing.services.rules import (
    calculate_offer_discount,
    find_tax_rule,
)

LedgerRecorder = Callable[..., object]
MembershipLedgerEnsurer = Callable[..., None]


def create_service_invoice(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    patient_id: str,
    appointment_id: str | None,
    consultation_id: str | None,
    item_type: str,
    description: str,
    amount: int,
    created_by_user_id: str | None,
    service_scope: str,
    record_billing_ledger: LedgerRecorder,
    ensure_invoice_membership_benefit_ledger: MembershipLedgerEnsurer,
    lab_order_id: str | None = None,
    pharmacy_issue_id: str | None = None,
    line_items: list[dict[str, int | str | None]] | None = None,
    tax_rule_id: str | None = None,
    discount_offer_id: str | None = None,
    benefit_item_ids: list[str] | None = None,
    benefit_item_amounts: dict[str, int] | None = None,
) -> Invoice:
    discount_amount, offer = calculate_offer_discount(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        service_scope=service_scope,
        subtotal=amount,
        discount_offer_id=discount_offer_id,
    )
    taxable_amount = amount - discount_amount
    tax_rule = find_tax_rule(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        service_scope=service_scope,
        tax_rule_id=tax_rule_id,
    )
    membership_discount = 0
    membership_enrollment_id = None
    membership_plan_id = None
    try:
        from app.modules.patient_subscriptions.service import (
            active_patient_enrollment,
            benefit_preview,
            consultation_department_id,
            consume_free_items,
            sync_free_item_usage_from_invoices,
        )

        membership = active_patient_enrollment(
            session,
            tenant_id=tenant_id,
            patient_id=patient_id,
        )
        if membership:
            enrollment, plan = membership
            sync_free_item_usage_from_invoices(session, enrollment, plan)
            preview = benefit_preview(
                plan=plan,
                enrollment=enrollment,
                service_type=service_scope,
                item_ids=benefit_item_ids or [],
                item_amounts=benefit_item_amounts or {},
                subtotal_amount=amount,
                department_id=consultation_department_id(
                    session,
                    appointment_id=appointment_id,
                    consultation_id=consultation_id,
                )
                if service_scope == "consultation"
                else None,
                session=session,
            )
            membership_discount = int(preview["discount_amount"] or 0)
            if membership_discount > 0:
                membership_enrollment_id = enrollment.id
                membership_plan_id = plan.id
                if service_scope == "consultation":
                    enrollment.used_consultations += 1
                    session.add(enrollment)
                elif service_scope in ("lab", "pharmacy") and preview.get(
                    "free_item_ids"
                ):
                    consume_free_items(
                        enrollment,
                        service_type=service_scope,
                        free_item_ids=preview["free_item_ids"],
                    )
                    session.add(enrollment)
            discount_amount = min(discount_amount + membership_discount, amount)
            taxable_amount = amount - discount_amount
            tax_amount = round(
                taxable_amount * (tax_rule.tax_percentage if tax_rule else 0) / 100
            )
            total_amount = taxable_amount + tax_amount
    except HTTPException:
        # Subscription entitlement failures may legitimately mean that this
        # invoice has no membership benefit. Programming/data errors must not
        # be swallowed, otherwise a free consultation becomes a paid invoice
        # without updating usage.
        pass
    tax_amount = round(
        taxable_amount * (tax_rule.tax_percentage if tax_rule else 0) / 100
    )
    total_amount = taxable_amount + tax_amount
    invoice = Invoice(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        appointment_id=appointment_id,
        consultation_id=consultation_id,
        lab_order_id=lab_order_id,
        pharmacy_issue_id=pharmacy_issue_id,
        invoice_number=next_invoice_number(session, tenant_id, branch_id=branch_id),
        subtotal_amount=amount,
        discount_amount=discount_amount,
        membership_discount_amount=membership_discount,
        taxable_amount=taxable_amount,
        tax_amount=tax_amount,
        tax_rule_id=tax_rule.id if tax_rule else None,
        total_amount=total_amount,
        status=InvoiceStatus.PAID if total_amount <= 0 else InvoiceStatus.ISSUED,
        balance_amount=total_amount,
        doctor_share_amount=0,
        clinic_share_amount=total_amount,
        discount_offer_id=offer.id if offer else None,
        patient_subscription_enrollment_id=membership_enrollment_id,
        patient_subscription_plan_id=membership_plan_id,
        created_by_user_id=created_by_user_id,
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    rows = line_items or [
        {
            "item_type": item_type,
            "description": description,
            "quantity": 1,
            "unit_amount": amount,
            "total_amount": amount,
        }
    ]
    for row in rows:
        session.add(
            InvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                item_type=str(row.get("item_type") or item_type),
                description=str(row.get("description") or description),
                quantity=int(row.get("quantity") or 1),
                unit_amount=int(row.get("unit_amount") or 0),
                total_amount=int(row.get("total_amount") or 0),
                mrp_amount=int(row.get("mrp_amount") or 0),
                selling_amount=int(
                    row.get("selling_amount") or row.get("unit_amount") or 0
                ),
                buying_amount=int(row.get("buying_amount") or 0),
                supplier_id=str(row.get("supplier_id") or "") or None,
                external_source=str(row.get("external_source") or "") or None,
                external_slug=str(row.get("external_slug") or "") or None,
                external_item_code=str(row.get("external_item_code") or "") or None,
            )
        )
    session.commit()
    session.refresh(invoice)
    record_billing_ledger(
        session,
        invoice,
        entry_type="invoice_submitted",
        description="Invoice submitted",
        debit_amount=total_amount,
        invoice_total_delta=total_amount,
        balance_amount_delta=total_amount,
        actor_user_id=created_by_user_id,
    )
    ensure_invoice_membership_benefit_ledger(
        session,
        invoice,
        actor_user_id=created_by_user_id,
    )
    return invoice
