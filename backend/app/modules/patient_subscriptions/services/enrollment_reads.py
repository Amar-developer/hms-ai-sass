from sqlmodel import Session

from app.modules.patient_subscriptions.models import PatientSubscriptionEnrollment
from app.modules.patient_subscriptions.repositories import (
    PatientSubscriptionPlanRepository,
)
from app.modules.patient_subscriptions.schemas import PatientSubscriptionEnrollmentRead
from app.modules.patient_subscriptions.services.eligibility import (
    resolve_current_enrollment,
)
from app.modules.patient_subscriptions.services.plan_reads import read_plan
from app.modules.patient_subscriptions.services.serialization import (
    free_items_from_json,
    usage_from_json,
)
from app.modules.patient_subscriptions.services.usage_sync import (
    sync_free_item_usage_from_invoices,
)


def read_enrollment(
    session: Session, enrollment: PatientSubscriptionEnrollment
) -> PatientSubscriptionEnrollmentRead:
    # Promote a queued enrollment if the patient's active plan has expired
    # since it was last read — the session identity map means this mutates
    # `enrollment` in place if it's the row being expired/promoted.
    resolve_current_enrollment(
        session, tenant_id=enrollment.tenant_id, patient_id=enrollment.patient_id
    )
    plan = PatientSubscriptionPlanRepository(session).get_for_tenant(
        enrollment.tenant_id, enrollment.plan_id
    )
    if plan:
        sync_free_item_usage_from_invoices(session, enrollment, plan)
    free_lab = free_items_from_json(plan.free_lab_test_ids_json) if plan else {}
    used_lab = usage_from_json(enrollment.used_free_lab_json)
    free_medicine = free_items_from_json(plan.free_medicine_ids_json) if plan else {}
    used_medicine = usage_from_json(enrollment.used_free_medicine_json)
    free_consultations = int(plan.free_consultations or 0) if plan else 0
    return PatientSubscriptionEnrollmentRead(
        **enrollment.model_dump(),
        allocated_free_consultations=free_consultations,
        remaining_free_consultations=max(
            free_consultations - int(enrollment.used_consultations or 0), 0
        ),
        used_free_lab_count=sum(used_lab.values()),
        remaining_free_lab_count=sum(
            max(int(limit or 0) - int(used_lab.get(item_id, 0) or 0), 0)
            for item_id, limit in free_lab.items()
        ),
        used_free_medicine_count=sum(used_medicine.values()),
        remaining_free_medicine_count=sum(
            max(int(limit or 0) - int(used_medicine.get(item_id, 0) or 0), 0)
            for item_id, limit in free_medicine.items()
        ),
        plan=read_plan(plan) if plan else None,
    )
