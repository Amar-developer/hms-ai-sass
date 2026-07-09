from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.modules.identity.models import User
from app.modules.subscriptions.models import SubscriptionPlan
from app.modules.subscriptions.repositories import SubscriptionPlanRepository
from app.modules.subscriptions.schemas import (
    SubscriptionPlanCreate,
    SubscriptionPlanRead,
    SubscriptionPlanStatusUpdate,
    SubscriptionPlanUpdate,
)
from app.modules.subscriptions.services.catalog import normalize_enabled_modules
from app.modules.subscriptions.services.defaults import ensure_default_plans
from app.modules.subscriptions.services.platform_audit import record_platform_audit
from app.modules.subscriptions.services.read_models import read_plan
from app.modules.subscriptions.services.serialization import modules_to_json
from app.modules.tenants.models import now_utc


def create_plan(
    session: Session, *, payload: SubscriptionPlanCreate, actor: User
) -> SubscriptionPlanRead:
    enabled_modules = normalize_enabled_modules(payload.enabled_modules)
    plan = SubscriptionPlan.model_validate(
        payload.model_dump(exclude={"enabled_modules"}),
        update={
            "enabled_modules_json": modules_to_json(enabled_modules),
            "created_by_user_id": actor.id,
            "updated_by_user_id": actor.id,
        },
    )
    SubscriptionPlanRepository(session).add(plan)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Subscription plan key already exists",
        ) from exc
    session.refresh(plan)
    record_platform_audit(
        session,
        actor,
        action="subscription_plan.created",
        resource_type="subscription_plan",
        resource_id=plan.id,
        purpose="saas_subscription_management",
    )
    return read_plan(plan)


def list_plans(session: Session) -> list[SubscriptionPlanRead]:
    ensure_default_plans(session)
    plans = SubscriptionPlanRepository(session).list_ordered_by_price()
    return [read_plan(plan) for plan in plans]


def get_plan_or_404(session: Session, plan_id: str) -> SubscriptionPlan:
    plan = SubscriptionPlanRepository(session).get(plan_id)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Subscription plan not found"
        )
    return plan


def update_plan(
    session: Session, *, plan_id: str, payload: SubscriptionPlanUpdate, actor: User
) -> SubscriptionPlanRead:
    plan = get_plan_or_404(session, plan_id)
    updates = payload.model_dump(exclude_unset=True)
    enabled_modules = updates.pop("enabled_modules", None)
    for key, value in updates.items():
        setattr(plan, key, value)
    if enabled_modules is not None:
        plan.enabled_modules_json = modules_to_json(
            normalize_enabled_modules(enabled_modules)
        )
    plan.updated_by_user_id = actor.id
    plan.updated_at = now_utc()
    SubscriptionPlanRepository(session).add(plan)
    session.commit()
    session.refresh(plan)
    record_platform_audit(
        session,
        actor,
        action="subscription_plan.updated",
        resource_type="subscription_plan",
        resource_id=plan.id,
        purpose="saas_subscription_management",
    )
    return read_plan(plan)


def change_plan_status(
    session: Session,
    *,
    plan_id: str,
    payload: SubscriptionPlanStatusUpdate,
    actor: User,
) -> SubscriptionPlanRead:
    plan = get_plan_or_404(session, plan_id)
    plan.is_active = payload.is_active
    plan.updated_by_user_id = actor.id
    plan.updated_at = now_utc()
    SubscriptionPlanRepository(session).add(plan)
    session.commit()
    session.refresh(plan)
    record_platform_audit(
        session,
        actor,
        action="subscription_plan.status_changed",
        resource_type="subscription_plan",
        resource_id=plan.id,
        purpose="saas_subscription_management",
    )
    return read_plan(plan)
