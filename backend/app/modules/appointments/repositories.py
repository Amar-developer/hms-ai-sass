from datetime import date, time

from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.modules.appointments.models import Appointment, AppointmentIdempotencyKey
from app.modules.consultations.models import Consultation
from app.modules.patients.models import Patient
from app.modules.practitioners.models import Practitioner
from app.modules.queue.models import QueueEntry
from app.modules.tenants.models import Branch, Department, Tenant


class AppointmentRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, appointment: Appointment) -> Appointment:
        self.session.add(appointment)
        return appointment

    def get_for_tenant(self, tenant_id: str, appointment_id: str) -> Appointment | None:
        appointment = self.session.get(Appointment, appointment_id)
        if not appointment or appointment.tenant_id != tenant_id:
            return None
        return appointment

    def for_patient_on_date(
        self, *, tenant_id: str, patient_id: str, appointment_date: date
    ) -> list[Appointment]:
        return list(
            self.session.exec(
                select(Appointment).where(
                    Appointment.tenant_id == tenant_id,
                    Appointment.patient_id == patient_id,
                    Appointment.appointment_date == appointment_date,
                )
            ).all()
        )

    def for_practitioner_slot(
        self,
        *,
        tenant_id: str,
        practitioner_id: str,
        appointment_date: date,
        appointment_time: time,
    ) -> list[Appointment]:
        return list(
            self.session.exec(
                select(Appointment).where(
                    Appointment.tenant_id == tenant_id,
                    Appointment.practitioner_id == practitioner_id,
                    Appointment.appointment_date == appointment_date,
                    Appointment.appointment_time == appointment_time,
                )
            ).all()
        )


class AppointmentIdempotencyRepository:
    def __init__(self, session: Session):
        self.session = session

    def get(
        self, *, tenant_id: str, user_id: str, idempotency_key: str
    ) -> AppointmentIdempotencyKey | None:
        return self.session.exec(
            select(AppointmentIdempotencyKey).where(
                AppointmentIdempotencyKey.tenant_id == tenant_id,
                AppointmentIdempotencyKey.user_id == user_id,
                AppointmentIdempotencyKey.idempotency_key == idempotency_key,
            )
        ).first()

    def add(self, record: AppointmentIdempotencyKey) -> AppointmentIdempotencyKey:
        self.session.add(record)
        return record


class AppointmentReferenceRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_tenant(self, tenant_id: str) -> Tenant | None:
        return self.session.get(Tenant, tenant_id)

    def get_patient_for_tenant(self, tenant_id: str, patient_id: str) -> Patient | None:
        patient = self.session.get(Patient, patient_id)
        if not patient or patient.tenant_id != tenant_id:
            return None
        return patient

    def get_practitioner(self, practitioner_id: str) -> Practitioner | None:
        return self.session.get(Practitioner, practitioner_id)

    def lock_practitioner(self, practitioner_id: str) -> Practitioner | None:
        return self.session.exec(
            select(Practitioner)
            .where(Practitioner.id == practitioner_id)
            .with_for_update()
        ).first()

    def lock_patient(self, patient_id: str) -> Patient | None:
        return self.session.exec(
            select(Patient).where(Patient.id == patient_id).with_for_update()
        ).first()

    def get_department_for_tenant(
        self, tenant_id: str, department_id: str
    ) -> Department | None:
        department = self.session.get(Department, department_id)
        if not department or department.tenant_id != tenant_id:
            return None
        return department

    def list_departments_for_tenant(self, tenant_id: str) -> list[Department]:
        return list(
            self.session.exec(
                select(Department).where(Department.tenant_id == tenant_id)
            ).all()
        )


class AppointmentGridRepository:
    def __init__(self, session: Session):
        self.session = session

    def _statement(self):
        return (
            select(
                Appointment,
                Tenant,
                Branch,
                Patient,
                Department,
                Practitioner,
                QueueEntry,
                Consultation,
            )
            .join(Tenant, Tenant.id == Appointment.tenant_id)
            .join(Branch, Branch.id == Appointment.branch_id)
            .join(Patient, Patient.id == Appointment.patient_id)
            .outerjoin(Department, Department.id == Appointment.department_id)
            .outerjoin(Practitioner, Practitioner.id == Appointment.practitioner_id)
            .outerjoin(QueueEntry, QueueEntry.appointment_id == Appointment.id)
            .outerjoin(Consultation, Consultation.appointment_id == Appointment.id)
        )

    def list_for_tenant(
        self,
        *,
        tenant_id: str,
        branch_id: str | None = None,
        department_id: str | None = None,
        practitioner_id: str | None = None,
        appointment_date: date | None = None,
        q: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ):
        statement = self._statement().where(Appointment.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(Appointment.branch_id == branch_id)
        if department_id:
            statement = statement.where(Appointment.department_id == department_id)
        if practitioner_id:
            statement = statement.where(Appointment.practitioner_id == practitioner_id)
        if appointment_date:
            statement = statement.where(
                Appointment.appointment_date == appointment_date
            )
        if q:
            pattern = f"%{q.strip().lower()}%"
            statement = statement.where(
                or_(
                    func.lower(Patient.patient_number).like(pattern),
                    func.lower(Patient.full_name).like(pattern),
                    func.lower(Patient.mobile).like(pattern),
                    func.lower(Patient.guardian_mobile).like(pattern),
                    func.lower(QueueEntry.token_number).like(pattern),
                )
            )
        return self.session.exec(
            statement.order_by(
                Appointment.appointment_date.desc(), Appointment.created_at.desc()
            )
            .offset(skip)
            .limit(limit)
        )

    def list_platform(
        self,
        *,
        tenant_id: str | None = None,
        branch_id: str | None = None,
        department_id: str | None = None,
        appointment_date: date | None = None,
        q: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ):
        statement = self._statement()
        if tenant_id:
            statement = statement.where(Appointment.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(Appointment.branch_id == branch_id)
        if department_id:
            statement = statement.where(Appointment.department_id == department_id)
        if appointment_date:
            statement = statement.where(
                Appointment.appointment_date == appointment_date
            )
        if q:
            pattern = f"%{q.strip().lower()}%"
            statement = statement.where(
                or_(
                    func.lower(Tenant.name).like(pattern),
                    func.lower(Branch.name).like(pattern),
                    func.lower(Patient.patient_number).like(pattern),
                    func.lower(Patient.full_name).like(pattern),
                    func.lower(Patient.mobile).like(pattern),
                    func.lower(Patient.guardian_mobile).like(pattern),
                    func.lower(Department.name).like(pattern),
                    func.lower(Practitioner.full_name).like(pattern),
                    func.lower(QueueEntry.token_number).like(pattern),
                )
            )
        return self.session.exec(
            statement.order_by(
                Appointment.appointment_date.desc(), Appointment.created_at.desc()
            )
            .offset(skip)
            .limit(limit)
        ).all()
