from datetime import date, datetime, time, timedelta

from sqlalchemy import case, func, or_
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

    def list_references(
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

    def count(
        self,
        *,
        tenant_id: str,
        from_date: date | None = None,
        to_date: date | None = None,
    ) -> int:
        statement = (
            select(func.count())
            .select_from(Patient)
            .where(Patient.tenant_id == tenant_id)
        )
        if from_date:
            statement = statement.where(
                Patient.created_at >= datetime.combine(from_date, time.min)
            )
        if to_date:
            statement = statement.where(
                Patient.created_at
                < datetime.combine(to_date + timedelta(days=1), time.min)
            )
        return int(self.session.exec(statement).one())

    def patients_with_primary_mobile(self, *, tenant_id: str) -> list[Patient]:
        return list(
            self.session.exec(
                select(Patient).where(
                    Patient.tenant_id == tenant_id,
                    Patient.mobile.is_not(None),
                )
            ).all()
        )

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
        status: PatientStatus | None = None,
        gender: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        offset: int = 0,
        limit: int = 25,
    ) -> list[Patient]:
        statement = self._search_statement(
            tenant_id=tenant_id,
            q=q,
            branch_id=branch_id,
            active_only=active_only,
            status=status,
            gender=gender,
            from_date=from_date,
            to_date=to_date,
        )
        if q:
            term = q.strip().lower()
            statement = statement.order_by(
                case(
                    (func.lower(Patient.patient_number) == term, 0),
                    (func.lower(Patient.mobile) == term, 0),
                    (func.lower(Patient.full_name) == term, 1),
                    (func.lower(Patient.patient_number).startswith(term), 2),
                    (func.lower(Patient.mobile).startswith(term), 2),
                    (func.lower(Patient.full_name).startswith(term), 3),
                    else_=4,
                ),
                Patient.updated_at.desc(),
            )
        else:
            statement = statement.order_by(Patient.updated_at.desc())
        return list(self.session.exec(statement.offset(offset).limit(limit)).all())

    def count_search(
        self,
        *,
        tenant_id: str,
        q: str | None = None,
        branch_id: str | None = None,
        active_only: bool = True,
        status: PatientStatus | None = None,
        gender: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
    ) -> int:
        filtered = self._search_statement(
            tenant_id=tenant_id,
            q=q,
            branch_id=branch_id,
            active_only=active_only,
            status=status,
            gender=gender,
            from_date=from_date,
            to_date=to_date,
        ).subquery()
        return int(self.session.exec(select(func.count()).select_from(filtered)).one())

    def _search_statement(
        self,
        *,
        tenant_id: str,
        q: str | None,
        branch_id: str | None,
        active_only: bool,
        status: PatientStatus | None,
        gender: str | None,
        from_date: date | None,
        to_date: date | None,
    ):
        statement = select(Patient).where(Patient.tenant_id == tenant_id)
        if status:
            statement = statement.where(Patient.status == status)
        elif active_only:
            statement = statement.where(Patient.status == PatientStatus.ACTIVE)
        if branch_id:
            statement = statement.where(Patient.branch_id == branch_id)
        if gender:
            statement = statement.where(Patient.gender == gender)
        if from_date:
            statement = statement.where(
                Patient.created_at >= datetime.combine(from_date, time.min)
            )
        if to_date:
            statement = statement.where(
                Patient.created_at
                < datetime.combine(to_date + timedelta(days=1), time.min)
            )
        if q:
            term = q.strip().lower()
            search_columns = (
                Patient.patient_number,
                Patient.full_name,
                Patient.mobile,
                Patient.alternate_mobile,
                Patient.guardian_name,
                Patient.guardian_mobile,
                Patient.area,
                Patient.address,
            )
            statement = statement.where(
                or_(
                    *(
                        func.lower(column).contains(term, autoescape=True)
                        for column in search_columns
                    )
                )
            )
        return statement

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
