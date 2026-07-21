from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import enforce_entitlement
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.identity import permissions
from app.modules.identity.services.policy import assert_tenant_permission
from app.modules.patient_subscriptions.models import PatientSubscriptionPlan
from app.modules.patient_subscriptions.repositories import (
    PatientSubscriptionPlanRepository,
)
from app.modules.patient_subscriptions.schemas import (
    PatientSubscriptionPlanCreate,
    PatientSubscriptionPlanRead,
    PatientSubscriptionPlanUpdate,
)
from app.modules.patient_subscriptions.services.plan_reads import read_plan
from app.modules.patient_subscriptions.services.serialization import (
    free_items_to_json,
    ids_to_json,
    slabs_to_json,
)
from app.modules.patient_subscriptions.services.validation import (
    _get_plan,
)


def create_plan(
    session: Session,
    *,
    tenant_id: str,
    payload: PatientSubscriptionPlanCreate,
    actor: User,
) -> PatientSubscriptionPlanRead:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=actor)
    name_norm = (payload.name or "").strip().lower()
    duplicate = PatientSubscriptionPlanRepository(session).active_for_tenant(tenant_id)
    if any(
        (existing.name or "").strip().lower() == name_norm for existing in duplicate
    ):
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
        free_consultation_department_ids_json=ids_to_json(
            payload.free_consultation_department_ids
        ),
        free_lab_test_ids_json=free_items_to_json(
            payload.free_lab_test_ids, payload.free_lab_test_quantities
        ),
        discounted_lab_test_ids_json=ids_to_json(payload.discounted_lab_test_ids),
        free_medicine_ids_json=free_items_to_json(
            payload.free_medicine_ids, payload.free_medicine_quantities
        ),
        discounted_medicine_ids_json=ids_to_json(payload.discounted_medicine_ids),
    )
    PatientSubscriptionPlanRepository(session).add(plan)
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
    return read_plan(plan)


def list_plans(
    session: Session,
    *,
    tenant_id: str,
    include_inactive: bool,
    actor: User,
) -> list[PatientSubscriptionPlanRead]:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=actor)
    return [
        read_plan(plan)
        for plan in PatientSubscriptionPlanRepository(session).list_for_tenant(
            tenant_id=tenant_id,
            include_inactive=include_inactive,
        )
    ]


def update_plan(
    session: Session,
    *,
    tenant_id: str,
    plan_id: str,
    payload: PatientSubscriptionPlanUpdate,
    actor: User,
) -> PatientSubscriptionPlanRead:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=actor)
    plan = _get_plan(session, tenant_id, plan_id)
    updates = payload.model_dump(exclude_unset=True)
    updates.pop("branch_id", None)
    free_lab_quantities = updates.pop("free_lab_test_quantities", None)
    free_medicine_quantities = updates.pop("free_medicine_quantities", None)
    if "free_lab_test_ids" in updates:
        plan.free_lab_test_ids_json = free_items_to_json(
            updates.pop("free_lab_test_ids"), free_lab_quantities
        )
    if "free_medicine_ids" in updates:
        plan.free_medicine_ids_json = free_items_to_json(
            updates.pop("free_medicine_ids"), free_medicine_quantities
        )
    for source, target in [
        ("pharmacy_discount_slabs", "pharmacy_discount_slabs_json"),
        ("free_consultation_department_ids", "free_consultation_department_ids_json"),
        ("discounted_lab_test_ids", "discounted_lab_test_ids_json"),
        ("discounted_medicine_ids", "discounted_medicine_ids_json"),
    ]:
        if source in updates:
            value = updates.pop(source)
            setattr(
                plan,
                target,
                slabs_to_json(value)
                if source == "pharmacy_discount_slabs"
                else ids_to_json(value),
            )
    before = {key: getattr(plan, key) for key in updates}
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
        actor_user_id=payload.updated_by_user_id or actor.id,
        action="patient_subscription_plan.updated",
        resource_type="patient_subscription_plan",
        resource_id=plan.id,
        purpose="patient_subscription_configuration",
        changes=diff_changes(before, updates),
    )
    return read_plan(plan)


def delete_plan(session: Session, *, tenant_id: str, plan_id: str, actor: User) -> None:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=actor)
    assert_tenant_permission(
        session,
        actor,
        tenant_id,
        permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
        permissions.PATIENT_SUBSCRIPTIONS_DELETE,
        permissions.SETTINGS_MANAGE,
    )
    plan = _get_plan(session, tenant_id, plan_id)
    before = {"is_active": plan.is_active}
    # Soft-delete: deactivate the plan instead of removing it, so existing patient
    # enrollments and their records (invoices, history) are preserved.
    plan.is_active = False
    plan.updated_by_user_id = actor.id
    plan.updated_at = datetime.now(timezone.utc)
    session.add(plan)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=plan.branch_id,
        actor_user_id=actor.id,
        action="patient_subscription_plan.deactivated",
        resource_type="patient_subscription_plan",
        resource_id=plan.id,
        purpose="patient_subscription_configuration",
        changes=diff_changes(before, {"is_active": plan.is_active}),
    )
