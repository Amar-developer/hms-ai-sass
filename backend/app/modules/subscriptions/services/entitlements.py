from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.subscriptions.models import SubscriptionStatus
from app.modules.subscriptions.repositories import (
    SubscriptionPlanRepository,
    TenantSubscriptionRepository,
)
from app.modules.subscriptions.schemas import (
    SubscriptionAnnouncementRead,
    SubscriptionUsageRead,
)
from app.modules.subscriptions.services.serialization import modules_from_json
from app.modules.subscriptions.services.tenant_subscriptions import (
    get_active_subscription,
)
from app.modules.subscriptions.services.usage_limits import (
    active_patient_credits,
    current_patient_count,
    effective_patient_limit,
)


def enforce_patient_limit(session: Session, tenant_id: str) -> None:
    _subscription, plan = get_active_subscription(session, tenant_id)
    count = current_patient_count(session, tenant_id)
    limit = effective_patient_limit(session, tenant_id, plan)
    if count >= limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Patient limit reached for plan {plan.name}",
        )


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


def read_usage(session: Session, tenant_id: str) -> SubscriptionUsageRead:
    try:
        subscription, plan = get_active_subscription(session, tenant_id)
        missing_subscription_reason = None
    except HTTPException as exc:
        if exc.status_code != status.HTTP_402_PAYMENT_REQUIRED:
            raise
        subscription = TenantSubscriptionRepository(session).latest_for_tenant(
            tenant_id
        )
        plan = (
            SubscriptionPlanRepository(session).get(subscription.plan_id)
            if subscription
            else None
        )
        missing_subscription_reason = str(exc.detail or "No active subscription found")
    patient_count = current_patient_count(session, tenant_id)
    credits = active_patient_credits(session, tenant_id)
    limit = (plan.monthly_patient_limit if plan else 0) + credits
    remaining = max(limit - patient_count, 0)
    days_to_expiry = (
        (subscription.ends_on - date.today()).days
        if subscription and subscription.ends_on
        else None
    )
    usage_percentage = round((patient_count / limit) * 100, 2) if limit else 100.0
    alerts = []
    if missing_subscription_reason:
        alerts.append(missing_subscription_reason)
    if days_to_expiry is not None and days_to_expiry <= 7:
        alerts.append(
            "Plan has expired" if days_to_expiry < 0 else "Plan expires within 7 days"
        )
    if remaining == 0:
        alerts.append("Patient limit reached")
    elif usage_percentage >= 90:
        alerts.append("Usage is above 90 percent")
    elif usage_percentage >= 75:
        alerts.append("Usage is above 75 percent")
    return SubscriptionUsageRead(
        tenant_id=tenant_id,
        plan_key=plan.key if plan else "no_active_subscription",
        plan_name=plan.name if plan else "No active subscription",
        subscription_status=subscription.status
        if subscription
        else SubscriptionStatus.EXPIRED,
        starts_on=subscription.starts_on if subscription else date.today(),
        ends_on=subscription.ends_on if subscription else None,
        monthly_patient_limit=plan.monthly_patient_limit if plan else 0,
        additional_patient_credits=credits,
        effective_patient_limit=limit,
        current_patient_count=patient_count,
        remaining_patient_count=remaining,
        usage_percentage=usage_percentage,
        days_to_expiry=days_to_expiry,
        alerts=alerts,
    )


def get_subscription_announcements(
    session: Session, *, tenant_id: str
) -> list[SubscriptionAnnouncementRead]:
    usage = read_usage(session, tenant_id)
    messages = []
    if usage.days_to_expiry is not None and usage.days_to_expiry <= 7:
        messages.append(
            SubscriptionAnnouncementRead(
                tenant_id=tenant_id,
                severity="warning",
                message=f"Your {usage.plan_name} subscription expires in {usage.days_to_expiry} day(s). Renew or schedule the next plan to avoid service interruption.",
                action="renew_subscription",
            )
        )
    if usage.remaining_patient_count <= 10 or usage.usage_percentage >= 90:
        messages.append(
            SubscriptionAnnouncementRead(
                tenant_id=tenant_id,
                severity="critical"
                if usage.remaining_patient_count == 0
                else "warning",
                message=f"Patient usage is {usage.current_patient_count}/{usage.effective_patient_limit}. Purchase credits or upgrade your plan.",
                action="upgrade_or_buy_credits",
            )
        )
    return messages
