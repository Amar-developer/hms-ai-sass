from collections.abc import Callable

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import enforce_entitlement, require_user_branch_access
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.billing.models import Invoice
from app.modules.billing.repositories.invoice_support_repository import (
    BillingInvoiceSupportRepository,
)
from app.modules.billing.schemas import InvoiceDetailRead, InvoiceMembershipBenefitRead
from app.modules.billing.services.invoice_status import update_invoice_payment_status
from app.modules.billing.services.rules import find_tax_rule
from app.modules.identity.models import User

InvoiceDetailReader = Callable[[Session, Invoice], InvoiceDetailRead]
MembershipLedgerEnsurer = Callable[..., None]

MEMBERSHIP_BENEFIT_FIELDS = (
    "status",
    "discount_amount",
    "membership_discount_amount",
    "membership_free_items_amount",
    "membership_item_discount_amount",
    "membership_regular_items_amount",
    "total_amount",
    "balance_amount",
)


def invoice_membership_service(invoice: Invoice) -> str | None:
    if invoice.lab_order_id:
        return "lab"
    if invoice.pharmacy_issue_id:
        return "pharmacy"
    if (
        invoice.consultation_id
        and not invoice.ip_admission_id
        and not invoice.physiotherapy_case_id
        and not invoice.home_care_booking_id
    ):
        return "consultation"
    return None


def _invoice_membership_item_ids(
    session: Session, invoice: Invoice, service_type: str
) -> list[str]:
    if service_type == "lab" and invoice.lab_order_id:
        return [
            item.test_id
            for item in BillingInvoiceSupportRepository(session).list_lab_order_items(
                invoice
            )
            if item.test_id
        ]
    if service_type == "pharmacy" and invoice.pharmacy_issue_id:
        return [
            item.medicine_id
            for item in BillingInvoiceSupportRepository(
                session
            ).list_pharmacy_issue_items(invoice)
            if item.medicine_id
        ]
    return []


def _invoice_membership_item_amounts(
    session: Session, invoice: Invoice, service_type: str
) -> dict[str, int]:
    if service_type == "lab" and invoice.lab_order_id:
        amounts: dict[str, int] = {}
        for item in BillingInvoiceSupportRepository(session).list_lab_order_items(
            invoice
        ):
            if item.test_id:
                amounts[item.test_id] = amounts.get(item.test_id, 0) + int(
                    item.price or 0
                )
        return amounts
    if service_type == "pharmacy" and invoice.pharmacy_issue_id:
        amounts: dict[str, int] = {}
        for item in BillingInvoiceSupportRepository(session).list_pharmacy_issue_items(
            invoice
        ):
            if item.medicine_id:
                amounts[item.medicine_id] = amounts.get(item.medicine_id, 0) + int(
                    item.quantity * item.unit_price
                )
        return amounts
    return {}


def invoice_membership_benefit(
    session: Session, invoice: Invoice
) -> InvoiceMembershipBenefitRead | None:
    service_type = invoice_membership_service(invoice)
    if not service_type:
        return None
    applied_amount = int(invoice.membership_discount_amount or 0)
    if applied_amount > 0:
        return InvoiceMembershipBenefitRead(
            has_active_subscription=True,
            is_applied=True,
            can_apply=False,
            service_type=service_type,
            plan_id=invoice.patient_subscription_plan_id,
            discount_amount=applied_amount,
            free_items_amount=int(invoice.membership_free_items_amount or 0),
            item_discount_amount=int(invoice.membership_item_discount_amount or 0),
            regular_items_amount=int(invoice.membership_regular_items_amount or 0),
            payable_amount=max(int(invoice.subtotal_amount or 0) - applied_amount, 0),
            reason="Membership benefit applied",
        )
    try:
        from app.modules.patient_subscriptions.service import (
            active_patient_enrollment,
            benefit_preview,
            consultation_department_id,
            sync_free_item_usage_from_invoices,
        )
    except ImportError:
        return None
    membership = active_patient_enrollment(
        session,
        tenant_id=invoice.tenant_id,
        patient_id=invoice.patient_id,
    )
    if not membership:
        return InvoiceMembershipBenefitRead(
            has_active_subscription=False,
            is_applied=False,
            can_apply=False,
            service_type=service_type,
            discount_amount=0,
            payable_amount=int(invoice.subtotal_amount or 0),
            reason="No active patient subscription",
        )
    enrollment, plan = membership
    sync_free_item_usage_from_invoices(session, enrollment, plan)
    preview = benefit_preview(
        plan=plan,
        enrollment=enrollment,
        service_type=service_type,
        item_ids=_invoice_membership_item_ids(session, invoice, service_type),
        item_amounts=_invoice_membership_item_amounts(session, invoice, service_type),
        subtotal_amount=int(invoice.subtotal_amount or 0),
        department_id=consultation_department_id(
            session,
            appointment_id=invoice.appointment_id,
            consultation_id=invoice.consultation_id,
        )
        if service_type == "consultation"
        else None,
        session=session,
    )
    discount_amount = int(preview["discount_amount"] or 0)
    return InvoiceMembershipBenefitRead(
        has_active_subscription=True,
        is_applied=False,
        can_apply=discount_amount > 0 and int(invoice.paid_amount or 0) <= 0,
        service_type=service_type,
        plan_id=preview.get("plan_id"),
        plan_name=preview.get("plan_name"),
        discount_amount=discount_amount,
        free_items_amount=int(preview["free_items_amount"] or 0),
        item_discount_amount=int(preview["item_discount_amount"] or 0),
        regular_items_amount=int(preview["regular_items_amount"] or 0),
        payable_amount=int(preview.get("payable_amount") or 0),
        reason=preview.get("reason"),
    )


def apply_invoice_membership_benefit(session: Session, invoice: Invoice) -> Invoice:
    if int(invoice.membership_discount_amount or 0) > 0:
        return update_invoice_payment_status(session, invoice)
    if int(invoice.paid_amount or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot apply membership benefit after payment is recorded",
        )
    service_type = invoice_membership_service(invoice)
    if not service_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Membership benefit is not available for this invoice type",
        )
    from app.modules.patient_subscriptions.service import (
        active_patient_enrollment,
        benefit_preview,
        consultation_department_id,
        consume_free_items,
        sync_free_item_usage_from_invoices,
    )

    membership = active_patient_enrollment(
        session,
        tenant_id=invoice.tenant_id,
        patient_id=invoice.patient_id,
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active patient membership found",
        )
    enrollment, plan = membership
    sync_free_item_usage_from_invoices(session, enrollment, plan)
    preview = benefit_preview(
        plan=plan,
        enrollment=enrollment,
        service_type=service_type,
        item_ids=_invoice_membership_item_ids(session, invoice, service_type),
        item_amounts=_invoice_membership_item_amounts(session, invoice, service_type),
        subtotal_amount=int(invoice.subtotal_amount or 0),
        department_id=consultation_department_id(
            session,
            appointment_id=invoice.appointment_id,
            consultation_id=invoice.consultation_id,
        )
        if service_type == "consultation"
        else None,
        session=session,
    )
    membership_discount = int(preview["discount_amount"] or 0)
    if membership_discount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=preview.get("reason") or "No membership benefit available",
        )
    offer_discount = max(
        int(invoice.discount_amount or 0)
        - int(invoice.membership_discount_amount or 0),
        0,
    )
    discount = min(
        offer_discount + membership_discount, int(invoice.subtotal_amount or 0)
    )
    taxable = max(int(invoice.subtotal_amount or 0) - discount, 0)
    tax_rule = find_tax_rule(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        service_scope=service_type,
        tax_rule_id=invoice.tax_rule_id,
    )
    tax_amount = round(taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100)
    total = taxable + tax_amount
    invoice.discount_amount = discount
    invoice.membership_discount_amount = membership_discount
    invoice.membership_free_items_amount = int(preview["free_items_amount"] or 0)
    invoice.membership_item_discount_amount = int(preview["item_discount_amount"] or 0)
    invoice.membership_regular_items_amount = int(preview["regular_items_amount"] or 0)
    invoice.taxable_amount = taxable
    invoice.tax_amount = tax_amount
    invoice.total_amount = total
    invoice.balance_amount = max(total - int(invoice.paid_amount or 0), 0)
    invoice.clinic_share_amount = max(total - int(invoice.doctor_share_amount or 0), 0)
    invoice.patient_subscription_enrollment_id = enrollment.id
    invoice.patient_subscription_plan_id = plan.id
    if service_type == "consultation":
        enrollment.used_consultations += 1
        session.add(enrollment)
    elif service_type in ("lab", "pharmacy") and preview.get("free_item_ids"):
        consume_free_items(
            enrollment,
            service_type=service_type,
            free_item_ids=preview["free_item_ids"],
        )
        session.add(enrollment)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return update_invoice_payment_status(session, invoice)


def apply_membership_benefit_to_invoice(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    current_user: User,
    ensure_invoice_membership_benefit_ledger: MembershipLedgerEnsurer,
    read_invoice_detail: InvoiceDetailReader,
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = BillingInvoiceSupportRepository(session).get_invoice_for_tenant(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    before = {key: getattr(invoice, key) for key in MEMBERSHIP_BENEFIT_FIELDS}
    invoice = apply_invoice_membership_benefit(session, invoice)
    ensure_invoice_membership_benefit_ledger(
        session,
        invoice,
        actor_user_id=current_user.id,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=current_user.id,
        action="invoice.membership_benefit_applied",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing",
        changes=diff_changes(
            before, {key: getattr(invoice, key) for key in MEMBERSHIP_BENEFIT_FIELDS}
        ),
    )
    return read_invoice_detail(session, invoice)
