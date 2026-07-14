from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import enforce_entitlement, scoped_branch_id
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import DoctorSettlement, InvoiceStatus
from app.modules.billing.repositories.settlement_report_repository import (
    BillingSettlementReportRepository,
)
from app.modules.billing.schemas import (
    DoctorSettlementFinalize,
    DoctorSettlementRead,
    DoctorSettlementSummary,
    DueCollectionReport,
    RevenueReport,
)
from app.modules.billing.services.membership import invoice_membership_service
from app.modules.identity.models import User
from app.modules.subscriptions.service import enforce_module_enabled


def doctor_settlement_summary(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str | None,
    branch_id: str | None,
    actor: User,
) -> DoctorSettlementSummary:
    enforce_module_enabled(session, tenant_id, "billing_advanced")
    branch_id = scoped_branch_id(actor, branch_id)
    report_repo = BillingSettlementReportRepository(session)
    rows = report_repo.list_settlement_invoice_rows(
        tenant_id=tenant_id,
        branch_id=branch_id,
        practitioner_id=practitioner_id,
    )
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
    settlements = report_repo.list_finalized_settlements(
        tenant_id=tenant_id,
        branch_id=branch_id,
        practitioner_id=practitioner_id,
    )
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


def finalize_doctor_settlement(
    session: Session,
    *,
    tenant_id: str,
    payload: DoctorSettlementFinalize,
    actor: User,
) -> DoctorSettlementRead:
    summary = doctor_settlement_summary(
        session,
        tenant_id=tenant_id,
        practitioner_id=payload.practitioner_id,
        branch_id=payload.branch_id,
        actor=actor,
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
        session,
        tenant_id=tenant_id,
        practitioner_id=payload.practitioner_id,
        branch_id=summary.branch_id,
        actor=actor,
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


def due_collection_report(
    session: Session, *, tenant_id: str, branch_id: str | None, actor: User
) -> DueCollectionReport:
    enforce_entitlement(session, tenant_id, "billing_basic")
    branch_id = scoped_branch_id(actor, branch_id)
    invoices = BillingSettlementReportRepository(session).list_due_collection_invoices(
        tenant_id=tenant_id,
        branch_id=branch_id,
    )
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


def revenue_report(
    session: Session,
    *,
    tenant_id: str,
    group_by: str,
    branch_id: str | None,
    from_date: date | None,
    to_date: date | None,
    actor: User,
) -> RevenueReport:
    enforce_module_enabled(session, tenant_id, "billing_advanced")
    branch_id = scoped_branch_id(actor, branch_id)
    rows = BillingSettlementReportRepository(session).list_revenue_rows(
        tenant_id=tenant_id,
        branch_id=branch_id,
        from_date=from_date,
        to_date=to_date,
    )
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
                else invoice_membership_service(invoice) or "direct"
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
        # balance_amount after a refund reflects the waived/refunded portion,
        # not money still owed, so it must not be added back into revenue.
        if invoice.status in (
            InvoiceStatus.REFUNDED,
            InvoiceStatus.PARTIALLY_REFUNDED,
        ):
            net_invoice_amount = int(invoice.paid_amount or 0)
        else:
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
