from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollmentStatus,
)
from app.modules.patients.models import AlertSeverity, Patient
from app.modules.patients.schemas import PatientSearchResult


def normalize_mobile(value: str | None) -> str:
    return "".join(character for character in (value or "") if character.isdigit())


def patient_search_result(
    patient: Patient,
    alert_counts: dict[str, int] | None = None,
    critical_counts: dict[str, int] | None = None,
    subscription_details: dict[str, dict[str, str]] | None = None,
) -> PatientSearchResult:
    subscription = (subscription_details or {}).get(patient.id, {})
    return PatientSearchResult(
        id=patient.id,
        tenant_id=patient.tenant_id,
        branch_id=patient.branch_id,
        patient_number=patient.patient_number,
        full_name=patient.full_name,
        mobile=patient.mobile,
        alternate_mobile=patient.alternate_mobile,
        guardian_name=patient.guardian_name,
        guardian_mobile=patient.guardian_mobile,
        area=patient.area,
        gender=patient.gender,
        age_years=patient.age_years,
        status=patient.status,
        created_at=patient.created_at,
        updated_at=patient.updated_at,
        active_alert_count=(alert_counts or {}).get(patient.id, 0),
        critical_alert_count=(critical_counts or {}).get(patient.id, 0),
        subscription_plan_name=subscription.get("plan_name"),
        subscription_status=subscription.get("status"),
    )


def alert_count_maps(
    patient_ids: list[str], alerts
) -> tuple[dict[str, int], dict[str, int]]:
    alert_counts = {patient_id: 0 for patient_id in patient_ids}
    critical_counts = {patient_id: 0 for patient_id in patient_ids}
    for alert in alerts:
        alert_counts[alert.patient_id] = alert_counts.get(alert.patient_id, 0) + 1
        if alert.severity == AlertSeverity.CRITICAL:
            critical_counts[alert.patient_id] = (
                critical_counts.get(alert.patient_id, 0) + 1
            )
    return alert_counts, critical_counts


def subscription_detail_map(enrollment_plan_rows) -> dict[str, dict[str, str]]:
    subscription_details: dict[str, dict[str, str]] = {}
    for enrollment, plan in enrollment_plan_rows:
        existing = subscription_details.get(enrollment.patient_id)
        if (
            existing
            and existing.get("status")
            == PatientSubscriptionEnrollmentStatus.ACTIVE.value
        ):
            continue
        if existing and enrollment.status != PatientSubscriptionEnrollmentStatus.ACTIVE:
            continue
        subscription_details[enrollment.patient_id] = {
            "plan_name": plan.name,
            "status": enrollment.status.value,
        }
    return subscription_details
