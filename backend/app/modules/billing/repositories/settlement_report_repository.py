from datetime import date, datetime, time, timedelta

from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.billing.models import (
    BillingLedgerEntry,
    DoctorSettlement,
    Invoice,
    InvoiceStatus,
    Payment,
    SettlementStatus,
    VendorSettlement,
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
        for_update: bool = False,
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
        if for_update:
            statement = statement.with_for_update()
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

    def list_all_finalized_settlements(
        self, *, tenant_id: str
    ) -> list[DoctorSettlement]:
        return list(
            self.session.exec(
                select(DoctorSettlement).where(
                    DoctorSettlement.tenant_id == tenant_id,
                    DoctorSettlement.status == SettlementStatus.FINALIZED,
                )
            ).all()
        )

    def list_doctor_settlements_for_period(
        self, *, tenant_id: str, start: date, end: date
    ) -> list[DoctorSettlement]:
        return list(
            self.session.exec(
                select(DoctorSettlement)
                .where(
                    DoctorSettlement.tenant_id == tenant_id,
                    DoctorSettlement.status == SettlementStatus.FINALIZED,
                    DoctorSettlement.finalized_at >= datetime.combine(start, time.min),
                    DoctorSettlement.finalized_at
                    < datetime.combine(end + timedelta(days=1), time.min),
                )
                .order_by(DoctorSettlement.finalized_at)
            ).all()
        )

    def list_vendor_settlements_for_period(
        self,
        *,
        tenant_id: str,
        start: date,
        end: date,
        supplier_id: str | None = None,
    ) -> list[VendorSettlement]:
        statement = select(VendorSettlement).where(
            VendorSettlement.tenant_id == tenant_id,
            VendorSettlement.status == "finalized",
            VendorSettlement.finalized_at >= datetime.combine(start, time.min),
            VendorSettlement.finalized_at
            < datetime.combine(end + timedelta(days=1), time.min),
        )
        if supplier_id:
            statement = statement.where(VendorSettlement.supplier_id == supplier_id)
        return list(
            self.session.exec(statement.order_by(VendorSettlement.finalized_at)).all()
        )

    def list_due_collection_invoices(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        from_date: date | None = None,
        to_date: date | None = None,
    ) -> list[Invoice]:
        statement = select(Invoice).where(
            Invoice.tenant_id == tenant_id,
            Invoice.balance_amount > 0,
            # A refund never reduces total_amount, so balance_amount stays
            # inflated by the refunded amount for PARTIALLY_REFUNDED invoices
            # too, not just fully REFUNDED ones — exclude both so refunded
            # money never appears as still due.
            Invoice.status.notin_(
                [
                    InvoiceStatus.CANCELLED,
                    InvoiceStatus.REFUNDED,
                    InvoiceStatus.PARTIALLY_REFUNDED,
                ]
            ),
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
                Invoice.status != InvoiceStatus.CANCELLED,
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

    def list_collected_payments(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        from_date: date | None,
        to_date: date | None,
    ) -> list[Payment]:
        statement = select(Payment).where(Payment.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(Payment.branch_id == branch_id)
        if from_date:
            statement = statement.where(
                Payment.collected_at >= datetime.combine(from_date, time.min)
            )
        if to_date:
            statement = statement.where(
                Payment.collected_at
                < datetime.combine(to_date + timedelta(days=1), time.min)
            )
        return list(self.session.exec(statement).all())

    def list_refund_entries(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        from_date: date | None,
        to_date: date | None,
    ) -> list[BillingLedgerEntry]:
        statement = select(BillingLedgerEntry).where(
            BillingLedgerEntry.tenant_id == tenant_id,
            BillingLedgerEntry.entry_type.in_(
                [
                    "payment_refunded",
                    "payment_partially_refunded",
                ]
            ),
        )
        if branch_id:
            statement = statement.where(BillingLedgerEntry.branch_id == branch_id)
        if from_date:
            statement = statement.where(
                BillingLedgerEntry.created_at >= datetime.combine(from_date, time.min)
            )
        if to_date:
            statement = statement.where(
                BillingLedgerEntry.created_at
                < datetime.combine(to_date + timedelta(days=1), time.min)
            )
        return list(self.session.exec(statement).all())
