import pytest
from fastapi import HTTPException
from sqlmodel import Session

from app.modules.identity.models import Role, User
from app.modules.identity.schemas import RoleUpdate
from app.modules.identity.services.role_service import RoleService
from app.modules.tenants.models import Tenant, TenantStatus


def _add_tenant(session: Session, name: str, *, is_primary: bool = False) -> Tenant:
    tenant = Tenant(
        name=name,
        status=TenantStatus.ACTIVE,
        is_primary=is_primary,
        tenant_type="primary" if is_primary else "clinic",
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


def _add_role(session: Session, tenant: Tenant, *, locked: bool = False) -> Role:
    role = Role(
        tenant_id=tenant.id,
        source_template_role_id="role_global_template" if locked else None,
        name="Front Desk",
        key="front_desk",
        is_template_locked=locked,
    )
    session.add(role)
    session.commit()
    session.refresh(role)
    return role


def test_super_admin_can_set_any_tenant_role_permissions(test_engine):
    with Session(test_engine) as session:
        tenant = _add_tenant(session, "Super Admin Target Clinic")
        role = _add_role(session, tenant, locked=True)
        super_admin = User(
            name="Platform Admin",
            email="platform.role.admin@test.local",
            is_super_admin=True,
        )
        session.add(super_admin)
        session.commit()
        session.refresh(super_admin)

        updated = RoleService(session).update_role(
            tenant_id=tenant.id,
            role_id=role.id,
            payload=RoleUpdate(permission_keys=["appointments.read", "patients.read"]),
            actor=super_admin,
        )

        assert updated.permission_keys == ["appointments.read", "patients.read"]
        customer_catalog = RoleService(session).list_permission_catalog(
            tenant_id=tenant.id, actor=super_admin
        )
        assert all(not row.key.startswith("platform.") for row in customer_catalog)

        with pytest.raises(HTTPException) as customer_platform_error:
            RoleService(session).update_role(
                tenant_id=tenant.id,
                role_id=role.id,
                payload=RoleUpdate(permission_keys=["platform.tenants.manage"]),
                actor=super_admin,
            )
        assert customer_platform_error.value.status_code == 403

        primary_tenant = _add_tenant(session, "MedizinHub Primary", is_primary=True)
        primary_role = _add_role(session, primary_tenant)
        primary_updated = RoleService(session).update_role(
            tenant_id=primary_tenant.id,
            role_id=primary_role.id,
            payload=RoleUpdate(permission_keys=["platform.tenants.manage"]),
            actor=super_admin,
        )
        assert primary_updated.permission_keys == ["platform.tenants.manage"]
        primary_catalog = RoleService(session).list_permission_catalog(
            tenant_id=primary_tenant.id, actor=super_admin
        )
        assert any(row.key == "platform.tenants.manage" for row in primary_catalog)


def test_tenant_admin_can_set_only_own_tenant_role_permissions(test_engine):
    with Session(test_engine) as session:
        tenant = _add_tenant(session, "Tenant Admin Clinic")
        other_tenant = _add_tenant(session, "Other Clinic")
        role = _add_role(session, tenant, locked=True)
        other_role = _add_role(session, other_tenant)
        tenant_admin = User(
            tenant_id=tenant.id,
            user_type="tenant_admin",
            name="Tenant Admin",
            email="tenant.role.admin@test.local",
        )
        session.add(tenant_admin)
        session.commit()
        session.refresh(tenant_admin)

        updated = RoleService(session).update_role(
            tenant_id=tenant.id,
            role_id=role.id,
            payload=RoleUpdate(permission_keys=["appointments.read", "patients.read"]),
            actor=tenant_admin,
        )
        assert updated.permission_keys == ["appointments.read", "patients.read"]
        assert updated.is_template_locked is True

        with pytest.raises(HTTPException) as metadata_error:
            RoleService(session).update_role(
                tenant_id=tenant.id,
                role_id=role.id,
                payload=RoleUpdate(name="Renamed Template Role"),
                actor=tenant_admin,
            )
        assert metadata_error.value.status_code == 403

        with pytest.raises(HTTPException) as tenant_error:
            RoleService(session).update_role(
                tenant_id=other_tenant.id,
                role_id=other_role.id,
                payload=RoleUpdate(permission_keys=["patients.read"]),
                actor=tenant_admin,
            )
        assert tenant_error.value.status_code == 403

        with pytest.raises(HTTPException) as platform_error:
            RoleService(session).update_role(
                tenant_id=tenant.id,
                role_id=role.id,
                payload=RoleUpdate(permission_keys=["platform.tenants.manage"]),
                actor=tenant_admin,
            )
        assert platform_error.value.status_code == 403

        tenant_catalog = RoleService(session).list_permission_catalog(
            tenant_id=tenant.id, actor=tenant_admin
        )
        assert all(not row.key.startswith("platform.") for row in tenant_catalog)
