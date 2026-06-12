from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.access_control import enforce_entitlement, require_branch_in_tenant, require_user_branch_access
from app.core.auth import require_any_permission, user_role_keys
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import Invoice, InvoiceItem, Payment
from app.modules.billing.service import next_invoice_number, update_invoice_payment_status
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionEnrollmentStatus,
    PatientSubscriptionPlan,
)
from app.modules.patient_subscriptions.schemas import (
    PatientBenefitPreviewRead,
    PatientBenefitPreviewRequest,
    PatientSubscriptionEnrollmentCreate,
    PatientSubscriptionEnrollmentRead,
    PatientSubscriptionEnrollmentUpdate,
    PatientSubscriptionPlanCreate,
    PatientSubscriptionPlanRead,
    PatientSubscriptionPlanUpdate,
)
from app.modules.patient_subscriptions.service import (
    active_patient_enrollment,
    benefit_preview,
    enrollment_end_date,
    free_items_to_json,
    ids_to_json,
    plan_to_read_dict,
    slabs_to_json,
)
from app.modules.patients.models import Patient
from app.modules.tenants.models import Branch

router = APIRouter(prefix="/patient-subscriptions")


def _read_plan(plan: PatientSubscriptionPlan) -> PatientSubscriptionPlanRead:
    return PatientSubscriptionPlanRead(**plan_to_read_dict(plan))


def _read_enrollment(session: Session, enrollment: PatientSubscriptionEnrollment) -> PatientSubscriptionEnrollmentRead:
    plan = session.get(PatientSubscriptionPlan, enrollment.plan_id)
    return PatientSubscriptionEnrollmentRead(
        **enrollment.model_dump(),
        plan=_read_plan(plan) if plan else None,
    )


def _get_plan(session: Session, tenant_id: str, plan_id: str) -> PatientSubscriptionPlan:
    plan = session.get(PatientSubscriptionPlan, plan_id)
    if not plan or plan.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient subscription plan not found")
    return plan


def _get_enrollment(session: Session, tenant_id: str, enrollment_id: str) -> PatientSubscriptionEnrollment:
    enrollment = session.get(PatientSubscriptionEnrollment, enrollment_id)
    if not enrollment or enrollment.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient subscription enrollment not found")
    return enrollment


def _require_tenant_admin_or_super_admin(session: Session, tenant_id: str, user: User) -> None:
    if user.is_super_admin:
        return
    roles = user_role_keys(session, user)
    if user.tenant_id == tenant_id and (user.user_type == "tenant_admin" or "tenant_admin" in roles):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant admin access required")


def _resolve_enrollment_branch(
    session: Session,
    *,
    tenant_id: str,
    payload_branch_id: str | None,
    patient: Patient,
    plan: PatientSubscriptionPlan,
) -> str:
    # Membership is tenant-scoped for benefit claims. Keep a branch on the
    # enrollment for invoice numbering/access, but prefer the patient's home
    # branch and do not treat the plan branch as a claim boundary.
    branch_id = patient.branch_id or payload_branch_id or plan.branch_id
    if not branch_id:
        branch_id = session.exec(
            select(Branch.id)
            .where(Branch.tenant_id == tenant_id, Branch.is_active == True)  # noqa: E712
            .order_by(Branch.created_at, Branch.name)
        ).first()
    if not branch_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select a branch before enrolling the patient in a membership plan",
        )
    require_branch_in_tenant(session, tenant_id, branch_id)
    return branch_id


@router.post("/plans", response_model=PatientSubscriptionPlanRead, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: PatientSubscriptionPlanCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.PATIENT_SUBSCRIPTIONS_MANAGE, permissions.SETTINGS_MANAGE)),
) -> PatientSubscriptionPlanRead:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=current_user)
    name_norm = (payload.name or "").strip().lower()
    duplicate = session.exec(
        select(PatientSubscriptionPlan).where(
            PatientSubscriptionPlan.tenant_id == tenant_id,
            PatientSubscriptionPlan.is_active == True,  # noqa: E712
        )
    ).all()
    if any((existing.name or "").strip().lower() == name_norm for existing in duplicate):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active subscription plan with this name already exists for this tenant",
        )
    plan_data = payload.model_dump(
        exclude={
            "branch_id",
            "pharmacy_discount_slabs",
            "free_consultation_department_ids",
            "free_lab_test_ids",
            "free_lab_test_quantities",
            "discounted_lab_test_ids",
            "free_medicine_ids",
            "free_medicine_quantities",
            "discounted_medicine_ids",
        }
    )
    plan = PatientSubscriptionPlan(
        **plan_data,
        tenant_id=tenant_id,
        branch_id=None,
        pharmacy_discount_slabs_json=slabs_to_json(payload.pharmacy_discount_slabs),
        free_consultation_department_ids_json=ids_to_json(payload.free_consultation_department_ids),
        free_lab_test_ids_json=free_items_to_json(payload.free_lab_test_ids, payload.free_lab_test_quantities),
        discounted_lab_test_ids_json=ids_to_json(payload.discounted_lab_test_ids),
        free_medicine_ids_json=free_items_to_json(payload.free_medicine_ids, payload.free_medicine_quantities),
        discounted_medicine_ids_json=ids_to_json(payload.discounted_medicine_ids),
    )
    session.add(plan)
    session.commit()
    session.refresh(plan)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=None,
        actor_user_id=payload.created_by_user_id,
        action="patient_subscription_plan.created",
        resource_type="patient_subscription_plan",
        resource_id=plan.id,
        purpose="patient_subscription_configuration",
    )
    return _read_plan(plan)


@router.get("/plans", response_model=list[PatientSubscriptionPlanRead])
def list_plans(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    include_inactive: bool = False,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SETTINGS_MANAGE,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_READ,
        )
    ),
) -> list[PatientSubscriptionPlanRead]:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=current_user)
    statement = select(PatientSubscriptionPlan).where(PatientSubscriptionPlan.tenant_id == tenant_id)
    if not include_inactive:
        statement = statement.where(PatientSubscriptionPlan.is_active == True)  # noqa: E712
    return [_read_plan(plan) for plan in session.exec(statement.order_by(PatientSubscriptionPlan.created_at.desc())).all()]


@router.patch("/plans/{plan_id}", response_model=PatientSubscriptionPlanRead)
def update_plan(
    plan_id: str,
    payload: PatientSubscriptionPlanUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.PATIENT_SUBSCRIPTIONS_MANAGE, permissions.SETTINGS_MANAGE)),
) -> PatientSubscriptionPlanRead:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=current_user)
    plan = _get_plan(session, tenant_id, plan_id)
    updates = payload.model_dump(exclude_unset=True)
    updates.pop("branch_id", None)
    free_lab_quantities = updates.pop("free_lab_test_quantities", None)
    free_medicine_quantities = updates.pop("free_medicine_quantities", None)
    if "free_lab_test_ids" in updates:
        plan.free_lab_test_ids_json = free_items_to_json(updates.pop("free_lab_test_ids"), free_lab_quantities)
    if "free_medicine_ids" in updates:
        plan.free_medicine_ids_json = free_items_to_json(updates.pop("free_medicine_ids"), free_medicine_quantities)
    for source, target in [
        ("pharmacy_discount_slabs", "pharmacy_discount_slabs_json"),
        ("free_consultation_department_ids", "free_consultation_department_ids_json"),
        ("discounted_lab_test_ids", "discounted_lab_test_ids_json"),
        ("discounted_medicine_ids", "discounted_medicine_ids_json"),
    ]:
        if source in updates:
            value = updates.pop(source)
            setattr(plan, target, slabs_to_json(value) if source == "pharmacy_discount_slabs" else ids_to_json(value))
    for key, value in updates.items():
        setattr(plan, key, value)
    plan.branch_id = None
    plan.updated_at = datetime.now(timezone.utc)
    session.add(plan)
    session.commit()
    session.refresh(plan)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=None,
        actor_user_id=payload.updated_by_user_id or current_user.id,
        action="patient_subscription_plan.updated",
        resource_type="patient_subscription_plan",
        resource_id=plan.id,
        purpose="patient_subscription_configuration",
    )
    return _read_plan(plan)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    plan_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.PATIENT_SUBSCRIPTIONS_MANAGE, permissions.SETTINGS_MANAGE)),
) -> None:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=current_user)
    _require_tenant_admin_or_super_admin(session, tenant_id, current_user)
    plan = _get_plan(session, tenant_id, plan_id)
    # Soft-delete: deactivate the plan instead of removing it, so existing patient
    # enrollments and their records (invoices, history) are preserved.
    plan.is_active = False
    plan.updated_by_user_id = current_user.id
    plan.updated_at = datetime.now(timezone.utc)
    session.add(plan)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=plan.branch_id,
        actor_user_id=current_user.id,
        action="patient_subscription_plan.deactivated",
        resource_type="patient_subscription_plan",
        resource_id=plan.id,
        purpose="patient_subscription_configuration",
    )


@router.post("/enrollments", response_model=PatientSubscriptionEnrollmentRead, status_code=status.HTTP_201_CREATED)
def enroll_patient(
    payload: PatientSubscriptionEnrollmentCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_CREATE,
            permissions.SETTINGS_MANAGE,
            permissions.IDENTITY_USERS_MANAGE,
        )
    ),
) -> PatientSubscriptionEnrollmentRead:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=current_user)
    patient = session.get(Patient, payload.patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid patient")
    plan = _get_plan(session, tenant_id, payload.plan_id)
    if not plan.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Patient subscription plan is inactive")
    branch_id = _resolve_enrollment_branch(
        session,
        tenant_id=tenant_id,
        payload_branch_id=payload.branch_id,
        patient=patient,
        plan=plan,
    )
    require_user_branch_access(current_user, branch_id)
    existing = active_patient_enrollment(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=payload.patient_id,
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Patient already has an active subscription")
    paid_now = int(payload.paid_amount or 0)
    if paid_now > plan.price_amount:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Paid amount cannot exceed plan price")
    enrollment = PatientSubscriptionEnrollment(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=payload.patient_id,
        plan_id=payload.plan_id,
        starts_on=payload.starts_on,
        ends_on=enrollment_end_date(payload.starts_on, plan),
        paid_amount=0,
        created_by_user_id=payload.created_by_user_id,
    )
    session.add(enrollment)
    session.commit()
    session.refresh(enrollment)
    invoice = Invoice(
        tenant_id=tenant_id,
        branch_id=enrollment.branch_id,
        patient_id=enrollment.patient_id,
        patient_subscription_enrollment_id=enrollment.id,
        patient_subscription_plan_id=plan.id,
        invoice_number=next_invoice_number(session, tenant_id, branch_id=enrollment.branch_id),
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
                collected_by_user_id=payload.created_by_user_id or current_user.id,
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
    return _read_enrollment(session, enrollment)


@router.get("/enrollments", response_model=list[PatientSubscriptionEnrollmentRead])
def list_enrollments(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    patient_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SETTINGS_MANAGE,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_READ,
        )
    ),
) -> list[PatientSubscriptionEnrollmentRead]:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=current_user)
    statement = select(PatientSubscriptionEnrollment).where(PatientSubscriptionEnrollment.tenant_id == tenant_id)
    if patient_id:
        statement = statement.where(PatientSubscriptionEnrollment.patient_id == patient_id)
    rows = session.exec(statement.order_by(PatientSubscriptionEnrollment.created_at.desc())).all()
    return [_read_enrollment(session, row) for row in rows]


@router.patch("/enrollments/{enrollment_id}", response_model=PatientSubscriptionEnrollmentRead)
def update_enrollment(
    enrollment_id: str,
    payload: PatientSubscriptionEnrollmentUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.PATIENT_SUBSCRIPTIONS_MANAGE, permissions.SETTINGS_MANAGE)),
) -> PatientSubscriptionEnrollmentRead:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=current_user)
    _require_tenant_admin_or_super_admin(session, tenant_id, current_user)
    enrollment = _get_enrollment(session, tenant_id, enrollment_id)
    require_user_branch_access(current_user, enrollment.branch_id)
    updates = payload.model_dump(exclude_unset=True)
    branch_id = updates.get("branch_id")
    if branch_id:
        require_branch_in_tenant(session, tenant_id, branch_id)
        require_user_branch_access(current_user, branch_id)
    for key in ("branch_id", "starts_on", "ends_on", "status", "used_consultations", "paid_amount"):
        if key in updates:
            setattr(enrollment, key, updates[key])
    if enrollment.ends_on < enrollment.starts_on:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enrollment end date cannot be before start date")
    if enrollment.status == PatientSubscriptionEnrollmentStatus.CANCELLED:
        enrollment.cancelled_by_user_id = payload.updated_by_user_id or current_user.id
    enrollment.updated_at = datetime.now(timezone.utc)
    session.add(enrollment)
    session.commit()
    session.refresh(enrollment)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=enrollment.branch_id,
        actor_user_id=payload.updated_by_user_id or current_user.id,
        action="patient_subscription_enrollment.updated",
        resource_type="patient_subscription_enrollment",
        resource_id=enrollment.id,
        purpose="patient_subscription_enrollment",
    )
    return _read_enrollment(session, enrollment)


@router.delete("/enrollments/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_enrollment(
    enrollment_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.PATIENT_SUBSCRIPTIONS_MANAGE, permissions.SETTINGS_MANAGE)),
) -> None:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=current_user)
    _require_tenant_admin_or_super_admin(session, tenant_id, current_user)
    enrollment = _get_enrollment(session, tenant_id, enrollment_id)
    require_user_branch_access(current_user, enrollment.branch_id)
    benefit_invoice = session.exec(
        select(Invoice).where(
            Invoice.tenant_id == tenant_id,
            Invoice.patient_subscription_enrollment_id == enrollment.id,
            Invoice.membership_discount_amount > 0,
        )
    ).first()
    if benefit_invoice:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete enrollment with claimed membership benefits. Cancel it instead.",
        )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=enrollment.branch_id,
        actor_user_id=current_user.id,
        action="patient_subscription_enrollment.deleted",
        resource_type="patient_subscription_enrollment",
        resource_id=enrollment.id,
        purpose="patient_subscription_enrollment",
    )
    session.delete(enrollment)
    session.commit()


@router.post("/benefits/preview", response_model=PatientBenefitPreviewRead)
def preview_benefits(
    payload: PatientBenefitPreviewRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SETTINGS_MANAGE,
            permissions.BILLING_MANAGE,
            permissions.LAB_READ,
            permissions.PHARMACY_READ,
        )
    ),
) -> PatientBenefitPreviewRead:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=current_user)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    active = active_patient_enrollment(
        session,
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        patient_id=payload.patient_id,
    )
    if not active:
        return PatientBenefitPreviewRead(
            has_active_subscription=False,
            service_type=payload.service_type,
            subtotal_amount=payload.subtotal_amount,
            discount_amount=0,
            payable_amount=payload.subtotal_amount,
            reason="No active patient subscription",
        )
    enrollment, plan = active
    return PatientBenefitPreviewRead(
        has_active_subscription=True,
        **benefit_preview(
            plan=plan,
            enrollment=enrollment,
            service_type=payload.service_type,
            item_ids=payload.item_ids,
            subtotal_amount=payload.subtotal_amount,
            department_id=payload.department_id,
        ),
    )
