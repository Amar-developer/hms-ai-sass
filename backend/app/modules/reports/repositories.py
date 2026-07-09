from datetime import date, datetime

from sqlmodel import Session, select

from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.billing.models import Invoice, InvoiceItem
from app.modules.lab.models import LabOrderItem, LabTestCatalog, LabTestPackage
from app.modules.patients.models import Patient
from app.modules.pharmacy.models import (
    MedicineCatalog,
    PharmacyIssueItem,
    PharmacySupplier,
)
from app.modules.practitioners.models import Practitioner
from app.modules.reports.models import MonthlyRevenueSnapshot, ReportJob
from app.modules.tenants.models import Department, Tenant


class ReportJobRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, job: ReportJob) -> ReportJob:
        self.session.add(job)
        return job

    def get_for_tenant(self, tenant_id: str, job_id: str) -> ReportJob | None:
        job = self.session.get(ReportJob, job_id)
        if not job or job.tenant_id != tenant_id:
            return None
        return job

    def list_for_tenant(self, *, tenant_id: str, limit: int) -> list[ReportJob]:
        return list(
            self.session.exec(
                select(ReportJob)
                .where(ReportJob.tenant_id == tenant_id)
                .order_by(ReportJob.created_at.desc())
                .limit(limit)
            ).all()
        )


class MonthlyRevenueSnapshotRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_for_tenant(
        self, tenant_id: str, snapshot_id: str
    ) -> MonthlyRevenueSnapshot | None:
        snapshot = self.session.get(MonthlyRevenueSnapshot, snapshot_id)
        if not snapshot or snapshot.tenant_id != tenant_id:
            return None
        return snapshot

    def list_for_tenant(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        limit: int,
    ) -> list[MonthlyRevenueSnapshot]:
        return list(
            self.session.exec(
                select(MonthlyRevenueSnapshot)
                .where(
                    MonthlyRevenueSnapshot.tenant_id == tenant_id,
                    MonthlyRevenueSnapshot.branch_id == branch_id,
                )
                .order_by(
                    MonthlyRevenueSnapshot.period_year.desc(),
                    MonthlyRevenueSnapshot.period_month.desc(),
                )
                .limit(limit)
            ).all()
        )


class ReportDataRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_tenant(self, tenant_id: str) -> Tenant | None:
        return self.session.get(Tenant, tenant_id)

    def list_invoices_for_period(
        self, *, tenant_id: str, start_at: datetime, end_at: datetime
    ) -> list[Invoice]:
        return list(
            self.session.exec(
                select(Invoice)
                .where(
                    Invoice.tenant_id == tenant_id,
                    Invoice.created_at >= start_at,
                    Invoice.created_at <= end_at,
                )
                .order_by(Invoice.created_at)
            ).all()
        )

    def list_invoice_items_by_invoice_ids(
        self, *, tenant_id: str, invoice_ids: list[str]
    ) -> list[InvoiceItem]:
        if not invoice_ids:
            return []
        return list(
            self.session.exec(
                select(InvoiceItem).where(
                    InvoiceItem.tenant_id == tenant_id,
                    InvoiceItem.invoice_id.in_(invoice_ids),
                )
            ).all()
        )

    def list_appointments_by_ids(
        self, *, tenant_id: str, appointment_ids: list[str]
    ) -> list[Appointment]:
        if not appointment_ids:
            return []
        return list(
            self.session.exec(
                select(Appointment).where(
                    Appointment.tenant_id == tenant_id,
                    Appointment.id.in_(appointment_ids),
                )
            ).all()
        )

    def list_completed_appointments(
        self,
        *,
        tenant_id: str,
        start: date,
        end: date,
        doctor_id: str | None = None,
        branch_id: str | None = None,
    ) -> list[Appointment]:
        statement = select(Appointment).where(
            Appointment.tenant_id == tenant_id,
            Appointment.appointment_date >= start,
            Appointment.appointment_date <= end,
            Appointment.status.in_(
                (AppointmentStatus.CONSULTATION_COMPLETED, AppointmentStatus.BILLED)
            ),
        )
        if doctor_id:
            statement = statement.where(Appointment.practitioner_id == doctor_id)
        if branch_id:
            statement = statement.where(Appointment.branch_id == branch_id)
        return list(self.session.exec(statement).all())

    def list_patients_by_ids(
        self, *, tenant_id: str, patient_ids: list[str]
    ) -> list[Patient]:
        if not patient_ids:
            return []
        return list(
            self.session.exec(
                select(Patient).where(
                    Patient.tenant_id == tenant_id,
                    Patient.id.in_(patient_ids),
                )
            ).all()
        )

    def list_practitioners(self, *, tenant_id: str) -> list[Practitioner]:
        return list(
            self.session.exec(
                select(Practitioner).where(Practitioner.tenant_id == tenant_id)
            ).all()
        )

    def list_departments(self, *, tenant_id: str) -> list[Department]:
        return list(
            self.session.exec(
                select(Department).where(Department.tenant_id == tenant_id)
            ).all()
        )

    def list_lab_order_items(
        self, *, tenant_id: str, lab_order_ids: list[str]
    ) -> list[LabOrderItem]:
        if not lab_order_ids:
            return []
        return list(
            self.session.exec(
                select(LabOrderItem)
                .where(
                    LabOrderItem.tenant_id == tenant_id,
                    LabOrderItem.lab_order_id.in_(lab_order_ids),
                )
                .order_by(LabOrderItem.created_at)
            ).all()
        )

    def list_lab_tests(self, *, tenant_id: str) -> list[LabTestCatalog]:
        return list(
            self.session.exec(
                select(LabTestCatalog).where(LabTestCatalog.tenant_id == tenant_id)
            ).all()
        )

    def list_lab_packages(self, *, tenant_id: str) -> list[LabTestPackage]:
        return list(
            self.session.exec(
                select(LabTestPackage).where(LabTestPackage.tenant_id == tenant_id)
            ).all()
        )

    def list_pharmacy_suppliers(self, *, tenant_id: str) -> list[PharmacySupplier]:
        return list(
            self.session.exec(
                select(PharmacySupplier).where(PharmacySupplier.tenant_id == tenant_id)
            ).all()
        )

    def list_pharmacy_issue_items(
        self, *, tenant_id: str, pharmacy_issue_ids: list[str]
    ) -> list[PharmacyIssueItem]:
        if not pharmacy_issue_ids:
            return []
        return list(
            self.session.exec(
                select(PharmacyIssueItem)
                .where(
                    PharmacyIssueItem.tenant_id == tenant_id,
                    PharmacyIssueItem.pharmacy_issue_id.in_(pharmacy_issue_ids),
                )
                .order_by(PharmacyIssueItem.created_at)
            ).all()
        )

    def list_medicines(self, *, tenant_id: str) -> list[MedicineCatalog]:
        return list(
            self.session.exec(
                select(MedicineCatalog).where(MedicineCatalog.tenant_id == tenant_id)
            ).all()
        )
