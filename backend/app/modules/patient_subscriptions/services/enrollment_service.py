from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import (
    enforce_entitlement,
    require_branch_in_tenant,
    require_user_branch_access,
    scoped_branch_id,
)
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.billing.models import Invoice, InvoiceItem, Payment
from app.modules.identity.models import User
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionEnrollmentStatus,
)
from app.modules.patient_subscriptions.repositories import (
    PatientSubscriptionEnrollmentRepository,
    PatientSubscriptionSupportRepository,
)
from app.modules.patient_subscriptions.schemas import (
    PatientSubscriptionEnrollmentCreate,
    PatientSubscriptionEnrollmentRead,
    PatientSubscriptionEnrollmentUpdate,
)
from app.modules.patient_subscriptions.services.eligibility import (
    enrollment_end_date,
    resolve_current_enrollment,
)
from app.modules.patient_subscriptions.services.enrollment_reads import read_enrollment
from app.modules.patient_subscriptions.services.validation import (
    _get_enrollment,
    _get_plan,
    _resolve_enrollment_branch,
    require_tenant_admin_or_super_admin,
)


def enroll_patient(
    session: Session,
    *,
    tenant_id: str,
    payload: PatientSubscriptionEnrollmentCreate,
    actor: User,
) -> PatientSubscriptionEnrollmentRead:
    # Local imports avoid module-load cycles between subscriptions and billing.
    from app.modules.billing.services.invoice_status import (
        update_invoice_payment_status,
    )
    from app.modules.billing.services.numbering import next_invoice_number

    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=actor)
    patient = PatientSubscriptionSupportRepository(session).get_patient_for_tenant(
        tenant_id, payload.patient_id
    )
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid patient"
        )
    plan = _get_plan(session, tenant_id, payload.plan_id)
    if not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patient subscription plan is inactive",
        )
    branch_id = _resolve_enrollment_branch(
        session,
        tenant_id=tenant_id,
        payload_branch_id=payload.branch_id,
        patient=patient,
        plan=plan,
    )
    require_user_branch_access(actor, branch_id)
    # A patient can hold only one ACTIVE enrollment tenant-wide at a time.
    # This check (and the queueing it enables) is status/date-based, not
    # payment-gated like active_patient_enrollment's benefit-eligibility
    # check below — an active-but-unpaid plan still occupies the slot.
    current = resolve_current_enrollment(
        session, tenant_id=tenant_id, patient_id=payload.patient_id
    )
    enrollment_repo = PatientSubscriptionEnrollmentRepository(session)
    if current:
        already_queued = enrollment_repo.status_rows_for_patient(
            tenant_id=tenant_id,
            patient_id=payload.patient_id,
            enrollment_status=PatientSubscriptionEnrollmentStatus.QUEUED,
        )
        if already_queued:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Patient already has a queued subscription",
            )
    paid_now = int(payload.paid_amount or 0)
    if paid_now > plan.price_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paid amount cannot exceed plan price",
        )
    if current:
        # Queued: not yet benefit-eligible. activated_on/ends_on are only a
        # display estimate here — resolve_current_enrollment recomputes them
        # for real (from the actual promotion date) once the current plan
        # expires or is cancelled, so an early cancellation doesn't leave a
        # stale estimate.
        enrollment_status = PatientSubscriptionEnrollmentStatus.QUEUED
        provisional_start = current.ends_on + timedelta(days=1)
        enrollment_ends_on = enrollment_end_date(provisional_start, plan)
    else:
        enrollment_status = PatientSubscriptionEnrollmentStatus.ACTIVE
        enrollment_ends_on = enrollment_end_date(payload.starts_on, plan)
    enrollment = PatientSubscriptionEnrollment(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=payload.patient_id,
        plan_id=payload.plan_id,
        starts_on=payload.starts_on,
        activated_on=payload.starts_on if not current else None,
        ends_on=enrollment_ends_on,
        status=enrollment_status,
        paid_amount=0,
        created_by_user_id=payload.created_by_user_id,
    )
    PatientSubscriptionEnrollmentRepository(session).add(enrollment)
    session.commit()
    session.refresh(enrollment)
    invoice = Invoice(
        tenant_id=tenant_id,
        branch_id=enrollment.branch_id,
        patient_id=enrollment.patient_id,
        patient_subscription_enrollment_id=enrollment.id,
        patient_subscription_plan_id=plan.id,
        invoice_number=next_invoice_number(
            session, tenant_id, branch_id=enrollment.branch_id
        ),
        subtotal_amount=plan.price_amount,
        discount_amount=0,
        taxable_amount=plan.price_amount,
        tax_amount=0,
        total_amount=plan.price_amount,
        paid_amount=0,
        balance_amount=plan.price_amount,
        doctor_share_amount=0,
        clinic_share_amount=plan.price_amount,
        created_by_user_id=payload.created_by_user_id,
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    session.add(
        InvoiceItem(
            tenant_id=tenant_id,
            invoice_id=invoice.id,
            item_type="patient_membership",
            description=f"Patient Membership Plan: {plan.name}",
            quantity=1,
            unit_amount=plan.price_amount,
            total_amount=plan.price_amount,
        )
    )
    enrollment.purchase_invoice_id = invoice.id
    session.add(enrollment)
    session.commit()
    if paid_now > 0:
        session.add(
            Payment(
                tenant_id=tenant_id,
                branch_id=enrollment.branch_id,
                invoice_id=invoice.id,
                method=payload.payment_method,
                amount=paid_now,
                collected_by_user_id=payload.created_by_user_id or actor.id,
            )
        )
        session.commit()
        invoice = update_invoice_payment_status(session, invoice)
        enrollment.paid_amount = invoice.paid_amount
        session.add(enrollment)
        session.commit()
    session.refresh(enrollment)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=enrollment.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="patient_subscription.enrolled",
        resource_type="patient_subscription_enrollment",
        resource_id=enrollment.id,
        purpose="patient_subscription_enrollment",
    )
    return read_enrollment(session, enrollment)


def list_enrollments(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    patient_id: str | None,
    actor: User,
) -> list[PatientSubscriptionEnrollmentRead]:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=actor)
    # Confine a branch-scoped user to their branch; honor an explicit branch
    # filter for tenant-wide users. Previously the branch_id param was ignored
    # entirely, exposing every branch's enrollments.
    if branch_id:
        require_branch_in_tenant(session, tenant_id, branch_id)
    effective_branch = scoped_branch_id(actor, branch_id)
    rows = PatientSubscriptionEnrollmentRepository(session).list_for_tenant(
        tenant_id=tenant_id,
        branch_id=effective_branch,
        patient_id=patient_id,
    )
    return [read_enrollment(session, row) for row in rows]


def update_enrollment(
    session: Session,
    *,
    tenant_id: str,
    enrollment_id: str,
    payload: PatientSubscriptionEnrollmentUpdate,
    actor: User,
) -> PatientSubscriptionEnrollmentRead:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=actor)
    require_tenant_admin_or_super_admin(session, tenant_id, actor)
    enrollment = _get_enrollment(session, tenant_id, enrollment_id)
    require_user_branch_access(actor, enrollment.branch_id)
    updates = payload.model_dump(exclude_unset=True)
    branch_id = updates.get("branch_id")
    if branch_id:
        require_branch_in_tenant(session, tenant_id, branch_id)
        require_user_branch_access(actor, branch_id)
    enrollment_fields = (
        "branch_id",
        "starts_on",
        "ends_on",
        "status",
        "used_consultations",
        "paid_amount",
    )
    before = {
        key: getattr(enrollment, key) for key in enrollment_fields if key in updates
    }
    for key in enrollment_fields:
        if key in updates:
            setattr(enrollment, key, updates[key])
    if enrollment.ends_on < enrollment.starts_on:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enrollment end date cannot be before start date",
        )
    if enrollment.status == PatientSubscriptionEnrollmentStatus.CANCELLED:
        enrollment.cancelled_by_user_id = payload.updated_by_user_id or actor.id
    enrollment.updated_at = datetime.now(timezone.utc)
    session.add(enrollment)
    session.commit()
    session.refresh(enrollment)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=enrollment.branch_id,
        actor_user_id=payload.updated_by_user_id or actor.id,
        action="patient_subscription_enrollment.updated",
        resource_type="patient_subscription_enrollment",
        resource_id=enrollment.id,
        purpose="patient_subscription_enrollment",
        changes=diff_changes(before, {key: getattr(enrollment, key) for key in before}),
    )
    return read_enrollment(session, enrollment)


def delete_enrollment(
    session: Session, *, tenant_id: str, enrollment_id: str, actor: User
) -> None:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=actor)
    require_tenant_admin_or_super_admin(session, tenant_id, actor)
    enrollment = _get_enrollment(session, tenant_id, enrollment_id)
    require_user_branch_access(actor, enrollment.branch_id)
    benefit_invoice = PatientSubscriptionSupportRepository(
        session
    ).first_benefit_invoice(
        tenant_id=tenant_id,
        enrollment_id=enrollment.id,
    )
    if benefit_invoice:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete enrollment with claimed membership benefits. Cancel it instead.",
        )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=enrollment.branch_id,
        actor_user_id=actor.id,
        action="patient_subscription_enrollment.deleted",
        resource_type="patient_subscription_enrollment",
        resource_id=enrollment.id,
        purpose="patient_subscription_enrollment",
    )
    tenant_id_for_promotion = enrollment.tenant_id
    patient_id_for_promotion = enrollment.patient_id
    session.delete(enrollment)
    session.commit()
    # If the deleted row was the occupying ACTIVE enrollment, promote the
    # next queued one immediately rather than waiting for the next read.
    resolve_current_enrollment(
        session,
        tenant_id=tenant_id_for_promotion,
        patient_id=patient_id_for_promotion,
    )
