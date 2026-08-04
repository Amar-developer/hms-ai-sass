from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.modules.audit.service import record_audit_event
from app.modules.identity.models import User
from app.modules.subscriptions.models import (
    SubscriptionInvoice,
    SubscriptionPlan,
    SubscriptionStatus,
    TenantSubscription,
)
from app.modules.subscriptions.repositories import (
    SubscriptionInvoiceRepository,
    SubscriptionPlanRepository,
    SubscriptionTenantRepository,
    TenantSubscriptionRepository,
)
from app.modules.subscriptions.schemas import EntitlementRead, TenantSubscriptionCreate
from app.modules.subscriptions.services.catalog import plan_duration_days
from app.modules.subscriptions.services.defaults import ensure_default_plans
from app.modules.subscriptions.services.serialization import modules_from_json
from app.modules.subscriptions.services.usage_limits import (
    active_patient_credits,
    current_patient_count,
    effective_patient_limit,
)
from app.modules.tenants.models import now_utc


def create_default_trial_subscription(
    session: Session, tenant_id: str
) -> TenantSubscription:
    ensure_default_plans(session)
    trial_plan = session.exec(
        select(SubscriptionPlan).where(SubscriptionPlan.key == "free_trial")
    ).one()
    subscription = TenantSubscription(
        tenant_id=tenant_id,
        plan_id=trial_plan.id,
        starts_on=date.today(),
        ends_on=date.today() + timedelta(days=30),
        is_trial=True,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
    )
    session.add(subscription)
    session.commit()
    session.refresh(subscription)
    return subscription


def activate_due_subscriptions(session: Session, tenant_id: str) -> None:
    today = date.today()
    active_rows = list(
        session.exec(
            select(TenantSubscription).where(
                TenantSubscription.tenant_id == tenant_id,
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
            )
        ).all()
    )
    changed = False
    for subscription in active_rows:
        if subscription.ends_on and subscription.ends_on < today:
            subscription.status = SubscriptionStatus.EXPIRED
            subscription.is_active = False
            changed = True
            session.add(subscription)

    due = session.exec(
        select(TenantSubscription)
        .where(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.status == SubscriptionStatus.SCHEDULED,
            TenantSubscription.starts_on <= today,
        )
        .order_by(TenantSubscription.starts_on, TenantSubscription.created_at)
    ).first()
    if due:
        for subscription in active_rows:
            subscription.status = SubscriptionStatus.EXPIRED
            subscription.is_active = False
            session.add(subscription)
        due.status = SubscriptionStatus.ACTIVE
        due.is_active = True
        session.add(due)
        changed = True
    if changed:
        session.commit()


def _ensure_primary_tenant_subscription(
    session: Session, tenant_id: str
) -> tuple[TenantSubscription, SubscriptionPlan]:
    """The primary/platform tenant can't be assigned a plan through the
    customer-facing subscription flow (create_tenant_subscription rejects
    it — "does not need a customer subscription"), so it must be
    auto-provisioned here instead of going through the normal purchase path.
    """
    subscriptions = TenantSubscriptionRepository(session)
    existing = subscriptions.latest_for_tenant(tenant_id)
    if existing and existing.is_active and existing.status == SubscriptionStatus.ACTIVE:
        plan = session.get(SubscriptionPlan, existing.plan_id)
        if plan and plan.is_active:
            return existing, plan
    ensure_default_plans(session)
    plan = session.exec(
        select(SubscriptionPlan).where(SubscriptionPlan.key == "hospital")
    ).one()
    subscription = TenantSubscription(
        tenant_id=tenant_id,
        plan_id=plan.id,
        starts_on=date.today(),
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
    )
    session.add(subscription)
    session.commit()
    session.refresh(subscription)
    return subscription, plan


def get_active_subscription(
    session: Session, tenant_id: str
) -> tuple[TenantSubscription, SubscriptionPlan]:
    activate_due_subscriptions(session, tenant_id)
    tenant = SubscriptionTenantRepository(session).get(tenant_id)
    if tenant and tenant.is_primary:
        return _ensure_primary_tenant_subscription(session, tenant_id)
    subscription = session.exec(
        select(TenantSubscription)
        .where(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.is_active == True,  # noqa: E712
            TenantSubscription.status == SubscriptionStatus.ACTIVE,
            TenantSubscription.starts_on <= date.today(),
        )
        .order_by(TenantSubscription.created_at.desc())
    ).first()
    if not subscription:
        expired = session.exec(
            select(TenantSubscription)
            .where(
                TenantSubscription.tenant_id == tenant_id,
                TenantSubscription.status == SubscriptionStatus.EXPIRED,
            )
            .order_by(
                TenantSubscription.ends_on.desc(), TenantSubscription.updated_at.desc()
            )
        ).first()
        if expired:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Subscription has expired",
            )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="No active subscription found for tenant",
        )
    plan = session.get(SubscriptionPlan, subscription.plan_id)
    if not plan or not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Active subscription plan is unavailable",
        )
    if subscription.ends_on and subscription.ends_on < date.today():
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Subscription has expired",
        )
    return subscription, plan


def create_tenant_subscription(
    session: Session,
    *,
    tenant_id: str,
    payload: TenantSubscriptionCreate,
    actor: User,
) -> TenantSubscription:
    tenants = SubscriptionTenantRepository(session)
    plans = SubscriptionPlanRepository(session)
    subscriptions = TenantSubscriptionRepository(session)
    invoices = SubscriptionInvoiceRepository(session)
    tenant = tenants.get(tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    if tenant.is_primary:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Primary platform tenant does not need a customer subscription",
        )
    plan = plans.get(payload.plan_id)
    if not plan or not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid subscription plan"
        )
    if plan.key == "free_trial":
        existing_trial = subscriptions.trial_for_tenant(tenant_id)
        if existing_trial:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Free Trial can only be used once for this tenant",
            )
    ends_on = payload.ends_on
    if ends_on is None:
        duration_days = plan_duration_days(plan.key)
        if duration_days:
            ends_on = payload.starts_on + timedelta(days=duration_days)
    starts_today = payload.starts_on <= date.today()
    if starts_today:
        existing = subscriptions.active_for_tenant(tenant_id)
        for subscription in existing:
            subscription.is_active = False
            subscription.status = SubscriptionStatus.EXPIRED
            subscription.updated_by_user_id = actor.id
            subscription.updated_at = now_utc()
            subscriptions.add(subscription)
    tenant_subscription = TenantSubscription.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "ends_on": ends_on,
            "is_active": starts_today,
            "is_trial": plan.key == "free_trial",
            "status": SubscriptionStatus.ACTIVE
            if starts_today
            else SubscriptionStatus.SCHEDULED,
            "billing_amount": payload.billing_amount
            if payload.billing_amount is not None
            else plan.price_inr_monthly,
            "created_by_user_id": actor.id,
            "updated_by_user_id": actor.id,
        },
    )
    subscriptions.add(tenant_subscription)
    session.commit()
    session.refresh(tenant_subscription)
    invoice = SubscriptionInvoice(
        tenant_id=tenant_id,
        subscription_id=tenant_subscription.id,
        invoice_number=invoices.next_invoice_number(),
        description=f"Subscription: {plan.name}",
        amount=tenant_subscription.billing_amount,
        taxable_amount=tenant_subscription.billing_amount,
        total_amount=tenant_subscription.billing_amount,
        balance_amount=tenant_subscription.billing_amount,
        due_on=tenant_subscription.starts_on,
        created_by_user_id=actor.id,
        updated_by_user_id=actor.id,
    )
    invoices.add(invoice)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor.id,
        action="tenant_subscription.assigned",
        resource_type="tenant_subscription",
        resource_id=tenant_subscription.id,
        purpose="saas_subscription_management",
        metadata_json=f'{{"status": "{tenant_subscription.status.value}", "plan_id": "{plan.id}"}}',
    )
    return tenant_subscription


def list_tenant_subscriptions(
    session: Session, *, tenant_id: str
) -> list[TenantSubscription]:
    return TenantSubscriptionRepository(session).list_for_tenant(tenant_id)


def get_active_tenant_subscription(
    session: Session, *, tenant_id: str
) -> TenantSubscription:
    subscription, _plan = get_active_subscription(session, tenant_id)
    return subscription


def get_entitlements(session: Session, *, tenant_id: str) -> EntitlementRead:
    subscription, plan = get_active_subscription(session, tenant_id)
    patient_count = current_patient_count(session, tenant_id)
    credits = active_patient_credits(session, tenant_id)
    limit = effective_patient_limit(session, tenant_id, plan)
    return EntitlementRead(
        tenant_id=tenant_id,
        plan_key=plan.key,
        plan_name=plan.name,
        is_trial=subscription.is_trial,
        starts_on=subscription.starts_on,
        ends_on=subscription.ends_on,
        monthly_patient_limit=plan.monthly_patient_limit,
        included_branches=plan.included_branches,
        additional_patient_credits=credits,
        effective_patient_limit=limit,
        current_patient_count=patient_count,
        remaining_patient_count=max(limit - patient_count, 0),
        is_expired=False,
        enabled_modules=modules_from_json(plan.enabled_modules_json),
    )
