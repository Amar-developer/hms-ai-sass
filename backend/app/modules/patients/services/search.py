from sqlmodel import Session

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
        limit: int = 25,
    ) -> list[PatientSearchResult]:
        patients = self.patients.search(
            tenant_id=tenant_id,
            q=q,
            branch_id=branch_id,
            active_only=active_only,
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
