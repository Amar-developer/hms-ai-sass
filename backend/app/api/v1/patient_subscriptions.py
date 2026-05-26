from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.access_control import enforce_entitlement, require_branch_in_tenant, require_user_branch_access, scoped_branch_id
from app.core.auth import require_any_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import Invoice, InvoiceItem
from app.modules.billing.service import next_invoice_number
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
    PatientSubscriptionPlanCreate,
    PatientSubscriptionPlanRead,
    PatientSubscriptionPlanUpdate,
)
from app.modules.patient_subscriptions.service import (
    active_patient_enrollment,
    benefit_preview,
    enrollment_end_date,
    ids_to_json,
    plan_to_read_dict,
)
from app.modules.patients.models import Patient

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


@router.post("/plans", response_model=PatientSubscriptionPlanRead, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: PatientSubscriptionPlanCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.PATIENT_SUBSCRIPTIONS_MANAGE, permissions.SETTINGS_MANAGE)),
) -> PatientSubscriptionPlanRead:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=current_user)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    plan = PatientSubscriptionPlan(
        **payload.model_dump(
            exclude={
                "free_lab_test_ids",
                "discounted_lab_test_ids",
                "free_medicine_ids",
                "discounted_medicine_ids",
            }
        ),
        tenant_id=tenant_id,
        free_lab_test_ids_json=ids_to_json(payload.free_lab_test_ids),
        discounted_lab_test_ids_json=ids_to_json(payload.discounted_lab_test_ids),
        free_medicine_ids_json=ids_to_json(payload.free_medicine_ids),
        discounted_medicine_ids_json=ids_to_json(payload.discounted_medicine_ids),
    )
    session.add(plan)
    session.commit()
    session.refresh(plan)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=plan.branch_id,
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
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(PatientSubscriptionPlan).where(PatientSubscriptionPlan.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where((PatientSubscriptionPlan.branch_id == branch_id) | (PatientSubscriptionPlan.branch_id.is_(None)))
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
    branch_id = payload.branch_id if payload.branch_id is not None else plan.branch_id
    require_branch_in_tenant(session, tenant_id, branch_id)
    require_user_branch_access(current_user, branch_id)
    updates = payload.model_dump(exclude_unset=True)
    for source, target in [
        ("free_lab_test_ids", "free_lab_test_ids_json"),
        ("discounted_lab_test_ids", "discounted_lab_test_ids_json"),
        ("free_medicine_ids", "free_medicine_ids_json"),
        ("discounted_medicine_ids", "discounted_medicine_ids_json"),
    ]:
        if source in updates:
            setattr(plan, target, ids_to_json(updates.pop(source)))
    for key, value in updates.items():
        setattr(plan, key, value)
    plan.updated_at = datetime.now(timezone.utc)
    session.add(plan)
    session.commit()
    session.refresh(plan)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=plan.branch_id,
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
    plan = _get_plan(session, tenant_id, plan_id)
    active_enrollment = session.exec(
        select(PatientSubscriptionEnrollment).where(
            PatientSubscriptionEnrollment.plan_id == plan_id,
            PatientSubscriptionEnrollment.status == PatientSubscriptionEnrollmentStatus.ACTIVE,
        )
    ).first()
    if active_enrollment:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete plan with active enrollments. Pause the plan instead.",
        )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=plan.branch_id,
        actor_user_id=current_user.id,
        action="patient_subscription_plan.deleted",
        resource_type="patient_subscription_plan",
        resource_id=plan.id,
        purpose="patient_subscription_configuration",
    )
    session.delete(plan)
    session.commit()


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
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    patient = session.get(Patient, payload.patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid patient")
    plan = _get_plan(session, tenant_id, payload.plan_id)
    if not plan.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Patient subscription plan is inactive")
    if plan.branch_id and plan.branch_id != payload.branch_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Plan is not valid for this branch")
    existing = active_patient_enrollment(
        session,
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        patient_id=payload.patient_id,
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Patient already has an active subscription")
    enrollment = PatientSubscriptionEnrollment(
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        patient_id=payload.patient_id,
        plan_id=payload.plan_id,
        starts_on=payload.starts_on,
        ends_on=enrollment_end_date(payload.starts_on, plan),
        paid_amount=payload.paid_amount if payload.paid_amount is not None else plan.price_amount,
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
        discount_amount=max(plan.price_amount - enrollment.paid_amount, 0),
        taxable_amount=enrollment.paid_amount,
        tax_amount=0,
        total_amount=enrollment.paid_amount,
        paid_amount=0,
        balance_amount=enrollment.paid_amount,
        doctor_share_amount=0,
        clinic_share_amount=enrollment.paid_amount,
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
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(PatientSubscriptionEnrollment).where(PatientSubscriptionEnrollment.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(PatientSubscriptionEnrollment.branch_id == branch_id)
    if patient_id:
        statement = statement.where(PatientSubscriptionEnrollment.patient_id == patient_id)
    rows = session.exec(statement.order_by(PatientSubscriptionEnrollment.created_at.desc())).all()
    return [_read_enrollment(session, row) for row in rows]


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
        ),
    )
