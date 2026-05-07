from __future__ import annotations

import os

from sqlmodel import Session, select

from app.core.database import engine
from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole
from app.modules.identity.permissions import PERMISSION_CATALOG
from app.modules.identity.security import hash_password
from app.modules.tenants.models import Tenant, TenantStatus, TenantType, now_utc


PRIMARY_TENANT_NAME = "MedizinHub HMS"
SUPER_ADMIN_EMAIL = os.getenv("MEDIZINHUB_SUPER_ADMIN_EMAIL", "super.admin@demo.medizinhub.local").lower()
SUPER_ADMIN_PASSWORD = os.getenv("MEDIZINHUB_SUPER_ADMIN_PASSWORD", "SuperPass123")


def ensure_primary_tenant(session: Session) -> Tenant:
    tenant = session.exec(select(Tenant).where(Tenant.is_primary == True)).first()  # noqa: E712
    if tenant:
        tenant.name = PRIMARY_TENANT_NAME
        tenant.status = TenantStatus.ACTIVE
        tenant.tenant_type = TenantType.PRIMARY
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
        tenant_type=TenantType.PRIMARY,
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
    user = session.exec(select(User).where(User.email == SUPER_ADMIN_EMAIL)).first()
    if not user:
        user = User(
            tenant_id=tenant.id,
            user_type="platform_admin",
            name="Demo Super Admin",
            email=SUPER_ADMIN_EMAIL,
            password_hash=hash_password(SUPER_ADMIN_PASSWORD),
            is_super_admin=True,
            is_active=True,
            must_change_password=False,
        )
    user.tenant_id = tenant.id
    user.user_type = "platform_admin"
    user.email = SUPER_ADMIN_EMAIL
    user.password_hash = hash_password(SUPER_ADMIN_PASSWORD)
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
    role = session.exec(select(Role).where(Role.tenant_id == tenant.id, Role.key == "super_admin")).first()
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
        row.permission_id for row in session.exec(select(RolePermission).where(RolePermission.role_id == role.id)).all()
    }
    for permission in permissions:
        if permission.id not in existing_permission_ids:
            session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    if not session.exec(select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)).first():
        session.add(UserRole(user_id=user.id, role_id=role.id, tenant_id=tenant.id))
    session.commit()


def main() -> None:
    with Session(engine) as session:
        tenant = ensure_primary_tenant(session)
        user = ensure_super_admin(session, tenant)
        ensure_super_admin_role(session, tenant, user)
        print("Super admin login repaired.")
        print(f"Email: {SUPER_ADMIN_EMAIL}")
        print(f"Password: {SUPER_ADMIN_PASSWORD}")
        print(f"Tenant: {tenant.name} ({tenant.id})")


if __name__ == "__main__":
    main()
