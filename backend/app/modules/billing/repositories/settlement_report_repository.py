from datetime import date, datetime, time, timedelta

from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.billing.models import (
    DoctorSettlement,
    Invoice,
    InvoiceStatus,
    SettlementStatus,
)


class BillingSettlementReportRepository:
    """Reads settlement and billing report query rows."""

    def __init__(self, session: Session):
        self.session = session

    def list_settlement_invoice_rows(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        practitioner_id: str | None,
    ) -> list[tuple[Invoice, Appointment]]:
        statement = (
            select(Invoice, Appointment)
            .join(Appointment, Invoice.appointment_id == Appointment.id)
            .where(
                Invoice.tenant_id == tenant_id,
                Invoice.status.notin_(
                    [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]
                ),
            )
        )
        if branch_id:
            statement = statement.where(Invoice.branch_id == branch_id)
        if practitioner_id:
            statement = statement.where(Appointment.practitioner_id == practitioner_id)
        return list(self.session.exec(statement).all())

    def list_finalized_settlements(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        practitioner_id: str | None,
    ) -> list[DoctorSettlement]:
        statement = select(DoctorSettlement).where(
            DoctorSettlement.tenant_id == tenant_id,
            DoctorSettlement.status == SettlementStatus.FINALIZED,
        )
        if branch_id:
            statement = statement.where(DoctorSettlement.branch_id == branch_id)
        else:
            statement = statement.where(DoctorSettlement.branch_id.is_(None))
        if practitioner_id:
            statement = statement.where(
                DoctorSettlement.practitioner_id == practitioner_id
            )
        else:
            statement = statement.where(DoctorSettlement.practitioner_id.is_(None))
        return list(self.session.exec(statement).all())

    def list_due_collection_invoices(
        self, *, tenant_id: str, branch_id: str | None
    ) -> list[Invoice]:
        statement = select(Invoice).where(
            Invoice.tenant_id == tenant_id,
            Invoice.balance_amount > 0,
            Invoice.status.notin_([InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]),
        )
        if branch_id:
            statement = statement.where(Invoice.branch_id == branch_id)
        return list(self.session.exec(statement.order_by(Invoice.created_at)).all())

    def list_revenue_rows(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        from_date: date | None,
        to_date: date | None,
    ) -> list[tuple[Invoice, Appointment | None]]:
        statement = (
            select(Invoice, Appointment)
            .outerjoin(Appointment, Invoice.appointment_id == Appointment.id)
            .where(
                Invoice.tenant_id == tenant_id,
                Invoice.status.notin_(
                    [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]
                ),
            )
        )
        if branch_id:
            statement = statement.where(Invoice.branch_id == branch_id)
        if from_date:
            statement = statement.where(
                Invoice.created_at >= datetime.combine(from_date, time.min)
            )
        if to_date:
            statement = statement.where(
                Invoice.created_at
                < datetime.combine(to_date + timedelta(days=1), time.min)
            )
        return list(self.session.exec(statement).all())
