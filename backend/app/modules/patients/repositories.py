from datetime import date, datetime, time, timedelta

from sqlalchemy import case, func, or_
from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionPlan,
)
from app.core.list_filters import (
    ListFilter,
    ListFilterOption,
    ListSort,
    apply_list_filters,
    apply_list_sort,
    labeled_filter_options,
    list_filter_options,
    tenant_user_filter_options,
)
from app.modules.patients.listing import PATIENT_LIST_SPEC
from app.modules.patients.models import (
    Patient,
    PatientAlert,
    PatientFamilyRelationship,
    PatientStatus,
)
from app.modules.identity.models import User
from app.modules.tenants.models import Branch


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
        list_filters: list[ListFilter] | None = None,
        list_sort: ListSort | None = None,
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
            list_filters=list_filters,
        )
        if q:
            term = q.strip().lower()
            q_order = [
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
            ]
        else:
            q_order = [Patient.updated_at.desc()]
        statement = apply_list_sort(
            statement,
            PATIENT_LIST_SPEC,
            list_sort,
            default_order=q_order,
        )
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
        list_filters: list[ListFilter] | None = None,
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
            list_filters=list_filters,
        ).subquery()
        return int(self.session.exec(select(func.count()).select_from(filtered)).one())

    def filter_options(
        self,
        *,
        tenant_id: str,
        branch_id: str | None = None,
    ) -> dict[str, list[ListFilterOption]]:
        patient_scope = select(Patient).where(Patient.tenant_id == tenant_id)
        if branch_id:
            patient_scope = patient_scope.where(Patient.branch_id == branch_id)
        patient_rows = patient_scope.subquery()

        branch_statement = select(Branch.id, Branch.name).where(
            Branch.tenant_id == tenant_id,
            Branch.is_active == True,  # noqa: E712
        )
        if branch_id:
            branch_statement = branch_statement.where(Branch.id == branch_id)

        plan_rows = self.session.exec(
            select(
                PatientSubscriptionPlan.name,
                PatientSubscriptionPlan.name,
            )
            .join(
                PatientSubscriptionEnrollment,
                PatientSubscriptionEnrollment.plan_id == PatientSubscriptionPlan.id,
            )
            .join(
                patient_rows,
                patient_rows.c.id == PatientSubscriptionEnrollment.patient_id,
            )
            .where(PatientSubscriptionEnrollment.tenant_id == tenant_id)
            .distinct()
            .order_by(PatientSubscriptionPlan.name)
            .limit(100)
        ).all()
        subscription_statuses = self.session.exec(
            select(PatientSubscriptionEnrollment.status)
            .join(
                patient_rows,
                patient_rows.c.id == PatientSubscriptionEnrollment.patient_id,
            )
            .where(PatientSubscriptionEnrollment.tenant_id == tenant_id)
            .distinct()
            .order_by(PatientSubscriptionEnrollment.status)
            .limit(100)
        ).all()
        return {
            "branch_id": labeled_filter_options(
                list(
                    self.session.exec(
                        branch_statement.distinct().order_by(Branch.name).limit(100)
                    ).all()
                )
            ),
            "gender": list_filter_options(
                list(
                    self.session.exec(
                        select(patient_rows.c.gender)
                        .distinct()
                        .order_by(patient_rows.c.gender)
                        .limit(100)
                    ).all()
                )
            ),
            "status": list_filter_options(
                list(
                    self.session.exec(
                        select(patient_rows.c.status)
                        .distinct()
                        .order_by(patient_rows.c.status)
                        .limit(100)
                    ).all()
                )
            ),
            "subscription_plan_name": labeled_filter_options(list(plan_rows)),
            "subscription_status": list_filter_options(list(subscription_statuses)),
            "created_by_user_id": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
            "updated_by_user_id": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
        }

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
        list_filters: list[ListFilter] | None = None,
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
        if list_filters:
            statement = apply_list_filters(statement, PATIENT_LIST_SPEC, list_filters)
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


class PatientFamilyRelationshipRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, relationship: PatientFamilyRelationship) -> PatientFamilyRelationship:
        self.session.add(relationship)
        return relationship

    def get_for_tenant(
        self, tenant_id: str, relationship_id: str
    ) -> PatientFamilyRelationship | None:
        row = self.session.get(PatientFamilyRelationship, relationship_id)
        if not row or row.tenant_id != tenant_id:
            return None
        return row

    def existing_pair(
        self, *, tenant_id: str, patient_id: str, related_patient_id: str
    ) -> PatientFamilyRelationship | None:
        return self.session.exec(
            select(PatientFamilyRelationship).where(
                PatientFamilyRelationship.tenant_id == tenant_id,
                PatientFamilyRelationship.patient_id == patient_id,
                PatientFamilyRelationship.related_patient_id == related_patient_id,
            )
        ).first()

    def active_for_patient(
        self, *, tenant_id: str, patient_id: str
    ) -> list[PatientFamilyRelationship]:
        return list(
            self.session.exec(
                select(PatientFamilyRelationship)
                .where(
                    PatientFamilyRelationship.tenant_id == tenant_id,
                    PatientFamilyRelationship.is_active == True,  # noqa: E712
                    or_(
                        PatientFamilyRelationship.patient_id == patient_id,
                        PatientFamilyRelationship.related_patient_id == patient_id,
                    ),
                )
                .order_by(PatientFamilyRelationship.created_at)
            ).all()
        )

    def active_related_patient_ids(
        self, *, tenant_id: str, patient_id: str
    ) -> list[str]:
        related_ids: list[str] = []
        for row in self.active_for_patient(tenant_id=tenant_id, patient_id=patient_id):
            if row.patient_id == patient_id:
                related_ids.append(row.related_patient_id)
            elif row.related_patient_id == patient_id:
                related_ids.append(row.patient_id)
        return list(dict.fromkeys(related_ids))


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
