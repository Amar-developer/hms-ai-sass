from __future__ import annotations

import os

from sqlmodel import Session, select

from app.core.database import engine
from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole
from app.modules.identity.permissions import PERMISSION_CATALOG
from app.modules.identity.security import hash_password
from app.modules.subscriptions.service import ensure_default_plans
from app.modules.tenants.models import Tenant, TenantStatus, TenantType, now_utc


PRIMARY_TENANT_NAME = "MedizinHub HMS"
DEFAULT_LOCAL_SUPER_ADMIN_EMAIL = "admin@medizinhub.local"
DEFAULT_LOCAL_SUPER_ADMIN_PASSWORD = "ChangeMe@123"
PRODUCTION_CONFIRM_VALUE = "RESET_SUPER_ADMIN_PRODUCTION"


def _is_production() -> bool:
    return os.getenv("MEDIZINHUB_ENVIRONMENT", "local").strip().lower() in {
        "production",
        "prod",
    }


def _super_admin_name() -> str:
    return os.getenv("MEDIZINHUB_SUPER_ADMIN_NAME", "Platform Super Admin").strip()


def _super_admin_email() -> str:
    return os.getenv(
        "MEDIZINHUB_SUPER_ADMIN_EMAIL", DEFAULT_LOCAL_SUPER_ADMIN_EMAIL
    ).lower()


def _super_admin_password() -> str:
    password = os.getenv("MEDIZINHUB_SUPER_ADMIN_PASSWORD", "").strip()
    if password:
        return password
    if _is_production():
        raise RuntimeError("MEDIZINHUB_SUPER_ADMIN_PASSWORD is required in production")
    return DEFAULT_LOCAL_SUPER_ADMIN_PASSWORD


def _assert_reset_allowed() -> None:
    if not _is_production():
        return
    if os.getenv("MEDIZINHUB_SUPER_ADMIN_CONFIRM") != PRODUCTION_CONFIRM_VALUE:
        raise SystemExit(
            "Refusing to reset production super admin without "
            f"MEDIZINHUB_SUPER_ADMIN_CONFIRM={PRODUCTION_CONFIRM_VALUE}"
        )


def ensure_primary_tenant(session: Session) -> Tenant:
    tenant = session.exec(select(Tenant).where(Tenant.is_primary == True)).first()  # noqa: E712
    if tenant:
        tenant.name = PRIMARY_TENANT_NAME
        tenant.status = TenantStatus.ACTIVE
        tenant.tenant_type = TenantType.PRIMARY.value
        tenant.updated_at = now_utc()
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        return tenant
    tenant = Tenant(
        name=PRIMARY_TENANT_NAME,
        legal_name="MedizinHub HMS Platform",
        description="Primary platform tenant",
        email="admin@medizinhub.local",
        phone="9000000000",
        address="MedizinHub HMS Platform Office",
        tenant_type=TenantType.PRIMARY.value,
        is_primary=True,
        status=TenantStatus.ACTIVE,
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


def ensure_permissions(session: Session) -> None:
    existing = {row.key: row for row in session.exec(select(Permission)).all()}
    for key in PERMISSION_CATALOG:
        if key not in existing:
            session.add(Permission(key=key, description=key.replace(".", " ").title()))
    session.commit()


def ensure_super_admin(session: Session, tenant: Tenant) -> User:
    name = _super_admin_name()
    email = _super_admin_email()
    password = _super_admin_password()
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        user = User(
            tenant_id=tenant.id,
            user_type="platform_admin",
            name=name,
            email=email,
            password_hash=hash_password(password),
            is_super_admin=True,
            is_active=True,
            must_change_password=False,
        )
    user.tenant_id = tenant.id
    user.user_type = "platform_admin"
    user.name = name
    user.email = email
    user.password_hash = hash_password(password)
    user.is_super_admin = True
    user.is_active = True
    user.must_change_password = False
    user.updated_at = now_utc()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def ensure_super_admin_role(session: Session, tenant: Tenant, user: User) -> None:
    ensure_permissions(session)
    role = session.exec(
        select(Role).where(Role.tenant_id == tenant.id, Role.key == "super_admin")
    ).first()
    if not role:
        role = Role(
            tenant_id=tenant.id,
            name="Super Admin",
            key="super_admin",
            is_global_template=True,
            created_by_user_id=user.id,
            updated_by_user_id=user.id,
        )
        session.add(role)
        session.commit()
        session.refresh(role)
    role.is_active = True
    role.is_global_template = True
    role.updated_by_user_id = user.id
    role.updated_at = now_utc()
    session.add(role)
    permissions = session.exec(select(Permission)).all()
    existing_permission_ids = {
        row.permission_id
        for row in session.exec(
            select(RolePermission).where(RolePermission.role_id == role.id)
        ).all()
    }
    for permission in permissions:
        if permission.id not in existing_permission_ids:
            session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    if not session.exec(
        select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)
    ).first():
        session.add(UserRole(user_id=user.id, role_id=role.id, tenant_id=tenant.id))
    session.commit()


def ensure_tenant_admin_template_role(
    session: Session, tenant: Tenant, user: User
) -> None:
    ensure_permissions(session)
    role = session.exec(
        select(Role).where(Role.tenant_id == tenant.id, Role.key == "tenant_admin")
    ).first()
    if not role:
        role = Role(
            tenant_id=tenant.id,
            name="Tenant Admin",
            key="tenant_admin",
            is_global_template=True,
            created_by_user_id=user.id,
            updated_by_user_id=user.id,
        )
        session.add(role)
        session.commit()
        session.refresh(role)
    role.name = "Tenant Admin"
    role.is_active = True
    role.is_global_template = True
    role.is_template_locked = False
    role.updated_by_user_id = user.id
    role.updated_at = now_utc()
    session.add(role)

    existing_permission_ids = {
        row.permission_id
        for row in session.exec(
            select(RolePermission).where(RolePermission.role_id == role.id)
        ).all()
    }
    tenant_permission_keys = [
        key for key in PERMISSION_CATALOG if not key.startswith("platform.")
    ]
    permissions_by_key = {
        row.key: row for row in session.exec(select(Permission)).all()
    }
    for permission_key in tenant_permission_keys:
        permission = permissions_by_key[permission_key]
        if permission.id not in existing_permission_ids:
            session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    session.commit()


def main() -> None:
    _assert_reset_allowed()
    with Session(engine) as session:
        ensure_default_plans(session)
        tenant = ensure_primary_tenant(session)
        user = ensure_super_admin(session, tenant)
        ensure_super_admin_role(session, tenant, user)
        ensure_tenant_admin_template_role(session, tenant, user)
        print("Super admin login repaired.")
        print(f"Email: {user.email}")
        if _is_production():
            print("Password: read from MEDIZINHUB_SUPER_ADMIN_PASSWORD")
        else:
            print(f"Password: {_super_admin_password()}")
        print(f"Tenant: {tenant.name} ({tenant.id})")


if __name__ == "__main__":
    main()
