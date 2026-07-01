from datetime import date, datetime, timezone
from pathlib import Path
import json
import re
import zlib

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.access_control import (
    enforce_entitlement,
    require_branch_in_tenant,
    require_user_branch_access,
    scoped_branch_id,
)
from app.core.auth import (
    is_tenant_admin_user,
    require_any_permission,
    require_permission,
)
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.appointments.models import Appointment, AppointmentType
from app.modules.audit.service import record_audit_event

from app.modules.billing.models import (
    BillingAdjustmentRequest,
    BillingAdjustmentStatus,
    BillingAdjustmentType,
    BillingLedgerEntry,
    DoctorFeeRule,
    CreditNote,
    DiscountApproval,
    DiscountOffer,
    ApprovalStatus,
    DoctorSettlement,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    SettlementStatus,
    TaxRule,
)
from app.modules.billing.schemas import (
    AmendInvoiceRequest,
    BillingAdjustmentDecision,
    BillingAdjustmentRequestCreate,
    BillingAdjustmentRequestRead,
    BillingLedgerEntryRead,
    CancelInvoiceRequest,
    CreditNoteCreate,
    CreditNoteRead,
    DiscountApprovalCreate,
    DiscountApprovalDecision,
    DiscountApprovalRead,
    DiscountOfferCreate,
    DiscountOfferRead,
    DiscountOfferUpdate,
    DoctorFeeRuleCreate,
    DoctorFeeRuleRead,
    DoctorSettlementFinalize,
    DoctorSettlementRead,
    DoctorSettlementSummary,
    DueCollectionReport,
    InvoiceCreateFromConsultation,
    InvoiceCreateFromLabOrder,
    InvoiceCreateFromPharmacyIssue,
    InvoiceDetailRead,
    InvoiceAmountUpdate,
    InvoiceItemRead,
    InvoiceItemSupplierOptionRead,
    InvoiceItemSupplierUpdate,
    InvoiceMembershipBenefitRead,
    InvoiceRead,
    PaymentCreate,
    PaymentRead,
    RevenueReport,
    RefundRequest,
    TaxRuleCreate,
    TaxRuleRead,
    TaxRuleUpdate,
)
from app.modules.billing.service import (
    calculate_fee_split,
    calculate_offer_discount,
    create_consultation_invoice,
    find_tax_rule,
    next_credit_note_number,
    next_invoice_number,
    refresh_consultation_invoice,
    refundable_paid_total,
    update_invoice_payment_status,
)
from app.modules.practitioners.models import Practitioner, PractitionerDepartment
from app.modules.consultations.models import Consultation, ConsultationStatus
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import queue_notification_if_allowed
from app.modules.patient_subscriptions.models import PatientSubscriptionEnrollment
from app.modules.patients.models import Patient
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import Branch, Tenant

router = APIRouter(prefix="/billing")


def _require_direct_invoice_reversal_admin(
    session: Session, current_user: User
) -> None:
    if current_user.is_super_admin or is_tenant_admin_user(session, current_user):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Tenant admin access required for direct invoice cancellation or amendment",
    )


def _record_billing_ledger(
    session: Session,
    invoice: Invoice,
    *,
    entry_type: str,
    description: str,
    debit_amount: int = 0,
    credit_amount: int = 0,
    invoice_total_delta: int = 0,
    paid_amount_delta: int = 0,
    balance_amount_delta: int = 0,
    reason: str | None = None,
    actor_user_id: str | None = None,
    related_payment_id: str | None = None,
    related_credit_note_id: str | None = None,
    commit: bool = True,
) -> BillingLedgerEntry:
    entry = BillingLedgerEntry(
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        invoice_number=invoice.invoice_number,
        entry_type=entry_type,
        description=description,
        debit_amount=max(int(debit_amount or 0), 0),
        credit_amount=max(int(credit_amount or 0), 0),
        invoice_total_delta=int(invoice_total_delta or 0),
        paid_amount_delta=int(paid_amount_delta or 0),
        balance_amount_delta=int(balance_amount_delta or 0),
        status_after=invoice.status,
        reason=reason,
        actor_user_id=actor_user_id,
        related_payment_id=related_payment_id,
        related_credit_note_id=related_credit_note_id,
    )
    session.add(entry)
    if commit:
        session.commit()
        session.refresh(entry)
    return entry


def _ensure_invoice_submit_ledger(session: Session, invoice: Invoice) -> None:
    exists = session.exec(
        select(BillingLedgerEntry).where(
            BillingLedgerEntry.tenant_id == invoice.tenant_id,
            BillingLedgerEntry.invoice_id == invoice.id,
            BillingLedgerEntry.entry_type == "invoice_submitted",
        )
    ).first()
    if exists:
        return
    _record_billing_ledger(
        session,
        invoice,
        entry_type="invoice_submitted",
        description="Invoice submitted",
        debit_amount=int(invoice.total_amount or 0),
        invoice_total_delta=int(invoice.total_amount or 0),
        balance_amount_delta=int(invoice.balance_amount or 0),
        actor_user_id=invoice.created_by_user_id,
    )


def _ensure_invoice_membership_benefit_ledger(
    session: Session,
    invoice: Invoice,
    *,
    actor_user_id: str | None = None,
) -> None:
    membership_amount = int(invoice.membership_discount_amount or 0)
    if membership_amount <= 0:
        return
    exists = session.exec(
        select(BillingLedgerEntry).where(
            BillingLedgerEntry.tenant_id == invoice.tenant_id,
            BillingLedgerEntry.invoice_id == invoice.id,
            BillingLedgerEntry.entry_type == "membership_benefit_applied",
        )
    ).first()
    if exists:
        return
    _record_billing_ledger(
        session,
        invoice,
        entry_type="membership_benefit_applied",
        description="Membership benefit applied",
        credit_amount=membership_amount,
        invoice_total_delta=-membership_amount,
        balance_amount_delta=-membership_amount,
        reason="Membership benefit settled by patient plan",
        actor_user_id=actor_user_id or invoice.created_by_user_id,
    )


def _sync_physiotherapy_case_status(session: Session, invoice: Invoice) -> None:
    if not invoice.physiotherapy_case_id:
        return
    from app.modules.physiotherapy.models import PhysiotherapyCase
    from app.modules.tenants.models import now_utc

    case = session.get(PhysiotherapyCase, invoice.physiotherapy_case_id)
    if not case or case.tenant_id != invoice.tenant_id:
        return
    target_status = (
        "paid"
        if invoice.status not in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}
        and invoice.balance_amount <= 0
        and invoice.total_amount > 0
        else "completed"
    )
    if case.status == target_status:
        return
    case.status = target_status
    case.updated_at = now_utc()
    session.add(case)
    session.commit()


def _sync_home_care_booking_status(session: Session, invoice: Invoice) -> None:
    if not invoice.home_care_booking_id:
        return
    from app.modules.home_care.models import HomeCareBooking
    from app.modules.tenants.models import now_utc

    booking = session.get(HomeCareBooking, invoice.home_care_booking_id)
    if not booking or booking.tenant_id != invoice.tenant_id:
        return
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        # The invoice was voided, so reopen the booking (back to an editable,
        # non-locked state) so it can be corrected and re-billed.
        target_status = "scheduled"
    elif invoice.balance_amount <= 0 and invoice.total_amount > 0:
        target_status = "paid"
    else:
        target_status = "invoiced"
    if booking.status == target_status:
        return
    booking.status = target_status
    booking.updated_at = now_utc()
    session.add(booking)
    session.commit()


def _sync_patient_membership_payment(session: Session, invoice: Invoice) -> None:
    if not invoice.patient_subscription_enrollment_id:
        return
    enrollment = session.get(
        PatientSubscriptionEnrollment, invoice.patient_subscription_enrollment_id
    )
    if not enrollment or enrollment.tenant_id != invoice.tenant_id:
        return
    # Only the plan-purchase invoice drives the membership's paid amount.
    # Benefit-usage invoices (lab/pharmacy/consultation with the membership
    # applied) also carry the enrollment id, but paying/refunding them must not
    # overwrite the membership's paid status.
    is_purchase_invoice = (
        invoice.id == enrollment.purchase_invoice_id
        if enrollment.purchase_invoice_id
        else not (
            invoice.lab_order_id
            or invoice.pharmacy_issue_id
            or invoice.consultation_id
            or invoice.ip_admission_id
            or invoice.physiotherapy_case_id
            or invoice.home_care_booking_id
        )
    )
    if not is_purchase_invoice:
        return
    paid_amount = max(
        0, min(int(invoice.paid_amount or 0), int(invoice.total_amount or 0))
    )
    if enrollment.paid_amount == paid_amount:
        return
    enrollment.paid_amount = paid_amount
    enrollment.updated_at = datetime.now(timezone.utc)
    session.add(enrollment)
    session.commit()


def _sync_invoice_source_after_reversal(session: Session, invoice: Invoice) -> None:
    _sync_physiotherapy_case_status(session, invoice)
    _sync_home_care_booking_status(session, invoice)
    _sync_patient_membership_payment(session, invoice)
    if invoice.pharmacy_issue_id:
        from app.modules.pharmacy.models import PharmacyIssue

        issue = session.get(PharmacyIssue, invoice.pharmacy_issue_id)
        if issue and issue.tenant_id == invoice.tenant_id:
            if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
                issue.billing_invoice_id = None
            else:
                issue.billing_invoice_id = invoice.id
            issue.updated_at = datetime.now(timezone.utc)
            session.add(issue)
            session.commit()


def _actor_names(session: Session, user_ids: set[str | None]) -> dict[str, str]:
    ids = {user_id for user_id in user_ids if user_id}
    if not ids:
        return {}
    users = session.exec(select(User).where(User.id.in_(ids))).all()
    return {user.id: user.name for user in users}


def _invoice_payment_methods(session: Session, invoice: Invoice) -> list[PaymentMethod]:
    payments = session.exec(
        select(Payment).where(
            Payment.tenant_id == invoice.tenant_id,
            Payment.invoice_id == invoice.id,
            Payment.status == PaymentStatus.RECORDED,
            Payment.amount > 0,
        )
    ).all()
    methods: list[PaymentMethod] = []
    seen: set[PaymentMethod] = set()
    for payment in payments:
        if payment.method in seen:
            continue
        seen.add(payment.method)
        methods.append(payment.method)
    return methods


def _invoice_read(session: Session, invoice: Invoice) -> InvoiceRead:
    invoice_read = InvoiceRead.model_validate(invoice, from_attributes=True)
    invoice_read.payment_methods = _invoice_payment_methods(session, invoice)
    if invoice.appointment_id:
        appointment = session.get(Appointment, invoice.appointment_id)
        if appointment and appointment.tenant_id == invoice.tenant_id:
            invoice_read.appointment_type = appointment.appointment_type
    return invoice_read


def _read_adjustment_request(
    session: Session, row: BillingAdjustmentRequest
) -> BillingAdjustmentRequestRead:
    names = _actor_names(
        session,
        {
            row.requested_by_user_id,
            row.approved_by_user_id,
            row.executed_by_user_id,
        },
    )
    read = BillingAdjustmentRequestRead.model_validate(row, from_attributes=True)
    read.requested_by_user_name = names.get(str(row.requested_by_user_id or ""))
    read.approved_by_user_name = names.get(str(row.approved_by_user_id or ""))
    read.executed_by_user_name = names.get(str(row.executed_by_user_id or ""))
    return read


def _invoice_adjustment_requests(
    session: Session, invoice: Invoice
) -> list[BillingAdjustmentRequestRead]:
    rows = list(
        session.exec(
            select(BillingAdjustmentRequest)
            .where(
                BillingAdjustmentRequest.tenant_id == invoice.tenant_id,
                BillingAdjustmentRequest.invoice_id == invoice.id,
            )
            .order_by(BillingAdjustmentRequest.created_at.desc())
        ).all()
    )
    names = _actor_names(
        session,
        {
            user_id
            for row in rows
            for user_id in (
                row.requested_by_user_id,
                row.approved_by_user_id,
                row.executed_by_user_id,
            )
        },
    )
    result = []
    for row in rows:
        read = BillingAdjustmentRequestRead.model_validate(row, from_attributes=True)
        read.requested_by_user_name = names.get(str(row.requested_by_user_id or ""))
        read.approved_by_user_name = names.get(str(row.approved_by_user_id or ""))
        read.executed_by_user_name = names.get(str(row.executed_by_user_id or ""))
        result.append(read)
    return result


def _validate_adjustment_amount(
    invoice: Invoice, request_type: BillingAdjustmentType, amount: int | None
) -> int:
    refundable = int(invoice.paid_amount or 0)
    if request_type == BillingAdjustmentType.CANCEL:
        return 0
    if request_type == BillingAdjustmentType.FULL_REFUND:
        if refundable <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invoice has no refundable paid amount",
            )
        return refundable
    requested = int(amount or 0)
    if requested <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Partial refund amount is required",
        )
    if requested > refundable:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refund amount cannot exceed refundable paid amount",
        )
    return requested


def _invoice_has_open_adjustment_request(session: Session, invoice: Invoice) -> bool:
    return (
        session.exec(
            select(BillingAdjustmentRequest)
            .where(
                BillingAdjustmentRequest.tenant_id == invoice.tenant_id,
                BillingAdjustmentRequest.invoice_id == invoice.id,
                BillingAdjustmentRequest.status.in_(
                    [
                        BillingAdjustmentStatus.PENDING,
                        BillingAdjustmentStatus.APPROVED,
                    ]
                ),
            )
            .limit(1)
        ).first()
        is not None
    )


def _ensure_invoice_can_request_adjustment(
    session: Session, invoice: Invoice, request_type: BillingAdjustmentType
) -> None:
    if invoice.status in {
        InvoiceStatus.CANCELLED,
        InvoiceStatus.REFUNDED,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice is already closed for cancellation/refund",
        )
    if _invoice_has_open_adjustment_request(session, invoice):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice already has a pending or approved adjustment request",
        )
    if (
        request_type == BillingAdjustmentType.CANCEL
        and int(invoice.paid_amount or 0) > 0
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Paid invoices must be refunded instead of cancelled",
        )


def _apply_refund_to_payments(
    session: Session, invoice: Invoice, amount: int, reason: str
) -> list[Payment]:
    remaining = amount
    changed: list[Payment] = []
    payments = list(
        session.exec(
            select(Payment)
            .where(
                Payment.tenant_id == invoice.tenant_id, Payment.invoice_id == invoice.id
            )
            .order_by(Payment.collected_at.desc())
        ).all()
    )
    for payment in payments:
        available = max(int(payment.amount or 0) - int(payment.refunded_amount or 0), 0)
        if available <= 0:
            continue
        refund_part = min(available, remaining)
        payment.refunded_amount = int(payment.refunded_amount or 0) + refund_part
        payment.refund_reason = reason
        if payment.refunded_amount >= payment.amount:
            payment.status = PaymentStatus.REFUNDED
            payment.refunded_at = datetime.now(timezone.utc)
        session.add(payment)
        changed.append(payment)
        remaining -= refund_part
        if remaining <= 0:
            break
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refund amount exceeds available payment balance",
        )
    session.commit()
    return changed


def _external_supplier_options(
    session: Session, item: InvoiceItem
) -> list[dict[str, int | str]]:
    from app.modules.lab.models import LabTestCatalog, LabTestPackage
    from app.modules.pharmacy.models import PharmacySupplier

    options: dict[str, int] = {}

    def add_option(supplier_id: str | None, buying_price: int | None) -> None:
        supplier = str(supplier_id or "").strip()
        if not supplier:
            return
        options[supplier] = int(buying_price or options.get(supplier, 0) or 0)

    if item.item_type == "lab":
        catalog_rows = []
        if item.external_item_code:
            catalog_rows.extend(
                session.exec(
                    select(LabTestCatalog).where(
                        LabTestCatalog.tenant_id == item.tenant_id,
                        LabTestCatalog.id == item.external_item_code,
                    )
                ).all()
            )
            catalog_rows.extend(
                session.exec(
                    select(LabTestPackage).where(
                        LabTestPackage.tenant_id == item.tenant_id,
                        LabTestPackage.id == item.external_item_code,
                    )
                ).all()
            )
        if not catalog_rows:
            name = str(item.description or "").strip().lower()
            if name:
                catalog_rows.extend(
                    session.exec(
                        select(LabTestCatalog).where(
                            LabTestCatalog.tenant_id == item.tenant_id,
                            func.lower(LabTestCatalog.name) == name,
                        )
                    ).all()
                )
                catalog_rows.extend(
                    session.exec(
                        select(LabTestPackage).where(
                            LabTestPackage.tenant_id == item.tenant_id,
                            func.lower(LabTestPackage.name) == name,
                        )
                    ).all()
                )
        for row in catalog_rows:
            add_option(row.supplier_id, row.purchase_price)

    add_option(item.supplier_id, int(item.buying_amount or 0))
    if not options:
        return []

    suppliers = session.exec(
        select(PharmacySupplier).where(
            PharmacySupplier.tenant_id == item.tenant_id,
            PharmacySupplier.id.in_(list(options.keys())),
        )
    ).all()
    supplier_names = {supplier.id: supplier.name for supplier in suppliers}
    return [
        {
            "supplier": supplier_id,
            "supplier_name": supplier_names.get(supplier_id, supplier_id),
            "buying_price": buying_price,
        }
        for supplier_id, buying_price in sorted(
            options.items(), key=lambda row: supplier_names.get(row[0], row[0])
        )
    ]


def _invoice_membership_service(invoice: Invoice) -> str | None:
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
        from app.modules.lab.models import LabOrderItem

        return [
            item.test_id
            for item in session.exec(
                select(LabOrderItem).where(
                    LabOrderItem.tenant_id == invoice.tenant_id,
                    LabOrderItem.lab_order_id == invoice.lab_order_id,
                )
            ).all()
            if item.test_id
        ]
    if service_type == "pharmacy" and invoice.pharmacy_issue_id:
        from app.modules.pharmacy.models import PharmacyIssueItem

        return [
            item.medicine_id
            for item in session.exec(
                select(PharmacyIssueItem).where(
                    PharmacyIssueItem.tenant_id == invoice.tenant_id,
                    PharmacyIssueItem.pharmacy_issue_id == invoice.pharmacy_issue_id,
                )
            ).all()
            if item.medicine_id
        ]
    return []


def _invoice_membership_item_amounts(
    session: Session, invoice: Invoice, service_type: str
) -> dict[str, int]:
    if service_type == "lab" and invoice.lab_order_id:
        from app.modules.lab.models import LabOrderItem

        amounts: dict[str, int] = {}
        for item in session.exec(
            select(LabOrderItem).where(
                LabOrderItem.tenant_id == invoice.tenant_id,
                LabOrderItem.lab_order_id == invoice.lab_order_id,
            )
        ).all():
            if item.test_id:
                amounts[item.test_id] = amounts.get(item.test_id, 0) + int(
                    item.price or 0
                )
        return amounts
    if service_type == "pharmacy" and invoice.pharmacy_issue_id:
        from app.modules.pharmacy.models import PharmacyIssueItem

        amounts: dict[str, int] = {}
        for item in session.exec(
            select(PharmacyIssueItem).where(
                PharmacyIssueItem.tenant_id == invoice.tenant_id,
                PharmacyIssueItem.pharmacy_issue_id == invoice.pharmacy_issue_id,
            )
        ).all():
            if item.medicine_id:
                amounts[item.medicine_id] = amounts.get(item.medicine_id, 0) + int(
                    item.quantity * item.unit_price
                )
        return amounts
    return {}


def _invoice_membership_benefit(
    session: Session, invoice: Invoice
) -> InvoiceMembershipBenefitRead | None:
    service_type = _invoice_membership_service(invoice)
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
        branch_id=invoice.branch_id,
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
        payable_amount=int(preview.get("payable_amount") or 0),
        reason=preview.get("reason"),
    )


def _apply_invoice_membership_benefit(session: Session, invoice: Invoice) -> Invoice:
    if int(invoice.membership_discount_amount or 0) > 0:
        return update_invoice_payment_status(session, invoice)
    if int(invoice.paid_amount or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot apply membership benefit after payment is recorded",
        )
    service_type = _invoice_membership_service(invoice)
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
        branch_id=invoice.branch_id,
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


def _pdf_text(value: object) -> str:
    return (
        str(value or "")
        .replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("\n", " ")
        .encode("latin-1", "replace")
        .decode("latin-1")
    )


def _money_pdf(value: object) -> str:
    return f"Rs. {int(value or 0):,}"


def _signed_money_pdf(value: object) -> str:
    amount = int(value or 0)
    if amount < 0:
        return f"- Rs. {abs(amount):,}"
    return _money_pdf(amount)


def _percent_pdf(amount: int, base: int) -> str:
    if amount <= 0 or base <= 0:
        return "0%"
    percent = amount * 100 / base
    return f"{percent:.1f}".rstrip("0").rstrip(".") + "%"


def _jpeg_size(data: bytes) -> tuple[int, int] | None:
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        block_length = int.from_bytes(data[index + 2 : index + 4], "big")
        if marker in {0xC0, 0xC1, 0xC2} and index + 8 < len(data):
            height = int.from_bytes(data[index + 5 : index + 7], "big")
            width = int.from_bytes(data[index + 7 : index + 9], "big")
            return width, height
        index += 2 + block_length
    return None


def _png_logo_image(data: bytes) -> dict[str, object] | None:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    offset = 8
    width = height = color_type = bit_depth = interlace = None
    compressed = bytearray()
    while offset + 8 <= len(data):
        length = int.from_bytes(data[offset : offset + 4], "big")
        chunk_type = data[offset + 4 : offset + 8]
        chunk_data = data[offset + 8 : offset + 8 + length]
        offset += 12 + length
        if chunk_type == b"IHDR":
            width = int.from_bytes(chunk_data[0:4], "big")
            height = int.from_bytes(chunk_data[4:8], "big")
            bit_depth = chunk_data[8]
            color_type = chunk_data[9]
            interlace = chunk_data[12]
        elif chunk_type == b"IDAT":
            compressed.extend(chunk_data)
        elif chunk_type == b"IEND":
            break
    if (
        not width
        or not height
        or bit_depth != 8
        or color_type not in {2, 6}
        or interlace != 0
    ):
        return None
    channels = 4 if color_type == 6 else 3
    stride = width * channels
    try:
        raw = zlib.decompress(bytes(compressed))
    except zlib.error:
        return None
    previous = [0] * stride
    rows: list[bytes] = []
    index = 0
    for _row in range(height):
        if index >= len(raw):
            return None
        filter_type = raw[index]
        index += 1
        scan = list(raw[index : index + stride])
        index += stride
        for i, value in enumerate(scan):
            left = scan[i - channels] if i >= channels else 0
            up = previous[i]
            up_left = previous[i - channels] if i >= channels else 0
            if filter_type == 1:
                scan[i] = (value + left) & 0xFF
            elif filter_type == 2:
                scan[i] = (value + up) & 0xFF
            elif filter_type == 3:
                scan[i] = (value + ((left + up) // 2)) & 0xFF
            elif filter_type == 4:
                p = left + up - up_left
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - up_left)
                predictor = (
                    left if pa <= pb and pa <= pc else up if pb <= pc else up_left
                )
                scan[i] = (value + predictor) & 0xFF
            elif filter_type != 0:
                return None
        previous = scan
        if channels == 4:
            composited = bytearray()
            for pixel in range(0, len(scan), 4):
                alpha = scan[pixel + 3]
                for channel in scan[pixel : pixel + 3]:
                    composited.append((channel * alpha + 255 * (255 - alpha)) // 255)
            rows.append(bytes(composited))
        else:
            rows.append(bytes(scan))
    image_data = zlib.compress(b"".join(rows))
    return {
        "data": image_data,
        "width": width,
        "height": height,
        "filter": "FlateDecode",
    }


def _local_logo_image(logo_url: str | None) -> dict[str, object] | None:
    if not logo_url:
        return None
    path: Path | None = None
    if logo_url.startswith("/uploads/"):
        path = Path("uploads") / Path(logo_url).name
    elif logo_url.startswith("uploads/"):
        path = Path(logo_url)
    if not path or not path.exists():
        return None
    data = path.read_bytes()
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        size = _jpeg_size(data)
        if not size:
            return None
        return {
            "data": data,
            "width": size[0],
            "height": size[1],
            "filter": "DCTDecode",
        }
    if path.suffix.lower() == ".png":
        return _png_logo_image(data)
    return None


def _build_receipt_pdf(
    *,
    tenant: Tenant | None,
    branch: Branch | None,
    patient: Patient | None,
    invoice: Invoice,
    items: list[InvoiceItem],
    payments: list[Payment],
    logo_url: str | None,
    bank_details: dict[str, object] | None = None,
) -> bytes:
    width, height = 595, 842
    ops: list[str] = []
    # The invoice-specific "Invoice Logo" setting (logo_url) is the authoritative
    # source for receipts; fall back to the general tenant logo. Resolve at the
    # image level (not the string level) so a stale/missing file for one source
    # never blocks a valid file from the other.
    logo = _local_logo_image(logo_url) or _local_logo_image(
        tenant.logo_url if tenant else None
    )
    green = "0.10 0.95 0.22"
    blue = "0.08 0.60 0.85"
    brand_green = "0.09 0.78 0.06"
    red = "0.78 0.00 0.00"

    def color(stroke="0.86 0.90 0.95", fill: str | None = None) -> None:
        ops.append(f"{stroke} RG")
        if fill:
            ops.append(f"{fill} rg")

    def rect(x: int, y: int, w: int, h: int, fill: bool = False) -> None:
        ops.append(f"{x} {y} {w} {h} re {'B' if fill else 'S'}")

    def line(
        x1: int, y1: int, x2: int, y2: int, stroke: str = "0.20 0.20 0.20"
    ) -> None:
        ops.append(f"{stroke} RG {x1} {y1} m {x2} {y2} l S")

    def location_icon(x: int, y: int, fill: str = "0.00 0.68 0.00") -> None:
        scale = 0.58
        ops.append(
            f"q {scale} 0 0 {-scale} {x} {y + int(25 * scale)} cm {fill} rg "
            "12.3153 11.803 m "
            "11.6349 11.803 10.9824 11.5327 10.5013 11.0516 c "
            "10.0202 10.5705 9.74994 9.91801 9.74994 9.23764 c "
            "9.74994 8.55727 10.0202 7.90477 10.5013 7.42367 c "
            "10.9824 6.94258 11.6349 6.6723 12.3153 6.6723 c "
            "12.9956 6.6723 13.6482 6.94258 14.1292 7.42367 c "
            "14.6103 7.90477 14.8806 8.55727 14.8806 9.23764 c "
            "14.8806 9.57453 14.8143 9.90811 14.6853 10.2194 c "
            "14.5564 10.5306 14.3675 10.8134 14.1292 11.0516 c "
            "13.891 11.2898 13.6082 11.4788 13.297 11.6077 c "
            "12.9858 11.7366 12.6522 11.803 12.3153 11.803 c "
            "12.3153 2.05469 m "
            "10.4102 2.05469 8.58323 2.81146 7.23616 4.15853 c "
            "5.8891 5.50559 5.13232 7.3326 5.13232 9.23764 c "
            "5.13232 14.6249 12.3153 22.5774 12.3153 22.5774 c "
            "12.3153 22.5774 19.4982 14.6249 19.4982 9.23764 c "
            "19.4982 7.3326 18.7415 5.50559 17.3944 4.15853 c "
            "16.0473 2.81146 14.2203 2.05469 12.3153 2.05469 c f Q"
        )

    def text(
        x: int,
        y: int,
        value: object,
        size: int = 10,
        bold: bool = False,
        align: str = "left",
        fill: str = "0.02 0.03 0.08",
    ) -> None:
        value = _pdf_text(value)
        if align == "right":
            x -= int(len(value) * size * 0.48)
        elif align == "center":
            x -= int(len(value) * size * 0.24)
        font = "F2" if bold else "F1"
        ops.append(f"{fill} rg BT /{font} {size} Tf 1 0 0 1 {x} {y} Tm ({value}) Tj ET")

    def text_width(value: object, size: int, bold: bool = False) -> int:
        raw = _pdf_text(value)
        if bold:
            widths = {
                " ": 0.278,
                ".": 0.278,
                ",": 0.278,
                "-": 0.333,
                "|": 0.280,
                "#": 0.556,
                "+": 0.584,
                "/": 0.278,
            }
            total = 0.0
            for char in raw:
                if char.isupper():
                    total += {
                        "I": 0.278,
                        "J": 0.389,
                        "M": 0.833,
                        "W": 0.944,
                    }.get(char, 0.722)
                elif char.islower():
                    total += {
                        "i": 0.278,
                        "j": 0.278,
                        "l": 0.278,
                        "m": 0.833,
                        "r": 0.389,
                        "t": 0.333,
                        "w": 0.722,
                    }.get(char, 0.556)
                elif char.isdigit():
                    total += 0.556
                else:
                    total += widths.get(char, 0.556)
            return int(total * size)
        return int(len(raw) * size * 0.50)

    def wrap_text(value: object, max_chars: int) -> list[str]:
        words = str(value or "").split()
        lines: list[str] = []
        current = ""
        for word in words:
            next_value = f"{current} {word}".strip()
            if len(next_value) > max_chars and current:
                lines.append(current)
                current = word
            else:
                current = next_value
        if current:
            lines.append(current)
        return lines or [""]

    def center(x1: int, x2: int, y: int, value: object, size=8, bold=False) -> None:
        text((x1 + x2) // 2, y, value, size, bold, "center")

    def item_selling_amount(item: InvoiceItem) -> int:
        return int(item.selling_amount or item.unit_amount or 0)

    def item_mrp_amount(item: InvoiceItem) -> int | None:
        mrp = int(item.mrp_amount or 0)
        if mrp > 0:
            return mrp
        if item.item_type == "pharmacy":
            return item_selling_amount(item) or None
        return None

    def item_mrp_text(item: InvoiceItem) -> str:
        mrp = item_mrp_amount(item)
        return _money_pdf(mrp) if mrp else "-"

    def item_discount_percent(item: InvoiceItem) -> str:
        mrp = item_mrp_amount(item)
        selling = item_selling_amount(item)
        if not mrp or selling >= mrp:
            return "-"
        return f"{((mrp - selling) * 100 / mrp):.2f}"

    def field_label(
        x: int, y: int, label: str, value: object = "", max_chars: int = 33
    ) -> int:
        """Draws a label/value row. Returns the number of value lines drawn
        so callers can shift subsequent rows down when the value wraps."""
        text(x, y, label, 8, True)
        text(x + 58, y, ":", 8, True)
        lines_drawn = 1
        if value not in (None, ""):
            wrapped = wrap_text(value, max_chars)[:3]
            for offset, line_value in enumerate(wrapped):
                text(x + 70, y - offset * 10, line_value, 8)
            lines_drawn = max(len(wrapped), 1)
        return lines_drawn

    def field_label_height(value: object, max_chars: int = 33) -> int:
        """Vertical space (in row units of 10pt) a field_label call will need
        beyond its first line, so the next row can be pushed down accordingly."""
        if value in (None, ""):
            return 0
        return max(len(wrap_text(value, max_chars)[:3]) - 1, 0)

    def amount_words(value: int) -> str:
        ones = [
            "zero",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen",
        ]
        tens = [
            "",
            "",
            "twenty",
            "thirty",
            "forty",
            "fifty",
            "sixty",
            "seventy",
            "eighty",
            "ninety",
        ]

        def small(number: int) -> str:
            parts: list[str] = []
            if number >= 100:
                parts.append(f"{ones[number // 100]} hundred")
                number %= 100
            if number >= 20:
                parts.append(tens[number // 10])
                number %= 10
            if number:
                parts.append(ones[number])
            return " ".join(parts)

        value = max(int(value or 0), 0)
        if value == 0:
            return "Rupees Zero Only"
        parts: list[str] = []
        for scale, label in ((10000000, "crore"), (100000, "lakh"), (1000, "thousand")):
            if value >= scale:
                parts.append(f"{small(value // scale)} {label}")
                value %= scale
        if value:
            parts.append(small(value))
        return f"Rupees {' '.join(parts)} Only".title()

    tenant_name = (tenant.name if tenant and tenant.name else "").strip()
    legal_name = (
        (tenant.legal_name if tenant and tenant.legal_name else "")
        or tenant_name
        or "Hospital"
    ).strip()
    header_address = (tenant.address if tenant and tenant.address else "").strip()
    patient_name = (
        getattr(patient, "full_name", None)
        or getattr(patient, "name", None)
        or "Patient"
    )
    patient_phone = (
        getattr(patient, "mobile", None)
        or getattr(patient, "guardian_mobile", None)
        or ""
    )
    patient_address = (
        getattr(patient, "address", None) or getattr(patient, "area", None) or ""
    )
    color(stroke="1 1 1", fill="1 1 1")
    rect(0, 0, width, height, True)

    logo_x = 30
    logo_w = 78 if logo else 0
    if logo:
        image_w = logo_w
        image_h = max(
            34, min(62, int(image_w * int(logo["height"]) / int(logo["width"])))
        )
        ops.append(f"q {image_w} 0 0 {image_h} {logo_x} 765 cm /Logo Do Q")
    title_size = 20 if len(legal_name) <= 36 else 17 if len(legal_name) <= 52 else 14
    title_parts = legal_name.split(maxsplit=1)
    title_left_bound = 120 if logo else 24
    title_right_bound = 522
    title_center_x = (title_left_bound + title_right_bound) // 2
    title_first = title_parts[0] if title_parts else legal_name
    title_total_width = text_width(legal_name, title_size, True)
    title_available_width = title_right_bound - title_left_bound
    while title_size > 12 and title_total_width > title_available_width:
        title_size -= 1
        title_total_width = text_width(legal_name, title_size, True)
    title_x = max(title_left_bound, title_center_x - title_total_width // 2)
    text(title_x, 790, legal_name, title_size, True, fill=brand_green)
    if title_first:
        text(title_x, 790, title_first, title_size, True, fill=blue)
    title_line_end = min(title_right_bound, title_x + title_total_width)
    line(title_x, 781, title_line_end, 781, green)
    bank_details = bank_details if isinstance(bank_details, dict) else {}
    bank_name = str(
        bank_details.get("account_name") or bank_details.get("name") or ""
    ).strip()
    bank_branch = str(
        bank_details.get("branch_name") or bank_details.get("branch") or ""
    ).strip()
    bank_account = str(
        bank_details.get("account_number") or bank_details.get("acc_number") or ""
    ).strip()
    bank_ifsc = str(bank_details.get("ifsc") or "").strip().upper()
    bank_upi = str(bank_details.get("upi_id") or bank_details.get("upi") or "").strip()
    tenant_gstin = str(bank_details.get("gstin") or "").strip().upper()
    address_line = wrap_text(header_address, 90)[0] if header_address else ""
    if header_address:
        address_width = 18 + text_width(address_line, 10, True)
        address_x = max(title_left_bound, title_center_x - address_width // 2)
        location_icon(address_x, 763)
        text(address_x + 18, 764, address_line, 10, True, fill=brand_green)
    text(575, 776, "INVOICE", 13, True, "right", fill=red)
    line(16, 752, 579, 752, green)
    text(
        297,
        734,
        "A Single Stop for All Your HealthCare Needs !",
        9,
        True,
        "center",
        fill="0.00 0.70 0.30",
    )

    color(stroke=green)
    rect(16, 592, 563, 126)
    line(16, 700, 579, 700, green)
    line(291, 592, 291, 718, green)
    text(130, 706, "Customer Details", 9, True, "center")
    # Center the whole "<name> GSTIN : <value>" line within the right column
    # section (between the divider at x=291 and the right border at x=579).
    gst_label = f"{tenant_name or legal_name} GSTIN"
    gst_size = 8 if len(gst_label) <= 28 else 7
    gst_sep = " : "
    gst_value = tenant_gstin or ""
    gst_label_w = text_width(gst_label, gst_size, True)
    gst_sep_w = text_width(gst_sep, gst_size, True)
    gst_value_w = text_width(gst_value, 8, True)
    gst_total_w = gst_label_w + gst_sep_w + gst_value_w
    gst_start_x = (291 + 579) // 2 - gst_total_w // 2
    text(gst_start_x, 706, gst_label, gst_size, True)
    text(gst_start_x + gst_label_w, 706, gst_sep, gst_size, True)
    if gst_value:
        text(gst_start_x + gst_label_w + gst_sep_w, 706, gst_value, 8, True)
    field_label(25, 682, "Patient ID", getattr(patient, "patient_number", "") or "")
    field_label(25, 666, "Name", patient_name)
    field_label(25, 650, "Phone No.", patient_phone)
    field_label(25, 634, "WhatsApp No.", patient_phone)
    field_label(25, 618, "Address", patient_address)
    field_label(306, 679, "Invoice No.", invoice.invoice_number)
    field_label(306, 662, "Invoice Date", invoice.created_at.strftime("%d/%m/%Y"))

    table_top = 578
    table_bottom = 280
    x_cols = [16, 38, 226, 274, 371, 419, 467, 515, 579]
    rect(16, table_bottom, 563, table_top - table_bottom)
    line(16, 552, 579, 552, green)
    for x in x_cols[1:-1]:
        line(x, table_bottom, x, table_top, green)
    center(16, 38, 563, "Sr.\nNo", 7, True)
    center(38, 226, 563, "Name of Product / Service", 8, True)
    center(226, 274, 563, "Exp. Date", 8, True)
    center(274, 371, 563, "HSN / SAC", 8, True)
    center(371, 419, 563, "Qty", 8, True)
    center(419, 467, 563, "MRP", 8, True)
    center(467, 515, 563, "Disc. %", 8, True)
    center(515, 579, 563, "Rate", 8, True)

    subtotal = int(invoice.subtotal_amount or 0)
    membership_discount = min(
        int(getattr(invoice, "membership_discount_amount", 0) or 0),
        int(invoice.discount_amount or 0),
    )
    extra_discount = max(int(invoice.discount_amount or 0) - membership_discount, 0)
    total_invoice_discount = extra_discount + membership_discount
    taxable = int(invoice.taxable_amount or max(subtotal - total_invoice_discount, 0))
    tax = int(invoice.tax_amount or 0)
    item_quantity_total = sum(int(item.quantity or 0) for item in items)
    item_discount_total = sum(
        max((item_mrp_amount(item) or 0) - item_selling_amount(item), 0)
        * int(item.quantity or 0)
        for item in items
    )
    total_discount = item_discount_total + total_invoice_discount

    row_y = 532
    for index, item in enumerate(items[:10], start=1):
        text(25, row_y, index, 8)
        for offset, line_value in enumerate(wrap_text(item.description, 36)[:2]):
            text(45, row_y - offset * 10, line_value, 8)
        text(396, row_y, item.quantity, 8, align="right")
        text(459, row_y, item_mrp_text(item), 8, align="right")
        text(505, row_y, item_discount_percent(item), 8, align="right")
        text(570, row_y, _money_pdf(item.total_amount), 8, align="right")
        row_y -= 18
    if len(items) > 10:
        text(45, row_y, f"+ {len(items) - 10} more item(s)", 8, True)

    summary_y = 338
    summary_rows: list[tuple[str, int]] = [
        ("Subtotal", subtotal),
    ]
    if membership_discount > 0:
        summary_rows.append(("Membership Benefit", -membership_discount))
    if extra_discount > 0:
        summary_rows.append(("Extra Discount", -extra_discount))
    if tax > 0:
        summary_rows.append((f"Tax ({_percent_pdf(tax, taxable)})", tax))
    for label, amount in summary_rows:
        text(350, summary_y, label, 8, True, "right")
        text(570, summary_y, _signed_money_pdf(amount), 8, amount >= 0, "right")
        summary_y -= 16

    line(16, 264, 579, 264, green)
    for x in [371, 419, 467, 515]:
        line(x, 264, x, 280, green)
    text(406, 269, item_quantity_total, 8, True, "right")
    if total_discount > 0:
        text(505, 269, _money_pdf(total_discount), 8, True, "right")
    text(350, 269, "Total", 9, True, "right")
    text(570, 269, _money_pdf(invoice.total_amount), 9, True, "right")

    rect(16, 241, 563, 23)
    words_label = "Total in words: "
    text(25, 250, words_label, 8)
    text(
        25 + text_width(words_label, 8),
        250,
        amount_words(int(invoice.total_amount or 0)),
        8,
        True,
        fill="0.012 0.780 0.467",  # #03C777
    )

    # ------------------------------------------------------------------
    # Footer: Bank Details (left column) cascades dynamically based on how
    # many lines each field wraps to, so long bank/account names never
    # collide with the QR box or the rows below them. Terms & Conditions
    # and the Customer Signature box (left column), plus the certification
    # text and Authorized Signature (right column), all derive their
    # vertical position from the bank box's actual height instead of using
    # fixed y-coordinates.
    # ------------------------------------------------------------------
    # 7:5 column split — bank details (left) gets 7/12 of the footer width,
    # the certification column (right) gets the remaining 5/12.
    left_x, right_x = 16, 579
    mid_x = left_x + round((right_x - left_x) * 7 / 12)  # = 344
    footer_bottom = 24
    row_gap = 16  # vertical gap between label rows when value is a single line
    min_sig_box_height = 30  # never shrink the signature box below this
    min_terms_box_height = 20  # never shrink the terms box below this (last resort)
    page_top_y = 241  # original fixed top of the whole left-column box stack

    bank_header_y = 224  # "Bank Details" header divider stays anchored here
    name_y = bank_header_y - 15
    name_extra = field_label_height(bank_name)
    branch_y = name_y - row_gap - (name_extra * 10)
    branch_extra = field_label_height(bank_branch)
    acc_y = branch_y - row_gap - (branch_extra * 10)
    acc_extra = field_label_height(bank_account)
    ifsc_y = acc_y - row_gap - (acc_extra * 10)
    ifsc_extra = field_label_height(bank_ifsc)
    upi_y = ifsc_y - row_gap - (ifsc_extra * 10)
    upi_extra = field_label_height(bank_upi)

    bank_box_top = page_top_y
    # 8pt gap from the last drawn row down to the box border, same as original.
    bank_box_bottom = upi_y - (upi_extra * 10) - 8
    bank_box_height = bank_box_top - bank_box_bottom

    rect(left_x, bank_box_bottom, mid_x - left_x, bank_box_height)
    line(left_x, bank_header_y, mid_x, bank_header_y, green)
    center(left_x, mid_x, bank_header_y + 5, "Bank Details", 8, True)
    field_label(25, name_y, "Name", bank_name)
    field_label(25, branch_y, "Branch", bank_branch)
    field_label(25, acc_y, "Acc. Number", bank_account)
    field_label(25, ifsc_y, "IFSC", bank_ifsc)
    field_label(25, upi_y, "UPI ID", bank_upi)

    # QR box: a true square (equal width/height), right-aligned within the
    # bank box and vertically centered against the Acc. Number / IFSC rows,
    # clamped so the whole square always stays inside the (possibly taller)
    # bank box.
    qr_size = 48
    caption_gap = 14  # room for the "Pay using UPI" caption below the square
    qr_x = mid_x - 28 - qr_size  # leave a ~28pt margin to the column border
    qr_y_top = min(acc_y + 6, bank_box_top - 8)
    qr_y_bottom = qr_y_top - qr_size
    # Keep the square *and* its caption inside the bank box so the caption
    # never crosses the Terms & Conditions border below.
    if qr_y_bottom - caption_gap < bank_box_bottom + 4:
        qr_y_bottom = bank_box_bottom + 4 + caption_gap
        qr_y_top = qr_y_bottom + qr_size
    rect(qr_x, qr_y_bottom, qr_size, qr_size)
    text(qr_x + 3, qr_y_bottom - 10, "Pay using UPI", 8, True)

    # Terms & Conditions and Customer Signature share whatever vertical room
    # is left below the bank box (the three boxes are contiguous, just as in
    # the original fixed layout). The signature box keeps a usable minimum
    # height first; Terms & Conditions absorbs the remaining wrap overflow
    # from the bank box, and only shrinks below its natural height once the
    # bank box has grown enough to need it. This guarantees the stack never
    # overflows past the page footer, however long the bank details are.
    remaining_height = bank_box_bottom - footer_bottom
    sig_box_height = min_sig_box_height
    terms_box_height = max(remaining_height - sig_box_height, min_terms_box_height)
    natural_terms_height = 75
    if terms_box_height > natural_terms_height:
        # Plenty of room: give Terms & Conditions its natural height and let
        # the signature box take any leftover space.
        terms_box_height = natural_terms_height
        sig_box_height = max(remaining_height - terms_box_height, min_sig_box_height)

    terms_box_top = bank_box_bottom
    terms_box_bottom = terms_box_top - terms_box_height
    rect(left_x, terms_box_bottom, mid_x - left_x, terms_box_height)
    # Header text sits 12pt *below* the top border (matching the original
    # fixed layout's relationship between its rect-top and header y), so it
    # never crowds the bank box's last row sitting just above this border.
    header_divider_y = terms_box_top - 18
    line(left_x, header_divider_y, mid_x, header_divider_y, green)
    center(left_x, mid_x, terms_box_top - 12, "Terms and Conditions", 8, True)
    terms_lines = [
        "Subject to Tamil Nadu Junction.",
        "Our Responsibility Ceases as soon as goods leaves our Premises.",
        "Goods Once sold will not taken back.",
        "Delivery Ex-Premises.",
    ]
    # Show as many terms lines as fit in whatever height this box ended up
    # with, instead of overflowing past its own border when squeezed.
    max_terms_lines = max(int((terms_box_height - 24) // 11), 1)
    for offset, line_value in enumerate(terms_lines[:max_terms_lines]):
        text(25, terms_box_top - 33 - offset * 11, line_value, 7)

    sig_box_top = terms_box_bottom
    sig_box_bottom = sig_box_top - sig_box_height
    rect(left_x, sig_box_bottom, mid_x - left_x, sig_box_height)
    text(
        25, sig_box_bottom + max(sig_box_height - 20, 4), "Customer Signature", 8, True
    )

    # Right column mirrors the full combined height of the left column boxes
    # so the two columns' outer borders always line up with each other.
    right_col_top = bank_box_top
    right_col_bottom = sig_box_bottom
    rect(mid_x, right_col_bottom, right_x - mid_x, right_col_top - right_col_bottom)
    # Left padding inside the right column so text never sits on the column
    # border; the certification line wraps to the column width.
    cert_pad = mid_x + 10
    top_divider_y = right_col_top - 44
    line(mid_x, top_divider_y, right_x, top_divider_y, green)
    line(mid_x, right_col_bottom + 38, right_x, right_col_bottom + 38, green)
    cert_lines = wrap_text(
        "Certified that the particulars give above are true and correct.", 50
    )
    for offset, cert_line in enumerate(cert_lines):
        text(cert_pad, right_col_top - 11 - offset * 11, cert_line, 7)
    # "For <legal name>" gets clear space above the divider line below it.
    text(cert_pad, top_divider_y + 9, f"For {legal_name}", 8, True)
    text(
        (mid_x + right_x) // 2,
        right_col_bottom + 15,
        "Authorized Signature",
        8,
        True,
        "center",
    )

    text(
        25,
        8,
        "Thanks for your order! We look forward to working with you again soon.",
        7,
    )

    content = "\n".join(ops).encode("latin-1", "replace")
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    ]
    resources = b"/Font << /F1 4 0 R /F2 5 0 R >>"
    image_object_id = None
    if logo:
        image_object_id = 6
        resources += b" /XObject << /Logo 6 0 R >>"
    objects.append(
        f"<< /Type /Page /Parent 2 0 R /Resources << {resources.decode()} >> /MediaBox [0 0 {width} {height}] /Contents {'7' if logo else '6'} 0 R >>".encode()
    )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    if logo and image_object_id:
        logo_data = bytes(logo["data"])
        logo_filter = str(logo.get("filter") or "DCTDecode")
        objects.append(
            f"<< /Type /XObject /Subtype /Image /Width {logo['width']} /Height {logo['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /{logo_filter} /Length {len(logo_data)} >>\nstream\n".encode()
            + logo_data
            + b"\nendstream"
        )
    objects.append(
        f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream"
    )

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode())
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    startxref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(
        f"trailer << /Root 1 0 R /Size {len(objects) + 1} >>\nstartxref\n{startxref}\n%%EOF".encode()
    )
    return bytes(pdf)


def _read_invoice_detail(session: Session, invoice: Invoice) -> InvoiceDetailRead:
    invoice = _normalize_invoice_status(session, invoice)
    _ensure_invoice_submit_ledger(session, invoice)
    _ensure_invoice_membership_benefit_ledger(session, invoice)
    items = list(
        session.exec(
            select(InvoiceItem)
            .where(
                InvoiceItem.tenant_id == invoice.tenant_id,
                InvoiceItem.invoice_id == invoice.id,
            )
            .order_by(InvoiceItem.created_at)
        ).all()
    )
    payments = list(
        session.exec(
            select(Payment)
            .where(
                Payment.tenant_id == invoice.tenant_id, Payment.invoice_id == invoice.id
            )
            .order_by(Payment.collected_at)
        ).all()
    )
    credit_notes = list(
        session.exec(
            select(CreditNote)
            .where(
                CreditNote.tenant_id == invoice.tenant_id,
                CreditNote.invoice_id == invoice.id,
            )
            .order_by(CreditNote.created_at)
        ).all()
    )
    ledger_entries = list(
        session.exec(
            select(BillingLedgerEntry)
            .where(
                BillingLedgerEntry.tenant_id == invoice.tenant_id,
                BillingLedgerEntry.invoice_id == invoice.id,
            )
            .order_by(BillingLedgerEntry.created_at.desc())
        ).all()
    )
    actor_ids = {entry.actor_user_id for entry in ledger_entries if entry.actor_user_id}
    actor_names: dict[str, str] = {}
    if actor_ids:
        actors = session.exec(select(User).where(User.id.in_(actor_ids))).all()
        actor_names = {actor.id: actor.name for actor in actors}
    supplier_names: dict[str, str] = {}
    supplier_ids = {item.supplier_id for item in items if item.supplier_id}
    if supplier_ids:
        from app.modules.pharmacy.models import PharmacySupplier

        suppliers = session.exec(
            select(PharmacySupplier).where(
                PharmacySupplier.tenant_id == invoice.tenant_id,
                PharmacySupplier.id.in_(supplier_ids),
            )
        ).all()
        supplier_names = {supplier.id: supplier.name for supplier in suppliers}
    consultation_vendor_name: str | None = None
    if invoice.appointment_id:
        appointment = session.get(Appointment, invoice.appointment_id)
        if appointment and appointment.tenant_id == invoice.tenant_id:
            if appointment.practitioner_id:
                practitioner = session.get(Practitioner, appointment.practitioner_id)
                if practitioner and practitioner.tenant_id == invoice.tenant_id:
                    consultation_vendor_name = practitioner.full_name
    consultation_vendor_amount = int(invoice.doctor_share_amount or 0)

    def item_read(item: InvoiceItem) -> InvoiceItemRead:
        read = InvoiceItemRead.model_validate(item, from_attributes=True)
        if item.item_type == "consultation" and consultation_vendor_amount > 0:
            read.vendor_name = consultation_vendor_name or "Doctor share"
            read.vendor_amount = consultation_vendor_amount
        elif item.item_type in {"lab", "pharmacy"}:
            read.vendor_name = (
                supplier_names.get(str(item.supplier_id or ""))
                or item.supplier_id
                or None
            )
            read.vendor_amount = int(item.buying_amount or 0)
        return read

    def ledger_read(entry: BillingLedgerEntry) -> BillingLedgerEntryRead:
        read = BillingLedgerEntryRead.model_validate(entry, from_attributes=True)
        read.actor_user_name = actor_names.get(str(entry.actor_user_id or ""))
        return read

    invoice_read = _invoice_read(session, invoice)
    return InvoiceDetailRead(
        status=invoice_read.status,
        invoice=invoice_read,
        items=[item_read(item) for item in items],
        payments=[
            PaymentRead.model_validate(payment, from_attributes=True)
            for payment in payments
        ],
        credit_notes=[
            CreditNoteRead.model_validate(credit_note, from_attributes=True)
            for credit_note in credit_notes
        ],
        ledger_entries=[ledger_read(entry) for entry in ledger_entries],
        adjustment_requests=_invoice_adjustment_requests(session, invoice),
        membership_benefit=_invoice_membership_benefit(session, invoice),
    )


def _normalize_invoice_status(session: Session, invoice: Invoice) -> Invoice:
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        return invoice
    if int(invoice.total_amount or 0) <= 0 or int(invoice.balance_amount or 0) <= 0:
        return update_invoice_payment_status(session, invoice)
    return invoice


def _create_service_invoice(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    patient_id: str,
    appointment_id: str | None,
    consultation_id: str | None,
    lab_order_id: str | None = None,
    pharmacy_issue_id: str | None = None,
    item_type: str,
    description: str,
    amount: int,
    created_by_user_id: str | None,
    line_items: list[dict[str, int | str | None]] | None = None,
    service_scope: str,
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
    membership = None
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
            branch_id=branch_id,
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
        membership = None
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
    _record_billing_ledger(
        session,
        invoice,
        entry_type="invoice_submitted",
        description="Invoice submitted",
        debit_amount=total_amount,
        invoice_total_delta=total_amount,
        balance_amount_delta=total_amount,
        actor_user_id=created_by_user_id,
    )
    _ensure_invoice_membership_benefit_ledger(
        session,
        invoice,
        actor_user_id=created_by_user_id,
    )
    return invoice


@router.post(
    "/doctor-fee-rules",
    response_model=DoctorFeeRuleRead,
    status_code=status.HTTP_201_CREATED,
)
def create_doctor_fee_rule(
    payload: DoctorFeeRuleCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_CREATE,
            permissions.PRACTITIONERS_EDIT,
        )
    ),
) -> DoctorFeeRule:
    enforce_entitlement(session, tenant_id, "billing_basic", current_user=current_user)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    if payload.practitioner_id:
        practitioner = session.get(Practitioner, payload.practitioner_id)
        if (
            practitioner
            and practitioner.tenant_id == tenant_id
            and payload.department_id
        ):
            department_link = session.get(
                PractitionerDepartment,
                (payload.practitioner_id, payload.department_id),
            )
            if (
                not department_link
                or department_link.tenant_id != tenant_id
                or not department_link.is_active
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Practitioner is not assigned to this department",
                )
    if (
        payload.share_type.value == "percentage"
        and payload.doctor_share_percentage is None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doctor_share_percentage is required for percentage share",
        )
    if payload.share_type.value == "fixed" and payload.doctor_fixed_amount is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doctor_fixed_amount is required for fixed share",
        )
    existing_rules = session.exec(
        select(DoctorFeeRule).where(
            DoctorFeeRule.tenant_id == tenant_id,
            DoctorFeeRule.branch_id == payload.branch_id,
            DoctorFeeRule.department_id == payload.department_id,
            DoctorFeeRule.practitioner_id == payload.practitioner_id,
            DoctorFeeRule.appointment_type == payload.appointment_type,
            DoctorFeeRule.treatment_type == payload.treatment_type,
            DoctorFeeRule.is_active == True,  # noqa: E712
        )
    ).all()
    if any(
        existing.fee_amount == payload.fee_amount
        and existing.share_type == payload.share_type
        and existing.doctor_share_percentage == payload.doctor_share_percentage
        and existing.doctor_fixed_amount == payload.doctor_fixed_amount
        and existing.share_tax_with_doctor == payload.share_tax_with_doctor
        for existing in existing_rules
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An identical active doctor fee rule already exists",
        )
    for existing in existing_rules:
        existing.is_active = False
        session.add(existing)

    rule = DoctorFeeRule.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(rule)
    session.commit()
    session.refresh(rule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=rule.branch_id,
        action="doctor_fee_rule.created",
        resource_type="doctor_fee_rule",
        resource_id=rule.id,
        purpose="billing_configuration",
    )
    return rule


@router.get("/doctor-fee-rules", response_model=list[DoctorFeeRuleRead])
def list_doctor_fee_rules(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_READ,
            permissions.PRACTITIONERS_EDIT,
            permissions.PHYSIOTHERAPY_READ,
            permissions.PHYSIOTHERAPY_EDIT,
        )
    ),
) -> list[DoctorFeeRule]:
    enforce_entitlement(session, tenant_id, "billing_basic", current_user=current_user)
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(DoctorFeeRule).where(DoctorFeeRule.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(DoctorFeeRule.branch_id == branch_id)
    return list(session.exec(statement.order_by(DoctorFeeRule.created_at)).all())


@router.post(
    "/tax-rules", response_model=TaxRuleRead, status_code=status.HTTP_201_CREATED
)
def create_tax_rule(
    payload: TaxRuleCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.TAX_MANAGE, permissions.TAX_CREATE, permissions.BILLING_MANAGE
        )
    ),
) -> TaxRule:
    enforce_entitlement(session, tenant_id, "billing_basic")
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    rule = TaxRule.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(rule)
    session.commit()
    session.refresh(rule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=rule.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="tax_rule.created",
        resource_type="tax_rule",
        resource_id=rule.id,
        purpose="billing_tax_configuration",
    )
    return rule


@router.get("/tax-rules", response_model=list[TaxRuleRead])
def list_tax_rules(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.TAX_MANAGE, permissions.TAX_READ, permissions.BILLING_MANAGE
        )
    ),
) -> list[TaxRule]:
    enforce_entitlement(session, tenant_id, "billing_basic")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(TaxRule).where(TaxRule.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(TaxRule.branch_id == branch_id)
    return list(session.exec(statement.order_by(TaxRule.created_at.desc())).all())


@router.patch("/tax-rules/{rule_id}", response_model=TaxRuleRead)
def update_tax_rule(
    rule_id: str,
    payload: TaxRuleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.TAX_MANAGE, permissions.TAX_EDIT, permissions.BILLING_MANAGE
        )
    ),
) -> TaxRule:
    enforce_entitlement(session, tenant_id, "billing_basic")
    rule = session.get(TaxRule, rule_id)
    if not rule or rule.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tax rule not found"
        )
    if payload.branch_id:
        require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id or rule.branch_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=rule.branch_id,
        actor_user_id=current_user.id,
        action="tax_rule.updated",
        resource_type="tax_rule",
        resource_id=rule.id,
        purpose="billing_tax_configuration",
    )
    return rule


@router.post(
    "/discount-offers",
    response_model=DiscountOfferRead,
    status_code=status.HTTP_201_CREATED,
)
def create_discount_offer(
    payload: DiscountOfferCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.DISCOUNTS_MANAGE,
            permissions.DISCOUNTS_CREATE,
            permissions.BILLING_MANAGE,
        )
    ),
) -> DiscountOffer:
    enforce_entitlement(session, tenant_id, "billing_basic")
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    offer = DiscountOffer.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(offer)
    session.commit()
    session.refresh(offer)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=offer.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="discount_offer.created",
        resource_type="discount_offer",
        resource_id=offer.id,
        purpose="discount_offer_configuration",
    )
    return offer


@router.get("/discount-offers", response_model=list[DiscountOfferRead])
def list_discount_offers(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.DISCOUNTS_MANAGE,
            permissions.DISCOUNTS_READ,
            permissions.BILLING_MANAGE,
        )
    ),
) -> list[DiscountOffer]:
    enforce_entitlement(session, tenant_id, "billing_basic")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(DiscountOffer).where(DiscountOffer.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(
            (DiscountOffer.branch_id == branch_id) | (DiscountOffer.branch_id.is_(None))
        )
    return list(session.exec(statement.order_by(DiscountOffer.created_at.desc())).all())


@router.patch("/discount-offers/{offer_id}", response_model=DiscountOfferRead)
def update_discount_offer(
    offer_id: str,
    payload: DiscountOfferUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.DISCOUNTS_MANAGE,
            permissions.DISCOUNTS_EDIT,
            permissions.BILLING_MANAGE,
        )
    ),
) -> DiscountOffer:
    enforce_entitlement(session, tenant_id, "billing_basic")
    offer = session.get(DiscountOffer, offer_id)
    if not offer or offer.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Discount offer not found"
        )
    if payload.branch_id:
        require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id or offer.branch_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(offer, key, value)
    session.add(offer)
    session.commit()
    session.refresh(offer)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=offer.branch_id,
        actor_user_id=current_user.id,
        action="discount_offer.updated",
        resource_type="discount_offer",
        resource_id=offer.id,
        purpose="discount_offer_configuration",
    )
    return offer


@router.post(
    "/discount-approvals",
    response_model=DiscountApprovalRead,
    status_code=status.HTTP_201_CREATED,
)
def request_discount_approval(
    payload: DiscountApprovalCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DiscountApproval:
    enforce_entitlement(session, tenant_id, "billing_basic")
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    approval = DiscountApproval.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(approval)
    session.commit()
    session.refresh(approval)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=approval.branch_id,
        actor_user_id=payload.requested_by_user_id,
        action="discount_approval.requested",
        resource_type="discount_approval",
        resource_id=approval.id,
        purpose="discount_control",
    )
    return approval


@router.post(
    "/discount-approvals/{approval_id}/decision", response_model=DiscountApprovalRead
)
def decide_discount_approval(
    approval_id: str,
    payload: DiscountApprovalDecision,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DiscountApproval:
    approval = session.get(DiscountApproval, approval_id)
    if not approval or approval.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Discount approval not found"
        )
    require_user_branch_access(current_user, approval.branch_id)
    approval.status = payload.status
    approval.approved_by_user_id = payload.approved_by_user_id
    approval.decided_at = datetime.now(timezone.utc)
    session.add(approval)
    session.commit()
    session.refresh(approval)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=approval.branch_id,
        actor_user_id=payload.approved_by_user_id,
        action=f"discount_approval.{payload.status.value}",
        resource_type="discount_approval",
        resource_id=approval.id,
        purpose="discount_control",
    )
    return approval


@router.post(
    "/invoices/from-consultation",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def create_invoice_from_consultation(
    payload: InvoiceCreateFromConsultation,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    enforce_module_enabled(session, tenant_id, "billing_advanced")
    consultation = session.get(Consultation, payload.consultation_id)
    if not consultation or consultation.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid consultation"
        )
    if consultation.status != ConsultationStatus.SIGNED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice can be generated only after consultation is signed",
        )
    require_user_branch_access(current_user, consultation.branch_id)
    existing = session.exec(
        select(Invoice).where(
            Invoice.tenant_id == tenant_id,
            Invoice.consultation_id == consultation.id,
            Invoice.lab_order_id.is_(None),
            Invoice.pharmacy_issue_id.is_(None),
            Invoice.ip_admission_id.is_(None),
            Invoice.physiotherapy_case_id.is_(None),
        )
    ).first()
    if existing:
        return _read_invoice_detail(
            session, refresh_consultation_invoice(session, existing)
        )
    if payload.discount_amount > 0:
        approval = (
            session.get(DiscountApproval, payload.discount_approval_id)
            if payload.discount_approval_id
            else None
        )
        if (
            not approval
            or approval.tenant_id != tenant_id
            or approval.branch_id != consultation.branch_id
            or approval.status != ApprovalStatus.APPROVED
            or approval.requested_amount < payload.discount_amount
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Approved discount approval is required for invoice discount",
            )

    appointment = session.get(Appointment, consultation.appointment_id)
    if not appointment or appointment.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid appointment"
        )

    invoice, _item = create_consultation_invoice(
        session,
        appointment=appointment,
        consultation_id=consultation.id,
        discount_amount=payload.discount_amount,
        discount_approval_id=payload.discount_approval_id,
        discount_offer_id=payload.discount_offer_id,
        tax_rule_id=payload.tax_rule_id,
        created_by_user_id=payload.created_by_user_id,
        treatment_type=consultation.treatment_type,
    )
    invoice = refresh_consultation_invoice(session, invoice)
    _ensure_invoice_submit_ledger(session, invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="invoice.generated",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing",
    )
    patient = session.get(Patient, invoice.patient_id)
    if invoice.balance_amount > 0 and patient:
        for provider in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
            queue_notification_if_allowed(
                session,
                tenant_id=tenant_id,
                branch_id=invoice.branch_id,
                provider=provider,
                event_type=NotificationEventType.PAYMENT_REMINDER,
                recipient=patient.mobile,
                subject="Payment pending",
                message=f"Payment pending for invoice {invoice.invoice_number}: Rs. {invoice.balance_amount}.",
                resource_type="invoice",
                resource_id=invoice.id,
                queued_by_user_id=payload.created_by_user_id,
            )
    return _read_invoice_detail(session, invoice)


def _sync_lab_order_item_catalog_prices(
    session: Session, tenant_id: str, order, items: list
) -> None:
    """Refresh lab order item MRP/selling metadata from the catalog.

    Older lab orders may have copied default/selling price into the MRP field.
    Invoice creation reads from LabOrderItem, so keep the order item price
    metadata aligned with the latest lab catalog before building invoice rows.
    """
    from app.api.v1.lab import (
        _find_lab_test,
        _resolve_lab_price,
    )
    from app.modules.lab.models import LabTestCatalog

    changed = False
    for item in items:
        old_price = int(item.price or 0)
        old_selling = int(item.selling_price or 0)
        old_mrp = int(item.mrp_price or 0)
        old_buying = int(item.buying_price or 0)
        old_supplier_id = item.supplier_id
        old_external_source = item.external_source
        old_external_slug = item.external_slug
        old_external_item_code = item.external_item_code

        test = session.get(LabTestCatalog, item.test_id) if item.test_id else None
        if test is None:
            test = _find_lab_test(session, tenant_id, order.branch_id, item.test_name)
        pricing = _resolve_lab_price(test, item.test_name)
        new_price = int(pricing.get("price") or 0)
        new_mrp = int(pricing.get("mrp_price") or 0)
        new_selling = int(pricing.get("selling_price") or new_price or 0)
        new_buying = int(pricing.get("buying_price") or 0)

        if old_price <= 0 and new_price > 0:
            item.price = new_price
        if new_mrp > 0:
            item.mrp_price = new_mrp
        if new_selling > 0:
            item.selling_price = new_selling
        elif int(item.selling_price or 0) <= 0:
            item.selling_price = int(item.price or 0)
        if new_buying > 0:
            item.buying_price = new_buying
        if pricing.get("supplier_id"):
            item.supplier_id = str(pricing.get("supplier_id") or "")
        if pricing.get("external_source"):
            item.external_source = str(pricing.get("external_source"))
            item.external_slug = str(
                pricing.get("external_slug") or item.external_slug or ""
            )
            item.external_item_code = str(
                pricing.get("external_item_code") or item.external_item_code or ""
            )
        if (
            int(item.price or 0) != old_price
            or int(item.selling_price or 0) != old_selling
            or int(item.mrp_price or 0) != old_mrp
            or int(item.buying_price or 0) != old_buying
            or item.supplier_id != old_supplier_id
            or item.external_source != old_external_source
            or item.external_slug != old_external_slug
            or item.external_item_code != old_external_item_code
        ):
            session.add(item)
            changed = True
    if changed:
        if int(order.amount or 0) <= 0:
            order.amount = sum(int(item.price or 0) for item in items)
            session.add(order)
        session.commit()
        for item in items:
            session.refresh(item)


def _sync_lab_invoice_item_catalog_prices(
    session: Session, invoice: Invoice, lab_items: list
) -> None:
    invoice_items = list(
        session.exec(
            select(InvoiceItem)
            .where(
                InvoiceItem.invoice_id == invoice.id,
                InvoiceItem.item_type == "lab",
            )
            .order_by(InvoiceItem.created_at)
        ).all()
    )
    changed = False
    for invoice_item, lab_item in zip(invoice_items, lab_items, strict=False):
        item_changed = False
        mrp_amount = int(lab_item.mrp_price or 0)
        selling_amount = int(lab_item.selling_price or lab_item.price or 0)
        buying_amount = int(lab_item.buying_price or 0)
        if invoice_item.mrp_amount != mrp_amount:
            invoice_item.mrp_amount = mrp_amount
            item_changed = True
        if invoice_item.selling_amount != selling_amount:
            invoice_item.selling_amount = selling_amount
            item_changed = True
        if invoice_item.buying_amount != buying_amount:
            invoice_item.buying_amount = buying_amount
            item_changed = True
        if invoice_item.supplier_id != lab_item.supplier_id:
            invoice_item.supplier_id = lab_item.supplier_id
            item_changed = True
        if invoice_item.external_source != lab_item.external_source:
            invoice_item.external_source = lab_item.external_source
            item_changed = True
        if invoice_item.external_slug != lab_item.external_slug:
            invoice_item.external_slug = lab_item.external_slug
            item_changed = True
        if invoice_item.external_item_code != lab_item.external_item_code:
            invoice_item.external_item_code = lab_item.external_item_code
            item_changed = True
        if int(invoice_item.unit_amount or 0) <= 0 and int(lab_item.price or 0) > 0:
            invoice_item.unit_amount = int(lab_item.price or 0)
            invoice_item.total_amount = int(lab_item.price or 0)
            item_changed = True
        if item_changed:
            session.add(invoice_item)
            changed = True
    if changed:
        session.commit()
        session.refresh(invoice)


def _sync_pharmacy_invoice_item_catalog_prices(
    session: Session, invoice: Invoice, issue_items: list, medicine_by_id: dict
) -> None:
    invoice_items = list(
        session.exec(
            select(InvoiceItem)
            .where(
                InvoiceItem.invoice_id == invoice.id,
                InvoiceItem.item_type == "pharmacy",
            )
            .order_by(InvoiceItem.created_at)
        ).all()
    )
    changed = False
    for invoice_item, issue_item in zip(invoice_items, issue_items, strict=False):
        item_changed = False
        medicine = medicine_by_id.get(issue_item.medicine_id or "")
        selling_amount = int(
            issue_item.unit_price or getattr(medicine, "default_sale_price", 0) or 0
        )
        mrp_amount = int(getattr(medicine, "mrp_price", 0) or selling_amount)
        buying_amount = int(getattr(medicine, "purchase_price", 0) or 0)
        supplier_id = getattr(medicine, "supplier_id", None)
        if invoice_item.mrp_amount != mrp_amount:
            invoice_item.mrp_amount = mrp_amount
            item_changed = True
        if invoice_item.selling_amount != selling_amount:
            invoice_item.selling_amount = selling_amount
            item_changed = True
        if invoice_item.buying_amount != buying_amount:
            invoice_item.buying_amount = buying_amount
            item_changed = True
        if invoice_item.supplier_id != supplier_id:
            invoice_item.supplier_id = supplier_id
            item_changed = True
        if int(invoice_item.unit_amount or 0) <= 0 and selling_amount > 0:
            invoice_item.unit_amount = selling_amount
            invoice_item.total_amount = int(issue_item.quantity or 1) * selling_amount
            item_changed = True
        if item_changed:
            session.add(invoice_item)
            changed = True
    if changed:
        session.commit()
        session.refresh(invoice)


@router.post(
    "/invoices/from-lab-order",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def create_invoice_from_lab_order(
    payload: InvoiceCreateFromLabOrder,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.LAB_MANAGE,
            permissions.LAB_EDIT,
        )
    ),
) -> InvoiceDetailRead:
    enforce_module_enabled(session, tenant_id, "billing_basic")
    from app.modules.lab.models import LabOrder, LabOrderItem, LabOrderStatus

    order = session.get(LabOrder, payload.lab_order_id)
    if not order or order.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lab order"
        )
    if order.status == LabOrderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancelled lab order cannot be invoiced",
        )
    require_user_branch_access(current_user, order.branch_id)
    items = list(
        session.exec(
            select(LabOrderItem)
            .where(
                LabOrderItem.tenant_id == tenant_id,
                LabOrderItem.lab_order_id == order.id,
            )
            .order_by(LabOrderItem.created_at)
        ).all()
    )
    _sync_lab_order_item_catalog_prices(session, tenant_id, order, items)
    existing = session.exec(
        select(Invoice).where(
            Invoice.tenant_id == tenant_id, Invoice.lab_order_id == order.id
        )
    ).first()
    if existing:
        _sync_lab_invoice_item_catalog_prices(session, existing, items)
        return _read_invoice_detail(
            session, update_invoice_payment_status(session, existing)
        )

    appointment_id = None
    if order.consultation_id:
        consultation = session.get(Consultation, order.consultation_id)
        if consultation and consultation.tenant_id == tenant_id:
            appointment_id = consultation.appointment_id
    amount = int(order.amount or sum(item.price for item in items) or 0)
    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Lab order amount is zero"
        )

    def lab_line_item(item: LabOrderItem) -> dict[str, int | str | None]:
        supplier_id = item.supplier_id
        buying_amount = item.buying_price
        return {
            "item_type": "lab",
            "description": item.test_name,
            "quantity": 1,
            "unit_amount": item.price,
            "total_amount": item.price,
            "mrp_amount": item.mrp_price,
            "selling_amount": item.selling_price or item.price,
            "buying_amount": buying_amount,
            "supplier_id": supplier_id,
            "external_source": item.external_source,
            "external_slug": item.external_slug,
            "external_item_code": (
                item.test_id or item.package_id or item.external_item_code
            ),
        }

    lab_benefit_amounts: dict[str, int] = {}
    for item in items:
        if item.test_id:
            lab_benefit_amounts[item.test_id] = lab_benefit_amounts.get(
                item.test_id, 0
            ) + int(item.price or 0)
    invoice = _create_service_invoice(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        patient_id=order.patient_id,
        appointment_id=appointment_id,
        consultation_id=order.consultation_id,
        lab_order_id=order.id,
        item_type="lab",
        description=f"Lab order {order.id}: {order.tests}",
        amount=amount,
        service_scope="lab",
        tax_rule_id=payload.tax_rule_id,
        discount_offer_id=payload.discount_offer_id,
        benefit_item_ids=[item.test_id for item in items if item.test_id],
        benefit_item_amounts=lab_benefit_amounts,
        line_items=[lab_line_item(item) for item in items] or None,
        created_by_user_id=payload.created_by_user_id,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="lab_invoice.generated",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="lab_billing",
    )
    return _read_invoice_detail(session, invoice)


@router.post(
    "/invoices/from-pharmacy-issue",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def create_invoice_from_pharmacy_issue(
    payload: InvoiceCreateFromPharmacyIssue,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    enforce_module_enabled(session, tenant_id, "billing_basic")
    from app.modules.pharmacy.models import (
        MedicineCatalog,
        PharmacyIssue,
        PharmacyIssueItem,
        PharmacyIssueStatus,
    )

    issue = session.get(PharmacyIssue, payload.pharmacy_issue_id)
    if not issue or issue.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pharmacy issue"
        )
    if issue.status == PharmacyIssueStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancelled pharmacy issue cannot be invoiced",
        )
    require_user_branch_access(current_user, issue.branch_id)
    items = list(
        session.exec(
            select(PharmacyIssueItem)
            .where(
                PharmacyIssueItem.tenant_id == tenant_id,
                PharmacyIssueItem.pharmacy_issue_id == issue.id,
            )
            .order_by(PharmacyIssueItem.created_at)
        ).all()
    )
    medicine_by_id = {
        medicine_id: medicine
        for medicine_id in {item.medicine_id for item in items if item.medicine_id}
        if (medicine := session.get(MedicineCatalog, medicine_id)) is not None
    }
    existing = session.exec(
        select(Invoice).where(
            Invoice.tenant_id == tenant_id, Invoice.pharmacy_issue_id == issue.id
        )
    ).first()
    if existing:
        issue.billing_invoice_id = existing.id
        session.add(issue)
        session.commit()
        _sync_pharmacy_invoice_item_catalog_prices(
            session, existing, items, medicine_by_id
        )
        return _read_invoice_detail(
            session, update_invoice_payment_status(session, existing)
        )

    appointment_id = None
    if issue.consultation_id:
        consultation = session.get(Consultation, issue.consultation_id)
        if consultation and consultation.tenant_id == tenant_id:
            appointment_id = consultation.appointment_id
    amount = int(
        issue.amount or sum(item.quantity * item.unit_price for item in items) or 0
    )
    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pharmacy issue amount is zero",
        )
    pharmacy_benefit_amounts: dict[str, int] = {}
    for item in items:
        if item.medicine_id:
            pharmacy_benefit_amounts[item.medicine_id] = pharmacy_benefit_amounts.get(
                item.medicine_id, 0
            ) + int(item.quantity * item.unit_price)

    def pharmacy_line_item(item: PharmacyIssueItem) -> dict[str, int | str | None]:
        medicine = medicine_by_id.get(item.medicine_id or "")
        selling_amount = int(
            item.unit_price or (medicine.default_sale_price if medicine else 0) or 0
        )
        mrp_amount = int((medicine.mrp_price if medicine else 0) or selling_amount)
        buying_amount = int((medicine.purchase_price if medicine else 0) or 0)
        return {
            "item_type": "pharmacy",
            "description": item.medicine_name,
            "quantity": item.quantity,
            "unit_amount": selling_amount,
            "total_amount": item.quantity * selling_amount,
            "mrp_amount": mrp_amount,
            "selling_amount": selling_amount,
            "buying_amount": buying_amount,
            "supplier_id": medicine.supplier_id if medicine else None,
        }

    invoice = _create_service_invoice(
        session,
        tenant_id=tenant_id,
        branch_id=issue.branch_id,
        patient_id=issue.patient_id,
        appointment_id=appointment_id,
        consultation_id=issue.consultation_id,
        pharmacy_issue_id=issue.id,
        item_type="pharmacy",
        description=f"Pharmacy issue {issue.id}: {issue.medicine_text}",
        amount=amount,
        service_scope="pharmacy",
        tax_rule_id=payload.tax_rule_id,
        discount_offer_id=payload.discount_offer_id,
        benefit_item_ids=[item.medicine_id for item in items if item.medicine_id],
        benefit_item_amounts=pharmacy_benefit_amounts,
        line_items=[pharmacy_line_item(item) for item in items] or None,
        created_by_user_id=payload.created_by_user_id,
    )
    issue.billing_invoice_id = invoice.id
    session.add(issue)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="pharmacy_invoice.generated",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="pharmacy_billing",
    )
    return _read_invoice_detail(session, invoice)


@router.get("/invoices", response_model=list[InvoiceRead])
def list_invoices(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    patient_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.INVOICES_READ,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
        )
    ),
) -> list[InvoiceRead]:
    enforce_entitlement(session, tenant_id, "billing_basic")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(Invoice).where(Invoice.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(Invoice.branch_id == branch_id)
    if patient_id:
        statement = statement.where(Invoice.patient_id == patient_id)
    invoices = list(session.exec(statement.order_by(Invoice.created_at.desc())).all())
    return [
        _invoice_read(session, _normalize_invoice_status(session, invoice))
        for invoice in invoices
    ]


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetailRead)
def get_invoice(
    invoice_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    return _read_invoice_detail(session, invoice)


@router.patch("/invoices/{invoice_id}/amount", response_model=InvoiceDetailRead)
def update_invoice_amount(
    invoice_id: str,
    payload: InvoiceAmountUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    """Edit the consultation price on the bill for non-OP visits before payment.

    OP visits keep their fixed fee-rule price. Lab/pharmacy/IP/etc. invoices are
    priced from their own line items and are not editable here.
    """
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
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
        session.get(Appointment, invoice.appointment_id)
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
    # Keep the already-consumed membership benefit; re-evaluate the offer for the
    # new subtotal so percentage offers stay correct.
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
        session.get(DoctorFeeRule, invoice.fee_rule_id) if invoice.fee_rule_id else None
    )
    if fee_rule and new_subtotal > 0:
        split = calculate_fee_split(fee_rule, new_subtotal)
        share_basis = total if fee_rule.share_tax_with_doctor else taxable
        doctor_share = round(split.doctor_share_amount * share_basis / new_subtotal)
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
    item = session.exec(
        select(InvoiceItem)
        .where(InvoiceItem.tenant_id == tenant_id, InvoiceItem.invoice_id == invoice.id)
        .order_by(InvoiceItem.created_at)
    ).first()
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
    )
    return _read_invoice_detail(session, invoice)


@router.patch(
    "/invoices/{invoice_id}/items/{item_id}/supplier", response_model=InvoiceDetailRead
)
def update_invoice_item_supplier(
    invoice_id: str,
    item_id: str,
    payload: InvoiceItemSupplierUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    if not invoice.lab_order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supplier can be set only for lab invoices",
        )
    require_user_branch_access(current_user, invoice.branch_id)
    item = session.get(InvoiceItem, item_id)
    if not item or item.tenant_id != tenant_id or item.invoice_id != invoice.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice item not found"
        )
    options = _external_supplier_options(session, item)
    if payload.supplier_id:
        selected = next(
            (
                supplier
                for supplier in options
                if supplier["supplier"] == payload.supplier_id
            ),
            None,
        )
        if not selected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid supplier"
            )
        item.buying_amount = int(selected["buying_price"] or 0)
    else:
        item.buying_amount = 0
    item.supplier_id = payload.supplier_id
    session.add(item)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=current_user.id,
        action="invoice_item.supplier_updated",
        resource_type="invoice_item",
        resource_id=item.id,
        purpose="billing",
    )
    return _read_invoice_detail(session, invoice)


@router.get(
    "/invoices/{invoice_id}/items/{item_id}/supplier-options",
    response_model=list[InvoiceItemSupplierOptionRead],
)
def list_invoice_item_supplier_options(
    invoice_id: str,
    item_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> list[InvoiceItemSupplierOptionRead]:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    if not invoice.lab_order_id:
        return []
    require_user_branch_access(current_user, invoice.branch_id)
    item = session.get(InvoiceItem, item_id)
    if not item or item.tenant_id != tenant_id or item.invoice_id != invoice.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice item not found"
        )
    return [
        InvoiceItemSupplierOptionRead(**supplier)
        for supplier in _external_supplier_options(session, item)
    ]


@router.post(
    "/invoices/{invoice_id}/membership-benefit/apply", response_model=InvoiceDetailRead
)
def apply_invoice_membership_benefit(
    invoice_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    invoice = _apply_invoice_membership_benefit(session, invoice)
    _ensure_invoice_membership_benefit_ledger(
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
    )
    return _read_invoice_detail(session, invoice)


@router.get("/invoices/{invoice_id}/receipt.pdf")
def invoice_receipt_pdf(
    invoice_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> Response:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    tenant = session.get(Tenant, tenant_id)
    branch = session.get(Branch, invoice.branch_id)
    patient = session.get(Patient, invoice.patient_id)
    items = list(
        session.exec(
            select(InvoiceItem)
            .where(
                InvoiceItem.tenant_id == invoice.tenant_id,
                InvoiceItem.invoice_id == invoice.id,
            )
            .order_by(InvoiceItem.created_at)
        ).all()
    )
    payments = list(
        session.exec(
            select(Payment)
            .where(
                Payment.tenant_id == invoice.tenant_id, Payment.invoice_id == invoice.id
            )
            .order_by(Payment.collected_at)
        ).all()
    )
    logo_url, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="invoice",
        key=SettingKey.INVOICE_LOGO_URL,
    )
    # Bank/account details are tenant-wide (managed identically by super admin
    # and tenant admin screens), so resolve at tenant scope only. Passing
    # branch_id here let a stale branch-scoped row permanently shadow tenant
    # edits, so receipts kept printing old account details.
    bank_details, _bank_scope, _bank_scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="accounts",
        key=SettingKey.ACCOUNTS_BANK_DETAILS,
    )
    pdf = _build_receipt_pdf(
        tenant=tenant,
        branch=branch,
        patient=patient,
        invoice=invoice,
        items=items,
        payments=payments,
        logo_url=str(logo_url or getattr(tenant, "logo_url", "") or ""),
        bank_details=bank_details if isinstance(bank_details, dict) else {},
    )
    patient_name = (
        getattr(patient, "full_name", None)
        or getattr(patient, "name", None)
        or "Patient"
    )
    receipt_filename = (
        "-".join(
            part
            for part in (
                re.sub(r"[^a-zA-Z0-9]+", "-", str(patient_name)).strip("-"),
                re.sub(r"[^a-zA-Z0-9]+", "-", str(invoice.invoice_number)).strip("-"),
            )
            if part
        )
        or "receipt"
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{receipt_filename}.pdf"'},
    )


@router.post(
    "/invoices/{invoice_id}/credit-notes",
    response_model=CreditNoteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_credit_note(
    invoice_id: str,
    payload: CreditNoteCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PAYMENTS_MANAGE)),
) -> CreditNote:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot issue credit note for {invoice.status.value} invoice",
        )
    if payload.amount > invoice.total_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Credit note amount cannot exceed invoice total",
        )
    credit = CreditNote(
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        credit_note_number=next_credit_note_number(session, tenant_id),
        amount=payload.amount,
        reason=payload.reason,
        created_by_user_id=payload.created_by_user_id,
    )
    session.add(credit)
    session.commit()
    session.refresh(credit)
    invoice = update_invoice_payment_status(session, invoice)
    _record_billing_ledger(
        session,
        invoice,
        entry_type="credit_note_issued",
        description="Credit note issued",
        debit_amount=credit.amount,
        balance_amount_delta=-credit.amount,
        reason=payload.reason,
        actor_user_id=payload.created_by_user_id,
        related_credit_note_id=credit.id,
    )
    _sync_invoice_source_after_reversal(session, invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="credit_note.issued",
        resource_type="credit_note",
        resource_id=credit.id,
        purpose="credit_note",
    )
    return credit


@router.post(
    "/invoices/{invoice_id}/payments",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def record_payment(
    invoice_id: str,
    payload: PaymentCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PAYMENTS_MANAGE)),
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot record payment for {invoice.status.value} invoice",
        )
    if payload.amount > invoice.balance_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount cannot exceed invoice balance",
        )

    payment = Payment(
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        method=payload.method,
        amount=payload.amount,
        reference_number=payload.reference_number,
        collected_by_user_id=payload.collected_by_user_id,
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    invoice = update_invoice_payment_status(session, invoice)
    _record_billing_ledger(
        session,
        invoice,
        entry_type="payment_recorded",
        description="Payment recorded",
        credit_amount=payment.amount,
        paid_amount_delta=payment.amount,
        balance_amount_delta=-payment.amount,
        actor_user_id=payload.collected_by_user_id or current_user.id,
        related_payment_id=payment.id,
    )
    _sync_physiotherapy_case_status(session, invoice)
    _sync_home_care_booking_status(session, invoice)
    _sync_patient_membership_payment(session, invoice)
    patient = session.get(Patient, invoice.patient_id)
    if invoice.balance_amount > 0 and patient:
        for provider in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
            queue_notification_if_allowed(
                session,
                tenant_id=tenant_id,
                branch_id=invoice.branch_id,
                provider=provider,
                event_type=NotificationEventType.PAYMENT_REMINDER,
                recipient=patient.mobile,
                subject="Payment pending",
                message=f"Payment pending for invoice {invoice.invoice_number}: Rs. {invoice.balance_amount}.",
                resource_type="invoice",
                resource_id=invoice.id,
                queued_by_user_id=payload.collected_by_user_id,
            )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.collected_by_user_id,
        action="payment.recorded",
        resource_type="payment",
        resource_id=payment.id,
        purpose="payment_collection",
    )
    return _read_invoice_detail(session, invoice)


def _execute_billing_adjustment(
    session: Session,
    *,
    invoice: Invoice,
    request_type: BillingAdjustmentType,
    amount: int,
    reason: str,
    actor_user_id: str | None,
    payment_method: PaymentMethod | None = None,
    payment_reference: str | None = None,
) -> Invoice:
    old_paid = int(invoice.paid_amount or 0)
    old_balance = int(invoice.balance_amount or 0)
    old_total = int(invoice.total_amount or 0)
    if request_type == BillingAdjustmentType.CANCEL:
        if old_paid > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Paid invoices must be refunded before cancellation",
            )
        invoice.status = InvoiceStatus.CANCELLED
        invoice.paid_amount = 0
        invoice.balance_amount = 0
        invoice.updated_at = datetime.now(timezone.utc)
        session.add(invoice)
        session.commit()
        session.refresh(invoice)
        _record_billing_ledger(
            session,
            invoice,
            entry_type="invoice_cancelled",
            description="Invoice cancelled and financial impact reversed",
            credit_amount=old_total,
            invoice_total_delta=-old_total,
            paid_amount_delta=-old_paid,
            balance_amount_delta=-old_balance,
            reason=reason,
            actor_user_id=actor_user_id,
        )
        _sync_invoice_source_after_reversal(session, invoice)
        return invoice

    refund_amount = _validate_adjustment_amount(invoice, request_type, amount)
    changed_payments = _apply_refund_to_payments(
        session, invoice, refund_amount, reason
    )
    credit = CreditNote(
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        credit_note_number=next_credit_note_number(session, invoice.tenant_id),
        amount=refund_amount,
        reason=reason,
        created_by_user_id=actor_user_id,
    )
    session.add(credit)
    session.commit()
    session.refresh(credit)
    invoice = update_invoice_payment_status(session, invoice)
    _record_billing_ledger(
        session,
        invoice,
        entry_type="payment_refunded"
        if request_type == BillingAdjustmentType.FULL_REFUND
        else "payment_partially_refunded",
        description="Payment refunded"
        if request_type == BillingAdjustmentType.FULL_REFUND
        else "Payment partially refunded",
        debit_amount=refund_amount,
        paid_amount_delta=-refund_amount,
        balance_amount_delta=0,
        reason=reason,
        actor_user_id=actor_user_id,
        related_payment_id=changed_payments[0].id if changed_payments else None,
        related_credit_note_id=credit.id,
    )
    if payment_method or payment_reference:
        _record_billing_ledger(
            session,
            invoice,
            entry_type="refund_disbursed",
            description="Refund disbursed",
            debit_amount=refund_amount,
            reason=payment_reference or reason,
            actor_user_id=actor_user_id,
            related_credit_note_id=credit.id,
        )
    _sync_invoice_source_after_reversal(session, invoice)
    record_audit_event(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=actor_user_id,
        action="payment.refunded"
        if request_type == BillingAdjustmentType.FULL_REFUND
        else "payment.partially_refunded",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="refund",
        metadata_json=json.dumps(
            {
                "amount": refund_amount,
                "reason": reason,
                "payment_method": payment_method.value if payment_method else None,
                "payment_reference": payment_reference,
            }
        ),
    )
    return invoice


@router.post(
    "/invoices/{invoice_id}/adjustment-requests",
    response_model=BillingAdjustmentRequestRead,
    status_code=status.HTTP_201_CREATED,
)
def create_billing_adjustment_request(
    invoice_id: str,
    payload: BillingAdjustmentRequestCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.INVOICES_READ,
            permissions.INVOICES_EDIT,
            permissions.PAYMENTS_MANAGE,
        )
    ),
) -> BillingAdjustmentRequestRead:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    _ensure_invoice_can_request_adjustment(session, invoice, payload.request_type)
    amount = _validate_adjustment_amount(invoice, payload.request_type, payload.amount)
    row = BillingAdjustmentRequest(
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        request_type=payload.request_type,
        amount=amount,
        reason=payload.reason,
        requested_by_user_id=payload.requested_by_user_id or current_user.id,
        payment_method=payload.payment_method,
        payment_reference=payload.payment_reference,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _read_adjustment_request(session, row)


@router.post(
    "/adjustment-requests/{request_id}/approve",
    response_model=BillingAdjustmentRequestRead,
)
def approve_billing_adjustment_request(
    request_id: str,
    payload: BillingAdjustmentDecision,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> BillingAdjustmentRequestRead:
    row = session.get(BillingAdjustmentRequest, request_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Request not found"
        )
    require_user_branch_access(current_user, row.branch_id)
    if row.status != BillingAdjustmentStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Request already decided"
        )
    row.status = BillingAdjustmentStatus.APPROVED
    row.approved_by_user_id = payload.actor_user_id or current_user.id
    row.decision_reason = payload.reason
    row.decided_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _read_adjustment_request(session, row)


@router.post(
    "/adjustment-requests/{request_id}/reject",
    response_model=BillingAdjustmentRequestRead,
)
def reject_billing_adjustment_request(
    request_id: str,
    payload: BillingAdjustmentDecision,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> BillingAdjustmentRequestRead:
    row = session.get(BillingAdjustmentRequest, request_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Request not found"
        )
    require_user_branch_access(current_user, row.branch_id)
    if row.status != BillingAdjustmentStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Request already decided"
        )
    row.status = BillingAdjustmentStatus.REJECTED
    row.rejected_by_user_id = payload.actor_user_id or current_user.id
    row.decision_reason = payload.reason
    row.decided_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _read_adjustment_request(session, row)


@router.post(
    "/adjustment-requests/{request_id}/execute",
    response_model=InvoiceDetailRead,
)
def execute_billing_adjustment_request(
    request_id: str,
    payload: BillingAdjustmentDecision,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    row = session.get(BillingAdjustmentRequest, request_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Request not found"
        )
    require_user_branch_access(current_user, row.branch_id)
    if row.status != BillingAdjustmentStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approve request before execution",
        )
    invoice = session.get(Invoice, row.invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        row.status = BillingAdjustmentStatus.REJECTED
        row.rejected_by_user_id = payload.actor_user_id or current_user.id
        row.decision_reason = "Invoice is already closed"
        row.decided_at = datetime.now(timezone.utc)
        session.add(row)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice is already closed for cancellation/refund",
        )
    _validate_adjustment_amount(invoice, row.request_type, row.amount)
    invoice = _execute_billing_adjustment(
        session,
        invoice=invoice,
        request_type=row.request_type,
        amount=row.amount,
        reason=payload.reason or row.reason,
        actor_user_id=payload.actor_user_id or current_user.id,
        payment_method=row.payment_method,
        payment_reference=row.payment_reference,
    )
    row.status = BillingAdjustmentStatus.EXECUTED
    row.executed_by_user_id = payload.actor_user_id or current_user.id
    row.executed_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    return _read_invoice_detail(session, invoice)


@router.post("/payments/{payment_id}/refund", response_model=InvoiceDetailRead)
def refund_payment(
    payment_id: str,
    payload: RefundRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PAYMENTS_MANAGE)),
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    payment = session.get(Payment, payment_id)
    if not payment or payment.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found"
        )
    if payment.status == PaymentStatus.REFUNDED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Payment already refunded"
        )
    invoice = session.get(Invoice, payment.invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    available = max(int(payment.amount or 0) - int(payment.refunded_amount or 0), 0)
    amount = int(payload.amount or available)
    if amount > available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refund amount exceeds selected payment balance",
        )
    invoice = _execute_billing_adjustment(
        session,
        invoice=invoice,
        request_type=BillingAdjustmentType.FULL_REFUND
        if amount >= refundable_paid_total(session, invoice)
        else BillingAdjustmentType.PARTIAL_REFUND,
        amount=amount,
        reason=payload.reason,
        actor_user_id=payload.actor_user_id or current_user.id,
        payment_method=payload.payment_method,
        payment_reference=payload.payment_reference,
    )
    return _read_invoice_detail(session, invoice)


@router.post("/invoices/{invoice_id}/cancel", response_model=InvoiceDetailRead)
def cancel_invoice(
    invoice_id: str,
    payload: CancelInvoiceRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    _require_direct_invoice_reversal_admin(session, current_user)
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Invoice already cancelled"
        )
    if int(invoice.paid_amount or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Paid invoices cannot be cancelled; refund payments first",
        )
    invoice = _execute_billing_adjustment(
        session,
        invoice=invoice,
        request_type=BillingAdjustmentType.CANCEL,
        amount=0,
        reason=payload.reason,
        actor_user_id=payload.actor_user_id or current_user.id,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.actor_user_id or current_user.id,
        action="invoice.cancelled",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing_cancellation",
        metadata_json=json.dumps(
            {
                "reason": payload.reason,
            }
        ),
    )
    return _read_invoice_detail(session, invoice)


@router.post("/invoices/{invoice_id}/amend", response_model=InvoiceDetailRead)
def amend_invoice(
    invoice_id: str,
    payload: AmendInvoiceRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    _require_direct_invoice_reversal_admin(session, current_user)
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    if invoice.status != InvoiceStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only cancelled invoices can be amended",
        )
    restored_balance = int(invoice.total_amount or 0)
    invoice.status = (
        InvoiceStatus.ISSUED if restored_balance > 0 else InvoiceStatus.PAID
    )
    invoice.paid_amount = 0
    invoice.balance_amount = restored_balance
    invoice.updated_at = datetime.now(timezone.utc)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    _record_billing_ledger(
        session,
        invoice,
        entry_type="invoice_amended",
        description="Cancelled invoice amended and reopened",
        debit_amount=restored_balance,
        invoice_total_delta=restored_balance,
        balance_amount_delta=restored_balance,
        reason=payload.reason,
        actor_user_id=payload.actor_user_id or current_user.id,
    )
    _sync_physiotherapy_case_status(session, invoice)
    _sync_home_care_booking_status(session, invoice)
    _sync_patient_membership_payment(session, invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.actor_user_id or current_user.id,
        action="invoice.amended",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing_amendment",
        metadata_json=json.dumps({"reason": payload.reason}),
    )
    return _read_invoice_detail(session, invoice)


@router.get("/doctor-settlements/summary", response_model=DoctorSettlementSummary)
def doctor_settlement_summary(
    tenant_id: str = Depends(require_tenant_id),
    practitioner_id: str | None = None,
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.SETTLEMENTS_READ)),
) -> DoctorSettlementSummary:
    enforce_module_enabled(session, tenant_id, "billing_advanced")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = (
        select(Invoice, Appointment)
        .join(Appointment, Invoice.appointment_id == Appointment.id)
        .where(
            Invoice.tenant_id == tenant_id,
            Invoice.status.notin_([InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]),
        )
    )
    if branch_id:
        statement = statement.where(Invoice.branch_id == branch_id)
    if practitioner_id:
        statement = statement.where(Appointment.practitioner_id == practitioner_id)
    rows = list(session.exec(statement).all())
    invoice_count = len(rows)
    total_invoice_amount = sum(invoice.total_amount for invoice, _appointment in rows)
    total_paid_amount = sum(invoice.paid_amount for invoice, _appointment in rows)
    total_doctor_share = sum(
        invoice.doctor_share_amount for invoice, _appointment in rows
    )
    doctor_share_paid_basis = 0
    for invoice, _appointment in rows:
        if invoice.total_amount:
            doctor_share_paid_basis += round(
                invoice.doctor_share_amount * invoice.paid_amount / invoice.total_amount
            )
    settlement_statement = select(DoctorSettlement).where(
        DoctorSettlement.tenant_id == tenant_id,
        DoctorSettlement.status == SettlementStatus.FINALIZED,
    )
    if branch_id:
        settlement_statement = settlement_statement.where(
            DoctorSettlement.branch_id == branch_id
        )
    else:
        settlement_statement = settlement_statement.where(
            DoctorSettlement.branch_id.is_(None)
        )
    if practitioner_id:
        settlement_statement = settlement_statement.where(
            DoctorSettlement.practitioner_id == practitioner_id
        )
    else:
        settlement_statement = settlement_statement.where(
            DoctorSettlement.practitioner_id.is_(None)
        )
    settlements = list(session.exec(settlement_statement).all())
    finalized_amount = sum(row.settlement_amount for row in settlements)
    payable_amount = max(doctor_share_paid_basis - finalized_amount, 0)
    latest_finalized_at = max((row.finalized_at for row in settlements), default=None)
    return DoctorSettlementSummary(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        invoice_count=invoice_count,
        total_invoice_amount=total_invoice_amount,
        total_paid_amount=total_paid_amount,
        total_doctor_share=total_doctor_share,
        doctor_share_paid_basis=doctor_share_paid_basis,
        finalized_settlement_amount=finalized_amount,
        payable_settlement_amount=payable_amount,
        pending_doctor_share=max(total_doctor_share - doctor_share_paid_basis, 0),
        can_finalize=payable_amount > 0,
        latest_finalized_at=latest_finalized_at,
    )


@router.post("/doctor-settlements/finalize", response_model=DoctorSettlementRead)
def finalize_doctor_settlement(
    payload: DoctorSettlementFinalize,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DoctorSettlementRead:
    summary = doctor_settlement_summary(
        tenant_id=tenant_id,
        practitioner_id=payload.practitioner_id,
        branch_id=payload.branch_id,
        session=session,
        current_user=current_user,
    )
    if summary.payable_settlement_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Doctor settlement is already finalized.",
        )
    settlement = DoctorSettlement(
        tenant_id=tenant_id,
        branch_id=summary.branch_id,
        practitioner_id=payload.practitioner_id,
        invoice_count=summary.invoice_count,
        total_invoice_amount=summary.total_invoice_amount,
        total_paid_amount=summary.total_paid_amount,
        total_doctor_share=summary.total_doctor_share,
        settlement_amount=summary.payable_settlement_amount,
        finalized_by_user_id=payload.finalized_by_user_id,
    )
    session.add(settlement)
    session.commit()
    session.refresh(settlement)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        actor_user_id=payload.finalized_by_user_id,
        action="doctor_settlement.finalized",
        resource_type="doctor_settlement",
        resource_id=settlement.id,
        purpose="doctor_settlement",
    )
    updated_summary = doctor_settlement_summary(
        tenant_id=tenant_id,
        practitioner_id=payload.practitioner_id,
        branch_id=summary.branch_id,
        session=session,
        current_user=current_user,
    )
    return DoctorSettlementRead(
        **updated_summary.model_dump(exclude={"branch_id"}),
        id=settlement.id,
        branch_id=settlement.branch_id,
        settlement_amount=settlement.settlement_amount,
        status=settlement.status,
        finalized_by_user_id=settlement.finalized_by_user_id,
        finalized_at=settlement.finalized_at,
    )


@router.get("/reports/due-collection", response_model=DueCollectionReport)
def due_collection_report(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DueCollectionReport:
    enforce_entitlement(session, tenant_id, "billing_basic")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(Invoice).where(
        Invoice.tenant_id == tenant_id,
        Invoice.balance_amount > 0,
        Invoice.status.notin_([InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]),
    )
    if branch_id:
        statement = statement.where(Invoice.branch_id == branch_id)
    invoices = list(session.exec(statement.order_by(Invoice.created_at)).all())
    return DueCollectionReport(
        tenant_id=tenant_id,
        branch_id=branch_id,
        invoice_count=len(invoices),
        total_due_amount=sum(invoice.balance_amount for invoice in invoices),
        rows=[
            {
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "patient_id": invoice.patient_id,
                "total_amount": invoice.total_amount,
                "paid_amount": invoice.paid_amount,
                "balance_amount": invoice.balance_amount,
                "created_at": invoice.created_at.isoformat(),
            }
            for invoice in invoices
        ],
    )


@router.get("/reports/revenue", response_model=RevenueReport)
def revenue_report(
    tenant_id: str = Depends(require_tenant_id),
    group_by: str = Query(
        default="branch", pattern="^(branch|doctor|department|visit_purpose)$"
    ),
    branch_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> RevenueReport:
    enforce_module_enabled(session, tenant_id, "billing_advanced")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = (
        select(Invoice, Appointment)
        .outerjoin(Appointment, Invoice.appointment_id == Appointment.id)
        .where(
            Invoice.tenant_id == tenant_id,
            Invoice.status.notin_([InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]),
        )
    )
    if branch_id:
        statement = statement.where(Invoice.branch_id == branch_id)
    if from_date:
        statement = statement.where(func.date(Invoice.created_at) >= from_date)
    if to_date:
        statement = statement.where(func.date(Invoice.created_at) <= to_date)
    rows = list(session.exec(statement).all())
    grouped: dict[str, dict] = {}
    for invoice, appointment in rows:
        if group_by == "branch":
            key = invoice.branch_id
        elif group_by == "doctor":
            key = appointment.practitioner_id if appointment else "non_appointment"
        elif group_by == "department":
            key = appointment.department_id if appointment else "non_appointment"
        else:
            key = (
                appointment.visit_purpose or appointment.appointment_type.value
                if appointment
                else _invoice_membership_service(invoice) or "direct"
            )
        key = key or "unassigned"
        bucket = grouped.setdefault(
            key,
            {
                "key": key,
                "invoice_count": 0,
                "invoice_amount": 0,
                "paid_amount": 0,
                "tax_amount": 0,
                "doctor_share": 0,
            },
        )
        net_invoice_amount = int(invoice.paid_amount or 0) + int(
            invoice.balance_amount or 0
        )
        original_total = int(invoice.total_amount or 0)
        net_ratio = (
            net_invoice_amount / original_total
            if original_total and net_invoice_amount < original_total
            else 1
        )
        bucket["invoice_count"] += 1
        bucket["invoice_amount"] += net_invoice_amount
        bucket["paid_amount"] += invoice.paid_amount
        bucket["tax_amount"] += round(int(invoice.tax_amount or 0) * net_ratio)
        bucket["doctor_share"] += round(
            int(invoice.doctor_share_amount or 0) * net_ratio
        )
    report_rows = list(grouped.values())
    return RevenueReport(
        tenant_id=tenant_id,
        group_by=group_by,
        rows=report_rows,
        total_invoice_amount=sum(row["invoice_amount"] for row in report_rows),
        total_paid_amount=sum(row["paid_amount"] for row in report_rows),
        total_tax_amount=sum(row["tax_amount"] for row in report_rows),
        total_doctor_share=sum(row["doctor_share"] for row in report_rows),
    )
