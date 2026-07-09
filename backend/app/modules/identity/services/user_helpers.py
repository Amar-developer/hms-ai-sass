import re

from sqlmodel import Session

from app.modules.identity.repositories import IdentityTenantRepository


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_role_key(value: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", value.strip().lower())
    return re.sub(r"_+", "_", key).strip("_")


def is_primary_tenant(session: Session, tenant_id: str | None) -> bool:
    if not tenant_id:
        return False
    tenant = IdentityTenantRepository(session).get(tenant_id)
    return bool(tenant and tenant.is_primary)


def normalize_user_access(updates: dict) -> dict:
    role_keys = list(updates.get("role_keys") or [])
    has_tenant_admin_access = (
        updates.get("user_type") == "tenant_admin" or "tenant_admin" in role_keys
    )
    if has_tenant_admin_access:
        updates["user_type"] = "tenant_admin"
        updates["branch_id"] = None
        if "tenant_admin" not in role_keys:
            role_keys.append("tenant_admin")
        updates["role_keys"] = role_keys
    return updates
