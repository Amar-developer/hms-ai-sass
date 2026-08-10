from datetime import date

from sqlmodel import Session, select

from app.core.pagination import Page
from app.modules.patient_intelligence.models import (
    IntelligenceFlagStatus,
    PatientIntelligenceFlag,
    PatientIntelligenceRule,
)
from app.modules.patients.models import PatientStatus
from app.modules.patients.repositories import (
    PatientAlertRepository,
    PatientRepository,
    PatientSubscriptionReadRepository,
)
from app.modules.patients.schemas import (
    PatientIntelligenceFlagCompact,
    PatientSearchResult,
)
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
        self.session = session

    def _intelligence_flags(
        self, *, tenant_id: str, patient_ids: list[str]
    ) -> dict[str, list[PatientIntelligenceFlagCompact]]:
        if not patient_ids:
            return {}
        rows = self.session.exec(
            select(PatientIntelligenceFlag, PatientIntelligenceRule)
            .join(
                PatientIntelligenceRule,
                PatientIntelligenceRule.id == PatientIntelligenceFlag.rule_id,
            )
            .where(
                PatientIntelligenceFlag.tenant_id == tenant_id,
                PatientIntelligenceFlag.patient_id.in_(patient_ids),
                PatientIntelligenceFlag.status.notin_(
                    [IntelligenceFlagStatus.RESOLVED, IntelligenceFlagStatus.CLOSED]
                ),
                PatientIntelligenceRule.is_enabled.is_(True),
                PatientIntelligenceRule.display_as_patient_badge.is_(True),
            )
        ).all()
        rows.sort(
            key=lambda item: (
                item[0].patient_id,
                item[1].priority,
                item[1].rule_key,
            )
        )
        result: dict[str, list[PatientIntelligenceFlagCompact]] = {}
        for flag, rule in rows:
            if not all(
                [
                    rule.badge_label,
                    rule.badge_background_color,
                    rule.badge_text_color,
                    rule.badge_border_color,
                ]
            ):
                continue
            result.setdefault(flag.patient_id, []).append(
                PatientIntelligenceFlagCompact(
                    flag_key=flag.flag_key,
                    category=flag.category.value,
                    severity=flag.severity,
                    explanation=flag.explanation,
                    label=rule.badge_label,
                    background_color=rule.badge_background_color,
                    text_color=rule.badge_text_color,
                    border_color=rule.badge_border_color,
                    priority=rule.priority,
                )
            )
        return result

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
        intelligence_flags = self._intelligence_flags(
            tenant_id=tenant_id, patient_ids=patient_ids
        )

        return [
            patient_search_result(
                patient,
                alert_counts,
                critical_counts,
                subscription_details,
                intelligence_flags,
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
        intelligence_flags = self._intelligence_flags(
            tenant_id=tenant_id,
            patient_ids=[patient.id for patient in patients],
        )
        return [
            patient_search_result(patient, intelligence_flags=intelligence_flags)
            for patient in patients
        ]
