from __future__ import annotations

from sqlalchemy import func, select

from app.core.list_filters import (
    ListField,
    ListSpec,
    standard_audit_list_fields,
    standard_audit_sort_fields,
)
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionEnrollmentStatus,
    PatientSubscriptionPlan,
)
from app.modules.patients.models import (
    AlertSeverity,
    Gender,
    Patient,
    PatientAlert,
    PatientStatus,
)


contact_mobile = func.coalesce(
    func.nullif(Patient.mobile, ""),
    func.nullif(Patient.alternate_mobile, ""),
)

active_alert_count = (
    select(func.count(PatientAlert.id))
    .where(
        PatientAlert.tenant_id == Patient.tenant_id,
        PatientAlert.patient_id == Patient.id,
        PatientAlert.is_active.is_(True),
    )
    .correlate(Patient)
    .scalar_subquery()
)

critical_alert_count = (
    select(func.count(PatientAlert.id))
    .where(
        PatientAlert.tenant_id == Patient.tenant_id,
        PatientAlert.patient_id == Patient.id,
        PatientAlert.is_active.is_(True),
        PatientAlert.severity == AlertSeverity.CRITICAL,
    )
    .correlate(Patient)
    .scalar_subquery()
)

subscription_plan_name = (
    select(PatientSubscriptionPlan.name)
    .join(
        PatientSubscriptionEnrollment,
        PatientSubscriptionEnrollment.plan_id == PatientSubscriptionPlan.id,
    )
    .where(
        PatientSubscriptionEnrollment.tenant_id == Patient.tenant_id,
        PatientSubscriptionEnrollment.patient_id == Patient.id,
    )
    .order_by(PatientSubscriptionEnrollment.created_at.desc())
    .limit(1)
    .correlate(Patient)
    .scalar_subquery()
)

subscription_status = (
    select(PatientSubscriptionEnrollment.status)
    .where(
        PatientSubscriptionEnrollment.tenant_id == Patient.tenant_id,
        PatientSubscriptionEnrollment.patient_id == Patient.id,
    )
    .order_by(PatientSubscriptionEnrollment.created_at.desc())
    .limit(1)
    .correlate(Patient)
    .scalar_subquery()
)

PATIENT_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(Patient),
        "full_name": ListField(Patient.full_name, "text"),
        "patient_number": ListField(Patient.patient_number, "text"),
        "mobile": ListField(Patient.mobile, "text"),
        "contact_mobile": ListField(contact_mobile, "text"),
        "alternate_mobile": ListField(Patient.alternate_mobile, "text"),
        "guardian_name": ListField(Patient.guardian_name, "text"),
        "guardian_mobile": ListField(Patient.guardian_mobile, "text"),
        "area": ListField(Patient.area, "text"),
        "branch_id": ListField(Patient.branch_id, "select"),
        "gender": ListField(Patient.gender, "select", enum_type=Gender),
        "status": ListField(Patient.status, "select", enum_type=PatientStatus),
        "subscription_plan_name": ListField(subscription_plan_name, "select"),
        "subscription_status": ListField(
            subscription_status,
            "select",
            enum_type=PatientSubscriptionEnrollmentStatus,
        ),
        "age_years": ListField(Patient.age_years, "number"),
        "active_alert_count": ListField(active_alert_count, "number"),
        "critical_alert_count": ListField(critical_alert_count, "number"),
    },
    sort_fields={
        **standard_audit_sort_fields(Patient),
        "full_name": Patient.full_name,
        "patient_number": Patient.patient_number,
        "branch_id": Patient.branch_id,
        "gender": Patient.gender,
        "status": Patient.status,
        "age_years": Patient.age_years,
    },
)
