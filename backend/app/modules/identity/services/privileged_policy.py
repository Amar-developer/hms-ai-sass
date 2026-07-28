import json
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.modules.identity.models import PrivilegedAccessGrant, User
from app.modules.tenants.models import Tenant


PRIVILEGED_USER_TYPES = {"platform_admin", "support_admin"}

PLATFORM_ADMIN_PERMISSION_KEYS = {
    "platform.tenants.manage",
    "platform.subscriptions.manage",
    "platform.reports.read",
    "platform.templates.manage",
}

SUPPORT_GRANT_PERMISSION_KEYS = {
    "dashboard.access",
    "dashboard.read",
    "settings.read",
    "files.read",
    "departments.read",
    "branches.read",
    "practitioners.read",
    "scheduling.read",
    "patients.read",
    "patient_subscriptions.read",
    "appointments.read",
    "queue.read",
    "consultations.read",
    "billing.read",
    "invoices.read",
    "settlements.read",
    "service_items.read",
    "lab.read",
    "pharmacy.read",
    "suppliers.read",
    "ip.read",
    "physiotherapy.read",
    "home_care.read",
    "notifications.read",
    "communications.read",
    "audit.read",
    "error_logs.read",
    "reports.read",
    "reports.revenue.read",
    "tax.read",
    "discounts.read",
}


def is_primary_tenant_user(session: Session, user: User) -> bool:
    if not user.tenant_id:
        return False
    tenant = session.get(Tenant, user.tenant_id)
    return bool(tenant and tenant.is_primary)


def grant_permission_keys(grant: PrivilegedAccessGrant) -> set[str]:
    try:
        values = json.loads(grant.permission_keys_json or "[]")
    except (TypeError, ValueError):
        return set()
    if not isinstance(values, list):
        return set()
    return {str(value) for value in values if value}


def active_support_grant(
    session: Session,
    *,
    user: User,
    tenant_id: str,
    now: datetime | None = None,
) -> PrivilegedAccessGrant | None:
    if user.user_type != "support_admin" or not user.is_active:
        return None
    current_time = now or datetime.now(timezone.utc)
    return session.exec(
        select(PrivilegedAccessGrant)
        .where(
            PrivilegedAccessGrant.user_id == user.id,
            PrivilegedAccessGrant.tenant_id == tenant_id,
            PrivilegedAccessGrant.revoked_at.is_(None),
            PrivilegedAccessGrant.starts_at <= current_time,
            PrivilegedAccessGrant.expires_at > current_time,
        )
        .order_by(PrivilegedAccessGrant.expires_at.desc())
    ).first()


def active_support_permissions(
    session: Session,
    *,
    user: User,
    tenant_id: str,
) -> set[str]:
    grant = active_support_grant(session, user=user, tenant_id=tenant_id)
    return grant_permission_keys(grant) if grant else set()
