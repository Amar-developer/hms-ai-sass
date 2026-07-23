from collections.abc import Callable
from decimal import Decimal

from fastapi import HTTPException
from sqlmodel import Session

from app.modules.billing.models import Invoice, InvoiceItem, InvoiceStatus
from app.modules.billing.services.discount_policy import compose_invoice_discounts
from app.modules.billing.services.line_discounts import sync_invoice_item_discounts
from app.modules.billing.services.numbering import next_invoice_number
from app.modules.billing.services.rules import calculate_offer_discount, find_tax_rule
from app.modules.billing.services.money import money_value, percentage_amount

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
    amount: Decimal | int,
    created_by_user_id: str | None,
    service_scope: str,
    record_billing_ledger: LedgerRecorder,
    ensure_invoice_membership_benefit_ledger: MembershipLedgerEnsurer,
    lab_order_id: str | None = None,
    pharmacy_issue_id: str | None = None,
    line_items: list[dict[str, Decimal | int | str | None]] | None = None,
    tax_rule_id: str | None = None,
    discount_offer_id: str | None = None,
    benefit_item_ids: list[str] | None = None,
    benefit_item_amounts: dict[str, Decimal | int] | None = None,
) -> Invoice:
    amount = money_value(amount)
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
    membership_free_items_amount = 0
    membership_item_discount_amount = 0
    membership_regular_items_amount = 0
    membership_preview: dict | None = None
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
            membership_preview = preview
            membership_discount = money_value(preview["discount_amount"])
            membership_free_items_amount = money_value(preview["free_items_amount"])
            membership_item_discount_amount = money_value(
                preview["item_discount_amount"]
            )
            membership_regular_items_amount = money_value(
                preview["regular_items_amount"]
            )
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
            discount_composition = compose_invoice_discounts(
                subtotal=amount,
                membership_discount=membership_discount,
                offer_discount=discount_amount,
            )
            discount_amount = discount_composition.total
            if membership_discount > 0:
                offer = None
            taxable_amount = amount - discount_amount
            tax_amount = percentage_amount(
                taxable_amount, tax_rule.tax_percentage if tax_rule else 0
            )
            total_amount = taxable_amount + tax_amount
    except HTTPException:
        # Subscription entitlement failures may legitimately mean that this
        # invoice has no membership benefit. Programming/data errors must not
        # be swallowed, otherwise a free consultation becomes a paid invoice
        # without updating usage.
        pass
    # The membership lookup can legitimately return no benefit. Compose once
    # more outside the lookup block so both membership and non-membership paths
    # use the same exclusive-discount policy.
    discount_composition = compose_invoice_discounts(
        subtotal=amount,
        membership_discount=membership_discount,
        offer_discount=discount_amount if membership_discount <= 0 else 0,
    )
    discount_amount = discount_composition.total
    if membership_discount > 0:
        offer = None
    taxable_amount = amount - discount_amount
    tax_amount = percentage_amount(
        taxable_amount, tax_rule.tax_percentage if tax_rule else 0
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
        membership_free_items_amount=membership_free_items_amount,
        membership_item_discount_amount=membership_item_discount_amount,
        membership_regular_items_amount=membership_regular_items_amount,
        taxable_amount=taxable_amount,
        tax_amount=tax_amount,
        tax_rule_id=tax_rule.id if tax_rule else None,
        total_amount=total_amount,
        status=InvoiceStatus.PAID if total_amount <= 0 else InvoiceStatus.ISSUED,
        balance_amount=total_amount,
        doctor_share_amount=0,
        clinic_share_amount=total_amount,
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
        quantity = int(row.get("quantity") or 1)
        total_amount = money_value(row.get("total_amount"))
        unit_amount = money_value(row.get("unit_amount"))
        if unit_amount <= 0 and total_amount > 0 and quantity > 0:
            unit_amount = total_amount / quantity
        selling_amount = money_value(row.get("selling_amount") or unit_amount)
        if selling_amount <= 0 and total_amount > 0 and quantity > 0:
            selling_amount = total_amount / quantity
        mrp_amount = money_value(row.get("mrp_amount"))
        session.add(
            InvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                item_type=str(row.get("item_type") or item_type),
                description=str(row.get("description") or description),
                quantity=quantity,
                unit_amount=unit_amount,
                total_amount=total_amount,
                mrp_amount=mrp_amount,
                selling_amount=selling_amount,
                buying_amount=money_value(row.get("buying_amount")),
                supplier_id=str(row.get("supplier_id") or "") or None,
                external_source=str(row.get("external_source") or "") or None,
                external_slug=str(row.get("external_slug") or "") or None,
                external_item_code=str(row.get("external_item_code") or "") or None,
            )
        )
    session.flush()
    sync_invoice_item_discounts(
        session,
        invoice,
        free_item_ids=(membership_preview or {}).get("free_item_ids"),
        discounted_item_ids=(membership_preview or {}).get("discounted_item_ids"),
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
