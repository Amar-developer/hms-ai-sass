from sqlmodel import Session

from app.modules.audit.service import record_audit_event
from app.modules.identity.models import User
from app.modules.subscriptions.repositories import SubscriptionTenantRepository


def platform_audit_tenant_id(session: Session, current_user: User) -> str | None:
    if current_user.tenant_id:
        return current_user.tenant_id
    tenants = SubscriptionTenantRepository(session)
    primary = tenants.get_primary()
    if primary:
        return primary.id
    first = tenants.get_first()
    return first.id if first else None


def record_platform_audit(
    session: Session,
    current_user: User,
    *,
    action: str,
    resource_type: str,
    resource_id: str,
    purpose: str,
) -> None:
    tenant_id = platform_audit_tenant_id(session, current_user)
    if not tenant_id:
        return
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        purpose=purpose,
    )
