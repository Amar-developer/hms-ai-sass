from datetime import date

from sqlmodel import Session

from app.core.pagination import Page
from app.modules.patients.models import PatientStatus
from app.modules.patients.repositories import (
    PatientAlertRepository,
    PatientRepository,
    PatientSubscriptionReadRepository,
)
from app.modules.patients.schemas import PatientSearchResult
from app.modules.patients.services.mappers import (
    alert_count_maps,
    patient_search_result,
    subscription_detail_map,
)


class PatientSearchService:
    def __init__(self, session: Session):
        self.patients = PatientRepository(session)
        self.alerts = PatientAlertRepository(session)
        self.subscriptions = PatientSubscriptionReadRepository(session)

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
    ) -> list[PatientSearchResult]:
        patients = self.patients.search(
            tenant_id=tenant_id,
            q=q,
            branch_id=branch_id,
            active_only=active_only,
            status=status,
            gender=gender,
            from_date=from_date,
            to_date=to_date,
            offset=offset,
            limit=limit,
        )
        patient_ids = [patient.id for patient in patients]
        alerts = self.alerts.active_for_patients(
            tenant_id=tenant_id,
            patient_ids=patient_ids,
        )
        alert_counts, critical_counts = alert_count_maps(patient_ids, alerts)
        subscription_details = subscription_detail_map(
            self.subscriptions.enrollment_plan_rows(
                tenant_id=tenant_id,
                patient_ids=patient_ids,
            )
        )

        return [
            patient_search_result(
                patient,
                alert_counts,
                critical_counts,
                subscription_details,
            )
            for patient in patients
        ]

    def search_page(
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
        offset: int,
        limit: int,
    ) -> Page[PatientSearchResult]:
        items = self.search(
            tenant_id=tenant_id,
            q=q,
            branch_id=branch_id,
            active_only=active_only,
            status=status,
            gender=gender,
            from_date=from_date,
            to_date=to_date,
            offset=offset,
            limit=limit,
        )
        total = self.patients.count_search(
            tenant_id=tenant_id,
            q=q,
            branch_id=branch_id,
            active_only=active_only,
            status=status,
            gender=gender,
            from_date=from_date,
            to_date=to_date,
        )
        return Page(items=items, total=total, limit=limit, offset=offset)

    def references(
        self, *, tenant_id: str, patient_ids: list[str]
    ) -> list[PatientSearchResult]:
        patients = self.patients.list_references(
            tenant_id=tenant_id, patient_ids=patient_ids
        )
        return [patient_search_result(patient) for patient in patients]
