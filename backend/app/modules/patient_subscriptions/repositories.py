from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.billing.models import Invoice
from app.modules.consultations.models import Consultation
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionEnrollmentStatus,
    PatientSubscriptionPlan,
)
from app.modules.patients.models import Patient
from app.modules.tenants.models import Branch, Department


class PatientSubscriptionPlanRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, plan: PatientSubscriptionPlan) -> PatientSubscriptionPlan:
        self.session.add(plan)
        return plan

    def get_for_tenant(
        self, tenant_id: str, plan_id: str
    ) -> PatientSubscriptionPlan | None:
        plan = self.session.get(PatientSubscriptionPlan, plan_id)
        if not plan or plan.tenant_id != tenant_id:
            return None
        return plan

    def active_for_tenant(self, tenant_id: str) -> list[PatientSubscriptionPlan]:
        return list(
            self.session.exec(
                select(PatientSubscriptionPlan).where(
                    PatientSubscriptionPlan.tenant_id == tenant_id,
                    PatientSubscriptionPlan.is_active == True,  # noqa: E712
                )
            ).all()
        )

    def list_for_tenant(
        self, *, tenant_id: str, include_inactive: bool = False
    ) -> list[PatientSubscriptionPlan]:
        statement = select(PatientSubscriptionPlan).where(
            PatientSubscriptionPlan.tenant_id == tenant_id
        )
        if not include_inactive:
            statement = statement.where(
                PatientSubscriptionPlan.is_active == True  # noqa: E712
            )
        return list(
            self.session.exec(
                statement.order_by(PatientSubscriptionPlan.created_at.desc())
            ).all()
        )


class PatientSubscriptionEnrollmentRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(
        self, enrollment: PatientSubscriptionEnrollment
    ) -> PatientSubscriptionEnrollment:
        self.session.add(enrollment)
        return enrollment

    def get_for_tenant(
        self, tenant_id: str, enrollment_id: str
    ) -> PatientSubscriptionEnrollment | None:
        enrollment = self.session.get(PatientSubscriptionEnrollment, enrollment_id)
        if not enrollment or enrollment.tenant_id != tenant_id:
            return None
        return enrollment

    def status_rows_for_patient(
        self,
        *,
        tenant_id: str,
        patient_id: str,
        enrollment_status: PatientSubscriptionEnrollmentStatus,
    ) -> list[PatientSubscriptionEnrollment]:
        return list(
            self.session.exec(
                select(PatientSubscriptionEnrollment)
                .where(
                    PatientSubscriptionEnrollment.tenant_id == tenant_id,
                    PatientSubscriptionEnrollment.patient_id == patient_id,
                    PatientSubscriptionEnrollment.status == enrollment_status,
                )
                .order_by(PatientSubscriptionEnrollment.created_at)
            ).all()
        )

    def list_for_tenant(
        self,
        *,
        tenant_id: str,
        branch_id: str | None = None,
        patient_id: str | None = None,
    ) -> list[PatientSubscriptionEnrollment]:
        statement = select(PatientSubscriptionEnrollment).where(
            PatientSubscriptionEnrollment.tenant_id == tenant_id
        )
        if branch_id:
            statement = statement.where(
                PatientSubscriptionEnrollment.branch_id == branch_id
            )
        if patient_id:
            statement = statement.where(
                PatientSubscriptionEnrollment.patient_id == patient_id
            )
        return list(
            self.session.exec(
                statement.order_by(PatientSubscriptionEnrollment.created_at.desc())
            ).all()
        )


class PatientSubscriptionSupportRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_patient_for_tenant(self, tenant_id: str, patient_id: str) -> Patient | None:
        patient = self.session.get(Patient, patient_id)
        if not patient or patient.tenant_id != tenant_id:
            return None
        return patient

    def get_department_for_tenant(
        self, tenant_id: str, department_id: str
    ) -> Department | None:
        department = self.session.get(Department, department_id)
        if not department or department.tenant_id != tenant_id:
            return None
        return department

    def get_invoice_for_tenant(self, tenant_id: str, invoice_id: str) -> Invoice | None:
        invoice = self.session.get(Invoice, invoice_id)
        if not invoice or invoice.tenant_id != tenant_id:
            return None
        return invoice

    def get_appointment(self, appointment_id: str) -> Appointment | None:
        return self.session.get(Appointment, appointment_id)

    def get_consultation(self, consultation_id: str) -> Consultation | None:
        return self.session.get(Consultation, consultation_id)

    def first_active_branch_id(self, tenant_id: str) -> str | None:
        return self.session.exec(
            select(Branch.id)
            .where(Branch.tenant_id == tenant_id, Branch.is_active == True)  # noqa: E712
            .order_by(Branch.created_at, Branch.name)
        ).first()

    def first_benefit_invoice(
        self, *, tenant_id: str, enrollment_id: str
    ) -> Invoice | None:
        return self.session.exec(
            select(Invoice).where(
                Invoice.tenant_id == tenant_id,
                Invoice.patient_subscription_enrollment_id == enrollment_id,
                Invoice.membership_discount_amount > 0,
            )
        ).first()

    def list_benefit_invoices(
        self, *, tenant_id: str, enrollment_id: str
    ) -> list[Invoice]:
        return list(
            self.session.exec(
                select(Invoice).where(
                    Invoice.tenant_id == tenant_id,
                    Invoice.patient_subscription_enrollment_id == enrollment_id,
                    Invoice.membership_discount_amount > 0,
                )
            ).all()
        )
