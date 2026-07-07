from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionPlan,
)
from app.modules.patients.models import Patient, PatientAlert, PatientStatus


class PatientRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, patient: Patient) -> Patient:
        self.session.add(patient)
        return patient

    def get_for_tenant(self, tenant_id: str, patient_id: str) -> Patient | None:
        patient = self.session.get(Patient, patient_id)
        if not patient or patient.tenant_id != tenant_id:
            return None
        return patient

    def duplicate_candidate_rows(
        self,
        *,
        tenant_id: str,
        normalized_name: str,
        mobile: str | None,
        guardian_mobile: str | None,
        limit: int = 10,
    ) -> list[Patient]:
        statement = select(Patient).where(Patient.tenant_id == tenant_id)
        conditions = [func.lower(Patient.full_name) == normalized_name]
        if mobile:
            conditions.extend(
                [
                    Patient.mobile == mobile,
                    Patient.guardian_mobile == mobile,
                ]
            )
        if guardian_mobile:
            conditions.extend(
                [
                    Patient.mobile == guardian_mobile,
                    Patient.guardian_mobile == guardian_mobile,
                ]
            )
        return list(
            self.session.exec(statement.where(or_(*conditions)).limit(limit)).all()
        )

    def search(
        self,
        *,
        tenant_id: str,
        q: str | None = None,
        branch_id: str | None = None,
        active_only: bool = True,
        limit: int = 25,
    ) -> list[Patient]:
        statement = select(Patient).where(Patient.tenant_id == tenant_id)
        if active_only:
            statement = statement.where(Patient.status == PatientStatus.ACTIVE)
        if branch_id:
            statement = statement.where(Patient.branch_id == branch_id)
        if q:
            pattern = f"%{q.strip().lower()}%"
            statement = statement.where(
                or_(
                    func.lower(Patient.patient_number).like(pattern),
                    func.lower(Patient.full_name).like(pattern),
                    func.lower(Patient.mobile).like(pattern),
                    func.lower(Patient.alternate_mobile).like(pattern),
                    func.lower(Patient.guardian_name).like(pattern),
                    func.lower(Patient.guardian_mobile).like(pattern),
                    func.lower(Patient.area).like(pattern),
                    func.lower(Patient.address).like(pattern),
                )
            )
        return list(
            self.session.exec(statement.order_by(Patient.created_at).limit(limit)).all()
        )

    def doctor_has_patient_appointment(
        self,
        *,
        tenant_id: str,
        patient_id: str,
        practitioner_id: str,
    ) -> bool:
        return (
            self.session.exec(
                select(Appointment).where(
                    Appointment.tenant_id == tenant_id,
                    Appointment.patient_id == patient_id,
                    Appointment.practitioner_id == practitioner_id,
                )
            ).first()
            is not None
        )


class PatientAlertRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, alert: PatientAlert) -> PatientAlert:
        self.session.add(alert)
        return alert

    def active_for_patient(
        self, *, tenant_id: str, patient_id: str
    ) -> list[PatientAlert]:
        return list(
            self.session.exec(
                select(PatientAlert)
                .where(
                    PatientAlert.tenant_id == tenant_id,
                    PatientAlert.patient_id == patient_id,
                    PatientAlert.is_active == True,  # noqa: E712
                )
                .order_by(PatientAlert.created_at)
            ).all()
        )

    def active_for_patients(
        self, *, tenant_id: str, patient_ids: list[str]
    ) -> list[PatientAlert]:
        if not patient_ids:
            return []
        return list(
            self.session.exec(
                select(PatientAlert).where(
                    PatientAlert.tenant_id == tenant_id,
                    PatientAlert.patient_id.in_(patient_ids),
                    PatientAlert.is_active == True,  # noqa: E712
                )
            ).all()
        )


class PatientSubscriptionReadRepository:
    def __init__(self, session: Session):
        self.session = session

    def enrollment_plan_rows(
        self, *, tenant_id: str, patient_ids: list[str]
    ) -> list[tuple[PatientSubscriptionEnrollment, PatientSubscriptionPlan]]:
        if not patient_ids:
            return []
        return list(
            self.session.exec(
                select(PatientSubscriptionEnrollment, PatientSubscriptionPlan)
                .join(
                    PatientSubscriptionPlan,
                    PatientSubscriptionPlan.id == PatientSubscriptionEnrollment.plan_id,
                )
                .where(
                    PatientSubscriptionEnrollment.tenant_id == tenant_id,
                    PatientSubscriptionEnrollment.patient_id.in_(patient_ids),
                )
                .order_by(PatientSubscriptionEnrollment.created_at.desc())
            ).all()
        )
