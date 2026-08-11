from sqlmodel import Session, select

from app.modules.manifest import default_enabled_module_keys
from app.modules.subscriptions.models import SubscriptionPlan
from app.modules.subscriptions.services.catalog import (
    DEFAULT_PLANS,
    HOME_CARE_DEFAULT_PLAN_KEYS,
    PATIENT_INTELLIGENCE_DEFAULT_PLAN_KEYS,
)
from app.modules.subscriptions.services.serialization import (
    modules_from_json,
    modules_to_json,
)
from app.modules.tenants.models import now_utc


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
        elif exists.key in HOME_CARE_DEFAULT_PLAN_KEYS:
            enabled_modules = modules_from_json(exists.enabled_modules_json)
            if "home_care" not in enabled_modules:
                exists.enabled_modules_json = modules_to_json(
                    [*enabled_modules, "home_care"]
                )
                exists.updated_at = now
                session.add(exists)
        if exists and exists.key in PATIENT_INTELLIGENCE_DEFAULT_PLAN_KEYS:
            enabled_modules = modules_from_json(exists.enabled_modules_json)
            if "patient_intelligence" not in enabled_modules:
                exists.enabled_modules_json = modules_to_json(
                    [*enabled_modules, "patient_intelligence"]
                )
                exists.updated_at = now
                session.add(exists)
        if (
            exists
            and exists.monthly_whatsapp_message_limit == 0
            and payload.get("monthly_whatsapp_message_limit", 0) > 0
            and "whatsapp" in modules_from_json(payload["enabled_modules_json"])
        ):
            exists.monthly_whatsapp_message_limit = payload[
                "monthly_whatsapp_message_limit"
            ]
            exists.updated_at = now
            session.add(exists)
    _backfill_core_modules(session, now)
    session.commit()


def _backfill_core_modules(session: Session, now) -> None:
    """Every plan, including custom ones created via the admin UI, must carry
    every core (default-enabled) module. Modules added to the manifest after a
    plan already existed would otherwise be silently missing from that plan's
    entitlements forever, since plan rows are only written at creation time.
    """
    core_keys = default_enabled_module_keys()
    if not core_keys:
        return
    for plan in session.exec(select(SubscriptionPlan)).all():
        enabled_modules = modules_from_json(plan.enabled_modules_json)
        if not enabled_modules:
            continue
        missing = [key for key in core_keys if key not in enabled_modules]
        if missing:
            plan.enabled_modules_json = modules_to_json([*enabled_modules, *missing])
            plan.updated_at = now
            session.add(plan)
