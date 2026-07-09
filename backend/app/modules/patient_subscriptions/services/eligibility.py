from datetime import date, timedelta

from sqlmodel import Session

from app.modules.billing.models import Invoice
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionEnrollmentStatus,
    PatientSubscriptionPlan,
)
from app.modules.patient_subscriptions.repositories import (
    PatientSubscriptionEnrollmentRepository,
    PatientSubscriptionPlanRepository,
)
from app.modules.patient_subscriptions.services.serialization import ids_from_json
from app.modules.tenants.models import Department


def _department_key(value: str | None) -> str:
    return " ".join(
        "".join(
            character.lower() if character.isalnum() else " "
            for character in str(value or "")
        ).split()
    )


def consultation_department_is_eligible(
    session: Session | None,
    *,
    plan: PatientSubscriptionPlan,
    department_id: str | None,
) -> bool:
    """Match selected plan departments across equivalent branch mappings."""
    allowed_ids = set(ids_from_json(plan.free_consultation_department_ids_json))
    if not allowed_ids:
        return True
    if not department_id:
        return False
    if department_id in allowed_ids:
        return True
    if session is None:
        return False

    actual = session.get(Department, department_id)
    if not actual or actual.tenant_id != plan.tenant_id:
        return False
    actual_template_ids = {actual.id, actual.source_template_department_id}
    actual_template_ids.discard(None)
    actual_name = _department_key(actual.name)
    for allowed_id in allowed_ids:
        allowed = session.get(Department, allowed_id)
        if not allowed or allowed.tenant_id != plan.tenant_id:
            continue
        allowed_template_ids = {allowed.id, allowed.source_template_department_id}
        allowed_template_ids.discard(None)
        if actual_template_ids.intersection(allowed_template_ids):
            return True
        if actual_name and actual_name == _department_key(allowed.name):
            return True
    return False


def enrollment_end_date(starts_on: date, plan: PatientSubscriptionPlan) -> date:
    return starts_on + timedelta(days=max(plan.duration_days, 1) - 1)


def resolve_current_enrollment(
    session: Session, *, tenant_id: str, patient_id: str
) -> PatientSubscriptionEnrollment | None:
    """Return the patient's current occupying enrollment, promoting a queued
    one first if the prior active plan has expired.

    A patient can hold only one ACTIVE enrollment tenant-wide at a time. This
    is the single lazy-activation trigger for the whole feature: it runs on
    every read/benefit-check (mirroring the existing on-read usage-sync
    pattern), so no background job is needed. Any ACTIVE row past its
    ends_on is flipped to EXPIRED here, then the oldest QUEUED row (if any)
    is promoted to ACTIVE with activated_on set to today — so its own
    activation_after_days delay counts from the real activation date, not
    the original purchase date.
    """
    repo = PatientSubscriptionEnrollmentRepository(session)
    today = date.today()
    active_rows = repo.status_rows_for_patient(
        tenant_id=tenant_id,
        patient_id=patient_id,
        enrollment_status=PatientSubscriptionEnrollmentStatus.ACTIVE,
    )
    current: PatientSubscriptionEnrollment | None = None
    dirty = False
    for row in active_rows:
        if row.ends_on >= today:
            if current is None:
                current = row
        else:
            row.status = PatientSubscriptionEnrollmentStatus.EXPIRED
            session.add(row)
            dirty = True
    if current:
        if dirty:
            session.commit()
        return current

    queued_rows = repo.status_rows_for_patient(
        tenant_id=tenant_id,
        patient_id=patient_id,
        enrollment_status=PatientSubscriptionEnrollmentStatus.QUEUED,
    )
    if not queued_rows:
        if dirty:
            session.commit()
        return None
    next_enrollment = queued_rows[0]
    plan = PatientSubscriptionPlanRepository(session).get_for_tenant(
        tenant_id, next_enrollment.plan_id
    )
    if not plan:
        if dirty:
            session.commit()
        return None
    next_enrollment.activated_on = today
    next_enrollment.ends_on = enrollment_end_date(today, plan)
    next_enrollment.status = PatientSubscriptionEnrollmentStatus.ACTIVE
    session.add(next_enrollment)
    session.commit()
    session.refresh(next_enrollment)
    return next_enrollment


def active_patient_enrollment(
    session: Session,
    *,
    tenant_id: str,
    patient_id: str,
) -> tuple[PatientSubscriptionEnrollment, PatientSubscriptionPlan] | None:
    """Return the patient's active tenant-wide membership, if benefit-eligible.

    Membership benefits and the one-active-plan-at-a-time rule are both
    tenant-wide, not branch-scoped: a patient enrolled from one branch can
    claim benefits from another branch in the same tenant, and can't hold two
    simultaneous active plans across branches either.
    """
    enrollment = resolve_current_enrollment(
        session, tenant_id=tenant_id, patient_id=patient_id
    )
    if not enrollment:
        return None
    plan = PatientSubscriptionPlanRepository(session).get_for_tenant(
        tenant_id, enrollment.plan_id
    )
    if not plan or plan.tenant_id != tenant_id or not plan.is_active:
        return None
    today = date.today()
    activation_anchor = enrollment.activated_on or enrollment.starts_on
    activation_date = activation_anchor + timedelta(
        days=max(plan.activation_after_days, 0)
    )
    if today < activation_date:
        return None
    if plan.price_amount > 0:
        if enrollment.purchase_invoice_id:
            invoice = session.get(Invoice, enrollment.purchase_invoice_id)
            if (
                not invoice
                or invoice.tenant_id != tenant_id
                or invoice.balance_amount > 0
            ):
                return None
        elif enrollment.paid_amount < plan.price_amount:
            return None
    return enrollment, plan


def consultation_department_id(
    session: Session,
    *,
    appointment_id: str | None = None,
    consultation_id: str | None = None,
) -> str | None:
    """Resolve the medical department for a consultation, via its appointment."""
    from app.modules.appointments.models import Appointment
    from app.modules.consultations.models import Consultation

    if appointment_id:
        appointment = session.get(Appointment, appointment_id)
        if appointment and appointment.department_id:
            return appointment.department_id
    if consultation_id:
        consultation = session.get(Consultation, consultation_id)
        if consultation and consultation.appointment_id:
            appointment = session.get(Appointment, consultation.appointment_id)
            if appointment and appointment.department_id:
                return appointment.department_id
    return None
