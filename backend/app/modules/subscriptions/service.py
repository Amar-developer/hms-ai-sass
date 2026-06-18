import json
from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.patients.models import Patient
from app.modules.subscriptions.models import (
    CreditStatus,
    SubscriptionCredit,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.modules.subscriptions.models import TenantSubscription
from app.modules.tenants.models import now_utc


CORE_HMS_MODULES = [
    "patients",
    "practitioners",
    "scheduling",
    "appointments",
    "queue",
    "consultations",
    "billing_basic",
]

FULL_HMS_MODULES = [
    *CORE_HMS_MODULES,
    "billing_advanced",
    "patient_subscriptions",
    "home_care",
    "lab",
    "pharmacy",
    "notifications",
    "sms",
    "whatsapp",
    "voice",
    "reports",
    "physiotherapy",
    "ip",
]

STARTER_HMS_MODULES = [
    *CORE_HMS_MODULES,
    "billing_advanced",
    "patient_subscriptions",
]

GROWTH_HMS_MODULES = [
    *STARTER_HMS_MODULES,
    "home_care",
    "lab",
    "pharmacy",
    "notifications",
    "sms",
    "whatsapp",
    "reports",
]

PRO_HMS_MODULES = [
    *GROWTH_HMS_MODULES,
    "voice",
    "physiotherapy",
]


DEFAULT_PLANS = [
    {
        "key": "free_trial",
        "name": "Free Trial",
        "monthly_patient_limit": 50,
        "included_branches": 999,
        "included_doctors": 999,
        "price_inr_monthly": 0,
        "enabled_modules_json": json.dumps(CORE_HMS_MODULES),
    },
    {
        "key": "starter",
        "name": "Starter Clinic",
        "monthly_patient_limit": 300,
        "included_branches": 1,
        "included_doctors": 1,
        "price_inr_monthly": 999,
        "enabled_modules_json": json.dumps(STARTER_HMS_MODULES),
    },
    {
        "key": "growth",
        "name": "Growth Clinic",
        "monthly_patient_limit": 1000,
        "included_branches": 2,
        "included_doctors": 5,
        "price_inr_monthly": 2999,
        "enabled_modules_json": json.dumps(GROWTH_HMS_MODULES),
    },
    {
        "key": "pro",
        "name": "Pro Clinic",
        "monthly_patient_limit": 5000,
        "included_branches": 5,
        "included_doctors": 20,
        "price_inr_monthly": 7999,
        "enabled_modules_json": json.dumps(PRO_HMS_MODULES),
    },
    {
        "key": "hospital",
        "name": "Hospital",
        "monthly_patient_limit": 10000,
        "included_branches": 999,
        "included_doctors": 999,
        "price_inr_monthly": 14999,
        "enabled_modules_json": json.dumps(FULL_HMS_MODULES),
    },
    {
        "key": "monthly_clinic",
        "name": "Monthly Clinic",
        "monthly_patient_limit": 50,
        "included_branches": 1,
        "included_doctors": 999,
        "price_inr_monthly": 2999,
        "enabled_modules_json": json.dumps(GROWTH_HMS_MODULES),
    },
    {
        "key": "half_yearly_clinic",
        "name": "Half Yearly Clinic",
        "monthly_patient_limit": 300,
        "included_branches": 999,
        "included_doctors": 999,
        "price_inr_monthly": 15999,
        "enabled_modules_json": json.dumps(PRO_HMS_MODULES),
    },
    {
        "key": "yearly_clinic",
        "name": "Yearly Clinic",
        "monthly_patient_limit": 999999,
        "included_branches": 999,
        "included_doctors": 999,
        "price_inr_monthly": 29999,
        "enabled_modules_json": json.dumps(FULL_HMS_MODULES),
    },
]


def modules_to_json(modules: list[str]) -> str:
    return json.dumps(sorted(set(modules)))


def modules_from_json(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(raw, list):
        return []
    return sorted({str(item) for item in raw})


def plan_duration_days(plan_key: str | None) -> int | None:
    return {
        "free_trial": 30,
        "starter": 30,
        "monthly_clinic": 30,
        "half_yearly_clinic": 180,
        "yearly_clinic": 365,
    }.get(str(plan_key or ""))


def ensure_default_plans(session: Session) -> None:
    now = now_utc()
    for payload in DEFAULT_PLANS:
        exists = session.exec(
            select(SubscriptionPlan).where(SubscriptionPlan.key == payload["key"])
        ).first()
        if not exists:
            session.add(SubscriptionPlan(**payload, created_at=now, updated_at=now))
        elif not modules_from_json(exists.enabled_modules_json):
            exists.enabled_modules_json = payload["enabled_modules_json"]
            exists.created_at = exists.created_at or now
            exists.updated_at = now
            session.add(exists)
    session.commit()


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


def get_active_subscription(
    session: Session, tenant_id: str
) -> tuple[TenantSubscription, SubscriptionPlan]:
    activate_due_subscriptions(session, tenant_id)
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


def current_patient_count(session: Session, tenant_id: str) -> int:
    return len(
        session.exec(select(Patient.id).where(Patient.tenant_id == tenant_id)).all()
    )


def active_patient_credits(session: Session, tenant_id: str) -> int:
    today = date.today()
    rows = session.exec(
        select(SubscriptionCredit).where(
            SubscriptionCredit.tenant_id == tenant_id,
            SubscriptionCredit.credit_type == "patients",
            SubscriptionCredit.status == CreditStatus.ACTIVE,
            SubscriptionCredit.starts_on <= today,
        )
    ).all()
    return sum(
        max(row.quantity - row.used_quantity, 0)
        for row in rows
        if not row.expires_on or row.expires_on >= today
    )


def effective_patient_limit(
    session: Session, tenant_id: str, plan: SubscriptionPlan
) -> int:
    return plan.monthly_patient_limit + active_patient_credits(session, tenant_id)


def enforce_patient_limit(session: Session, tenant_id: str) -> None:
    _subscription, plan = get_active_subscription(session, tenant_id)
    count = current_patient_count(session, tenant_id)
    limit = effective_patient_limit(session, tenant_id, plan)
    if count >= limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Patient limit reached for plan {plan.name}",
        )


def next_subscription_invoice_number(session: Session) -> str:
    from app.modules.subscriptions.models import SubscriptionInvoice

    count = session.exec(select(func.count()).select_from(SubscriptionInvoice)).one()
    return f"MHDSUB-{count + 1:06d}"


def enforce_module_enabled(
    session: Session,
    tenant_id: str,
    module_key: str,
    current_user=None,
) -> None:
    # Platform and tenant admins are not blocked by module entitlements.
    if current_user and (
        current_user.is_super_admin or current_user.user_type == "tenant_admin"
    ):
        return

    _subscription, plan = get_active_subscription(session, tenant_id)

    enabled = modules_from_json(plan.enabled_modules_json)

    if module_key not in enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Module {module_key} is not enabled for plan {plan.name}",
        )
