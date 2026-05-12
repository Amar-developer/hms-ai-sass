from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.access_control import enforce_entitlement, require_branch_in_tenant, require_user_branch_access, scoped_branch_id
from app.core.auth import require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.appointments.models import Appointment
from app.modules.audit.service import record_audit_event

from app.modules.billing.models import (
    DoctorFeeRule,
    CreditNote,
    DiscountApproval,
    ApprovalStatus,
    DoctorSettlement,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    Payment,
    PaymentStatus,
    TaxRule,
)
from app.modules.billing.schemas import (
    CancelInvoiceRequest,
    CreditNoteCreate,
    CreditNoteRead,
    DiscountApprovalCreate,
    DiscountApprovalDecision,
    DiscountApprovalRead,
    DoctorFeeRuleCreate,
    DoctorFeeRuleRead,
    DoctorSettlementFinalize,
    DoctorSettlementRead,
    DoctorSettlementSummary,
    DueCollectionReport,
    InvoiceCreateFromConsultation,
    InvoiceDetailRead,
    InvoiceItemRead,
    InvoiceRead,
    PaymentCreate,
    PaymentRead,
    RevenueReport,
    RefundRequest,
    TaxRuleCreate,
    TaxRuleRead,
)
from app.modules.billing.service import (
    create_consultation_invoice,
    next_credit_note_number,
    refresh_consultation_invoice,
    refundable_paid_total,
    update_invoice_payment_status,
)
from app.modules.consultations.models import Consultation, ConsultationStatus
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import queue_notification_if_allowed
from app.modules.patients.models import Patient
from app.modules.subscriptions.service import enforce_module_enabled

router = APIRouter(prefix="/billing")


def _sync_physiotherapy_case_status(session: Session, invoice: Invoice) -> None:
    if not invoice.physiotherapy_case_id:
        return
    from app.modules.physiotherapy.models import PhysiotherapyCase
    from app.modules.tenants.models import now_utc

    case = session.get(PhysiotherapyCase, invoice.physiotherapy_case_id)
    if not case or case.tenant_id != invoice.tenant_id:
        return
    target_status = "paid" if invoice.balance_amount <= 0 and invoice.total_amount > 0 else "completed"
    if case.status == target_status:
        return
    case.status = target_status
    case.updated_at = now_utc()
    session.add(case)
    session.commit()


def _simple_pdf(lines: list[str]) -> bytes:
    text = "\\n".join(lines).replace("(", "[").replace(")", "]")
    stream = f"BT /F1 12 Tf 50 760 Td ({text}) Tj ET"
    return (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >> endobj\n"
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        + f"5 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream endobj\n".encode()
        + b"xref\n0 6\n0000000000 65535 f \ntrailer << /Root 1 0 R /Size 6 >>\nstartxref\n0\n%%EOF"
    )


def _read_invoice_detail(session: Session, invoice: Invoice) -> InvoiceDetailRead:
    items = list(
        session.exec(
            select(InvoiceItem)
            .where(InvoiceItem.tenant_id == invoice.tenant_id, InvoiceItem.invoice_id == invoice.id)
            .order_by(InvoiceItem.created_at)
        ).all()
    )
    payments = list(
        session.exec(
            select(Payment)
            .where(Payment.tenant_id == invoice.tenant_id, Payment.invoice_id == invoice.id)
            .order_by(Payment.collected_at)
        ).all()
    )
    return InvoiceDetailRead(
        invoice=InvoiceRead.model_validate(invoice, from_attributes=True),
        items=[InvoiceItemRead.model_validate(item, from_attributes=True) for item in items],
        payments=[PaymentRead.model_validate(payment, from_attributes=True) for payment in payments],
    )


@router.post(
    "/doctor-fee-rules",
    response_model=DoctorFeeRuleRead,
    status_code=status.HTTP_201_CREATED,
)
def create_doctor_fee_rule(
    payload: DoctorFeeRuleCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DoctorFeeRule:
    enforce_entitlement(session, tenant_id, "billing_basic")
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    if payload.share_type.value == "percentage" and payload.doctor_share_percentage is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doctor_share_percentage is required for percentage share",
        )
    if payload.share_type.value == "fixed" and payload.doctor_fixed_amount is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doctor_fixed_amount is required for fixed share",
        )

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
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> list[DoctorFeeRule]:
    enforce_entitlement(session, tenant_id, "billing_basic")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(DoctorFeeRule).where(DoctorFeeRule.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(DoctorFeeRule.branch_id == branch_id)
    return list(
        session.exec(
            statement.order_by(DoctorFeeRule.created_at)
        ).all()
    )


@router.post("/tax-rules", response_model=TaxRuleRead, status_code=status.HTTP_201_CREATED)
def create_tax_rule(
    payload: TaxRuleCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
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
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> list[TaxRule]:
    enforce_entitlement(session, tenant_id, "billing_basic")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(TaxRule).where(TaxRule.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(TaxRule.branch_id == branch_id)
    return list(session.exec(statement.order_by(TaxRule.created_at.desc())).all())


@router.post("/discount-approvals", response_model=DiscountApprovalRead, status_code=status.HTTP_201_CREATED)
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


@router.post("/discount-approvals/{approval_id}/decision", response_model=DiscountApprovalRead)
def decide_discount_approval(
    approval_id: str,
    payload: DiscountApprovalDecision,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DiscountApproval:
    approval = session.get(DiscountApproval, approval_id)
    if not approval or approval.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discount approval not found")
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid consultation")
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
        )
    ).first()
    if existing:
        return _read_invoice_detail(session, refresh_consultation_invoice(session, existing))
    if payload.discount_amount > 0:
        approval = session.get(DiscountApproval, payload.discount_approval_id) if payload.discount_approval_id else None
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid appointment")

    invoice, _item = create_consultation_invoice(
        session,
        appointment=appointment,
        consultation_id=consultation.id,
        discount_amount=payload.discount_amount,
        discount_approval_id=payload.discount_approval_id,
        tax_rule_id=payload.tax_rule_id,
        created_by_user_id=payload.created_by_user_id,
        treatment_type=consultation.treatment_type,
    )
    invoice = refresh_consultation_invoice(session, invoice)
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


@router.get("/invoices", response_model=list[InvoiceRead])
def list_invoices(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> list[Invoice]:
    enforce_entitlement(session, tenant_id, "billing_basic")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(Invoice).where(Invoice.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(Invoice.branch_id == branch_id)
    return list(session.exec(statement.order_by(Invoice.created_at.desc())).all())


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    pdf = _simple_pdf(
        [
            "MedizinHub HMS Receipt",
            f"Invoice: {invoice.invoice_number}",
            f"Subtotal: {invoice.subtotal_amount}",
            f"Discount: {invoice.discount_amount}",
            f"Tax: {invoice.tax_amount}",
            f"Total: {invoice.total_amount}",
            f"Paid: {invoice.paid_amount}",
            f"Balance: {invoice.balance_amount}",
        ]
    )
    return Response(content=pdf, media_type="application/pdf")


@router.post("/invoices/{invoice_id}/credit-notes", response_model=CreditNoteRead, status_code=status.HTTP_201_CREATED)
def create_credit_note(
    invoice_id: str,
    payload: CreditNoteCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PAYMENTS_MANAGE)),
) -> CreditNote:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    if payload.amount > invoice.total_amount:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Credit note amount cannot exceed invoice total")
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
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
    _sync_physiotherapy_case_status(session, invoice)
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    if payment.status == PaymentStatus.REFUNDED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment already refunded")
    invoice = session.get(Invoice, payment.invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)

    payment.status = PaymentStatus.REFUNDED
    payment.refunded_at = datetime.now(timezone.utc)
    payment.refund_reason = payload.reason
    session.add(payment)
    session.commit()
    session.refresh(payment)
    invoice = update_invoice_payment_status(session, invoice)
    _sync_physiotherapy_case_status(session, invoice)
    if refundable_paid_total(session, invoice) == 0:
        invoice.status = InvoiceStatus.REFUNDED
        session.add(invoice)
        session.commit()
        session.refresh(invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.actor_user_id,
        action="payment.refunded",
        resource_type="payment",
        resource_id=payment.id,
        purpose="refund",
    )
    credit = CreditNote(
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        credit_note_number=next_credit_note_number(session, tenant_id),
        amount=payment.amount,
        reason=payload.reason,
        created_by_user_id=payload.actor_user_id,
    )
    session.add(credit)
    session.commit()
    session.refresh(credit)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.actor_user_id,
        action="credit_note.issued_for_refund",
        resource_type="credit_note",
        resource_id=credit.id,
        purpose="refund_credit_note",
    )
    return _read_invoice_detail(session, invoice)


@router.post("/invoices/{invoice_id}/cancel", response_model=InvoiceRead)
def cancel_invoice(
    invoice_id: str,
    payload: CancelInvoiceRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> Invoice:
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    if invoice.paid_amount > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Paid invoices cannot be cancelled; refund payments first",
        )
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice already cancelled")
    invoice.status = InvoiceStatus.CANCELLED
    invoice.updated_at = datetime.now(timezone.utc)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.actor_user_id,
        action="invoice.cancelled",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing_cancellation",
        metadata_json=f'{{"reason": "{payload.reason}"}}',
    )
    return invoice


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
        .where(Invoice.tenant_id == tenant_id)
    )
    if branch_id:
        statement = statement.where(Invoice.branch_id == branch_id)
    if practitioner_id:
        statement = statement.where(Appointment.practitioner_id == practitioner_id)
    rows = list(session.exec(statement).all())
    invoice_count = len(rows)
    total_invoice_amount = sum(invoice.total_amount for invoice, _appointment in rows)
    total_paid_amount = sum(invoice.paid_amount for invoice, _appointment in rows)
    total_doctor_share = sum(invoice.doctor_share_amount for invoice, _appointment in rows)
    doctor_share_paid_basis = 0
    for invoice, _appointment in rows:
        if invoice.total_amount:
            doctor_share_paid_basis += round(invoice.doctor_share_amount * invoice.paid_amount / invoice.total_amount)
    return DoctorSettlementSummary(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        invoice_count=invoice_count,
        total_invoice_amount=total_invoice_amount,
        total_paid_amount=total_paid_amount,
        total_doctor_share=total_doctor_share,
        doctor_share_paid_basis=doctor_share_paid_basis,
        pending_doctor_share=max(total_doctor_share - doctor_share_paid_basis, 0),
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
    settlement = DoctorSettlement(
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        practitioner_id=payload.practitioner_id,
        invoice_count=summary.invoice_count,
        total_invoice_amount=summary.total_invoice_amount,
        total_paid_amount=summary.total_paid_amount,
        total_doctor_share=summary.total_doctor_share,
        settlement_amount=summary.doctor_share_paid_basis,
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
    return DoctorSettlementRead(
        **summary.model_dump(),
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
    statement = select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.balance_amount > 0)
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
    group_by: str = Query(default="branch", pattern="^(branch|doctor|department|visit_purpose)$"),
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
        .join(Appointment, Invoice.appointment_id == Appointment.id)
        .where(Invoice.tenant_id == tenant_id)
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
        key = (
            invoice.branch_id
            if group_by == "branch"
            else appointment.practitioner_id
            if group_by == "doctor"
            else appointment.department_id
            if group_by == "department"
            else appointment.visit_purpose or appointment.appointment_type.value
        )
        key = key or "unassigned"
        bucket = grouped.setdefault(
            key,
            {"key": key, "invoice_count": 0, "invoice_amount": 0, "paid_amount": 0, "tax_amount": 0, "doctor_share": 0},
        )
        bucket["invoice_count"] += 1
        bucket["invoice_amount"] += invoice.total_amount
        bucket["paid_amount"] += invoice.paid_amount
        bucket["tax_amount"] += invoice.tax_amount
        bucket["doctor_share"] += invoice.doctor_share_amount
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
