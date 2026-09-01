import json
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
from app.modules.billing.models import Invoice, InvoiceItem, InvoiceStatus, Payment
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.identity.services.policy import assert_tenant_permission
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionEnrollmentStatus,
)
from app.modules.patient_subscriptions.repositories import (
    PatientSubscriptionEnrollmentRepository,
    PatientSubscriptionSupportRepository,
)
from app.modules.patient_subscriptions.schemas import (
    PatientSubscriptionBenefitUsageUpdate,
    PatientSubscriptionEnrollmentCreate,
    PatientSubscriptionEnrollmentRead,
    PatientSubscriptionEnrollmentUpdate,
)
from app.modules.patient_subscriptions.services.eligibility import (
    enrollment_end_date,
    resolve_current_enrollment,
)
from app.modules.patient_subscriptions.services.enrollment_reads import read_enrollment
from app.modules.patient_subscriptions.services.serialization import (
    free_items_from_json,
    usage_from_json,
    usage_to_json,
)
from app.modules.patient_subscriptions.services.usage_sync import (
    invoice_benefit_usage,
    sync_free_item_usage_from_invoices,
)
from app.modules.patients.services.references import patient_reference_map
from app.modules.patient_subscriptions.services.validation import (
    _get_enrollment,
    _get_plan,
    _resolve_enrollment_branch,
    require_tenant_admin,
)


def enroll_patient(
    session: Session,
    *,
    tenant_id: str,
    payload: PatientSubscriptionEnrollmentCreate,
    actor: User,
) -> PatientSubscriptionEnrollmentRead:
    # Local imports avoid module-load cycles between subscriptions and billing.
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
        if current.plan_id == payload.plan_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Patient is already enrolled in this active membership plan. "
                    "Select a different renewal plan after the current plan ends."
                ),
            )
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
        enrollment_starts_on = provisional_start
        enrollment_ends_on = enrollment_end_date(provisional_start, plan)
    else:
        enrollment_status = PatientSubscriptionEnrollmentStatus.ACTIVE
        enrollment_starts_on = payload.starts_on
        enrollment_ends_on = enrollment_end_date(payload.starts_on, plan)
    enrollment = PatientSubscriptionEnrollment(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=payload.patient_id,
        plan_id=payload.plan_id,
        starts_on=enrollment_starts_on,
        activated_on=payload.starts_on if not current else None,
        ends_on=enrollment_ends_on,
        status=enrollment_status,
        paid_amount=0,
        created_by_user_id=payload.created_by_user_id,
    )
    PatientSubscriptionEnrollmentRepository(session).add(enrollment)
    # Keep enrollment, invoice, line item, optional payment, and audit in one
    # transaction. A dropped/failed request must never leave behind a partial
    # membership purchase that cannot be invoiced or safely retried.
    session.flush()
    balance_amount = max(int(plan.price_amount or 0) - paid_now, 0)
    if int(plan.price_amount or 0) <= 0 or balance_amount <= 0:
        invoice_status = InvoiceStatus.PAID
    elif paid_now > 0:
        invoice_status = InvoiceStatus.PARTIALLY_PAID
    else:
        invoice_status = InvoiceStatus.ISSUED
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
        paid_amount=paid_now,
        balance_amount=balance_amount,
        status=invoice_status,
        doctor_share_amount=0,
        clinic_share_amount=plan.price_amount,
        created_by_user_id=payload.created_by_user_id,
    )
    session.add(invoice)
    session.flush()
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
    enrollment.paid_amount = paid_now
    session.add(enrollment)
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
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=enrollment.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="patient_subscription.enrolled",
        resource_type="patient_subscription_enrollment",
        resource_id=enrollment.id,
        purpose="patient_subscription_enrollment",
        commit=False,
    )
    session.commit()
    session.refresh(enrollment)
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
    patients = patient_reference_map(
        session,
        tenant_id=tenant_id,
        patient_ids={row.patient_id for row in rows},
    )
    return [read_enrollment(session, row, patients.get(row.patient_id)) for row in rows]


def update_enrollment(
    session: Session,
    *,
    tenant_id: str,
    enrollment_id: str,
    payload: PatientSubscriptionEnrollmentUpdate,
    actor: User,
) -> PatientSubscriptionEnrollmentRead:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=actor)
    assert_tenant_permission(
        session,
        actor,
        tenant_id,
        permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
        permissions.PATIENT_SUBSCRIPTIONS_EDIT,
        permissions.SETTINGS_MANAGE,
    )
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


def update_benefit_usage(
    session: Session,
    *,
    tenant_id: str,
    enrollment_id: str,
    payload: PatientSubscriptionBenefitUsageUpdate,
    actor: User,
) -> PatientSubscriptionEnrollmentRead:
    """Set the total consumed benefits while retaining invoice-backed usage."""
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=actor)
    require_tenant_admin(session, tenant_id, actor)
    enrollment = _get_enrollment(session, tenant_id, enrollment_id)
    plan = _get_plan(session, tenant_id, enrollment.plan_id)
    require_user_branch_access(actor, enrollment.branch_id)

    reason = payload.reason.strip()
    if len(reason) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Benefit usage adjustment reason must be at least 2 characters",
        )

    consultation_limit = int(plan.free_consultations or 0)
    lab_limits = free_items_from_json(plan.free_lab_test_ids_json)
    medicine_limits = free_items_from_json(plan.free_medicine_ids_json)
    requested_lab = {
        str(key): int(value) for key, value in payload.used_free_lab_quantities.items()
    }
    requested_medicine = {
        str(key): int(value)
        for key, value in payload.used_free_medicine_quantities.items()
    }

    def validate_items(
        *, label: str, requested: dict[str, int], limits: dict[str, int]
    ) -> None:
        unknown = sorted(set(requested) - set(limits))
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{label} benefit is not included in this plan: {unknown[0]}",
            )
        for item_id, count in requested.items():
            if count < 0 or count > int(limits[item_id]):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"{label} usage for {item_id} must be between 0 and "
                        f"{int(limits[item_id])}"
                    ),
                )

    if payload.used_consultations > consultation_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Consultation usage must be between 0 and {consultation_limit}",
        )
    validate_items(label="Lab", requested=requested_lab, limits=lab_limits)
    validate_items(
        label="Medicine", requested=requested_medicine, limits=medicine_limits
    )

    invoice_consultations, invoice_lab, invoice_medicine, _ = invoice_benefit_usage(
        session, enrollment, plan
    )
    if payload.used_consultations < invoice_consultations:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Consultation usage cannot be lower than usage recorded on invoices "
                f"({invoice_consultations})"
            ),
        )
    for label, requested, recorded in (
        ("Lab", requested_lab, invoice_lab),
        ("Medicine", requested_medicine, invoice_medicine),
    ):
        for item_id, recorded_count in recorded.items():
            if int(requested.get(item_id, 0)) < int(recorded_count):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"{label} usage for {item_id} cannot be lower than invoice "
                        f"usage ({recorded_count})"
                    ),
                )

    sync_free_item_usage_from_invoices(session, enrollment, plan)
    before = {
        "used_consultations": int(enrollment.used_consultations or 0),
        "used_free_lab_quantities": usage_from_json(enrollment.used_free_lab_json),
        "used_free_medicine_quantities": usage_from_json(
            enrollment.used_free_medicine_json
        ),
    }
    enrollment.manual_used_consultations = (
        payload.used_consultations - invoice_consultations
    )
    enrollment.manual_used_free_lab_json = usage_to_json(
        {
            item_id: int(requested_lab.get(item_id, 0))
            - int(invoice_lab.get(item_id, 0))
            for item_id in lab_limits
        }
    )
    enrollment.manual_used_free_medicine_json = usage_to_json(
        {
            item_id: int(requested_medicine.get(item_id, 0))
            - int(invoice_medicine.get(item_id, 0))
            for item_id in medicine_limits
        }
    )
    sync_free_item_usage_from_invoices(session, enrollment, plan)
    enrollment.updated_at = datetime.now(timezone.utc)
    after = {
        "used_consultations": int(enrollment.used_consultations or 0),
        "used_free_lab_quantities": usage_from_json(enrollment.used_free_lab_json),
        "used_free_medicine_quantities": usage_from_json(
            enrollment.used_free_medicine_json
        ),
    }
    session.add(enrollment)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=enrollment.branch_id,
        actor_user_id=actor.id,
        action="patient_subscription.benefit_usage_adjusted",
        resource_type="patient_subscription_enrollment",
        resource_id=enrollment.id,
        purpose="patient_subscription_benefit_usage_correction",
        metadata_json=json.dumps({"reason": reason}),
        changes=diff_changes(before, after),
        commit=False,
    )
    session.commit()
    session.refresh(enrollment)
    return read_enrollment(session, enrollment)


def delete_enrollment(
    session: Session, *, tenant_id: str, enrollment_id: str, actor: User
) -> None:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=actor)
    assert_tenant_permission(
        session,
        actor,
        tenant_id,
        permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
        permissions.PATIENT_SUBSCRIPTIONS_DELETE,
        permissions.SETTINGS_MANAGE,
    )
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
