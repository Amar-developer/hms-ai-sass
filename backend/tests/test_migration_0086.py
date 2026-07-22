import importlib.util
from pathlib import Path

import sqlalchemy as sa
from sqlmodel import Session, select

from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole
from app.modules.tenants.models import Tenant


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "20260722_0086_reconcile_admin_roles.py"
)


def _migration_module():
    spec = importlib.util.spec_from_file_location("migration_0086", MIGRATION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upgrade_reconciles_admin_roles_and_permissions(test_engine, monkeypatch):
    with Session(test_engine) as session:
        primary = Tenant(
            id="tenant_primary_0086",
            name="Primary",
            legal_name="Primary",
            is_primary=True,
            tenant_type="primary",
        )
        customer = Tenant(
            id="tenant_customer_0086",
            name="Customer",
            legal_name="Customer",
            is_primary=False,
            tenant_type="clinic",
        )
        super_role = Role(
            id="role_super_0086",
            tenant_id=primary.id,
            name="Super Admin",
            key="super_admin",
            is_global_template=True,
        )
        tenant_admin = User(
            id="user_tenant_admin_0086",
            tenant_id=customer.id,
            user_type="tenant_admin",
            name="Tenant Admin",
            email="tenant-admin-0086@example.test",
            password_hash="test",
        )
        session.add(primary)
        session.add(customer)
        session.add(super_role)
        session.add(tenant_admin)
        session.add(
            Permission(
                id="perm_platform_0086",
                key="platform.tenants.manage",
                description="Platform Tenants Manage",
            )
        )
        session.add(
            Permission(
                id="perm_patient_0086",
                key="patients.read",
                description="Patients Read",
            )
        )
        session.commit()

    migration = _migration_module()

    def execute(statement):
        with test_engine.begin() as connection:
            connection.execute(sa.text(statement))

    monkeypatch.setattr(migration.op, "execute", execute)
    migration.upgrade()

    with Session(test_engine) as session:
        primary_tenant_role = session.exec(
            select(Role).where(
                Role.tenant_id == "tenant_primary_0086",
                Role.key == "tenant_admin",
            )
        ).one()
        customer_tenant_role = session.exec(
            select(Role).where(
                Role.tenant_id == "tenant_customer_0086",
                Role.key == "tenant_admin",
            )
        ).one()

        assert primary_tenant_role.is_global_template is True
        assert primary_tenant_role.is_template_locked is False
        assert customer_tenant_role.is_global_template is False
        assert customer_tenant_role.is_template_locked is True
        assert customer_tenant_role.source_template_role_id == primary_tenant_role.id
        assert (
            session.exec(
                select(Role).where(
                    Role.tenant_id == "tenant_customer_0086",
                    Role.key == "super_admin",
                )
            ).first()
            is None
        )

        permission_by_id = {
            row.id: row.key for row in session.exec(select(Permission)).all()
        }
        super_keys = {
            permission_by_id[row.permission_id]
            for row in session.exec(
                select(RolePermission).where(
                    RolePermission.role_id == "role_super_0086"
                )
            ).all()
        }
        tenant_admin_keys = {
            permission_by_id[row.permission_id]
            for row in session.exec(
                select(RolePermission).where(
                    RolePermission.role_id == customer_tenant_role.id
                )
            ).all()
        }

        assert {
            "platform.tenants.manage",
            "patients.read",
            "billing.refunds.approve",
            "invoices.cancel_approve",
        } <= super_keys
        assert "platform.tenants.manage" not in tenant_admin_keys
        assert {
            "patients.read",
            "billing.refunds.approve",
            "invoices.cancel_approve",
        } <= tenant_admin_keys
        assert session.exec(
            select(UserRole).where(
                UserRole.user_id == "user_tenant_admin_0086",
                UserRole.role_id == customer_tenant_role.id,
            )
        ).one()
