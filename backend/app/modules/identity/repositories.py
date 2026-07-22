from sqlmodel import Session, select

from app.modules.identity.models import (
    AuthSession,
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)
from app.modules.tenants.models import Tenant


class IdentityTenantRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, tenant: Tenant) -> Tenant:
        self.session.add(tenant)
        return tenant

    def get(self, tenant_id: str) -> Tenant | None:
        return self.session.get(Tenant, tenant_id)

    def get_primary(self) -> Tenant | None:
        return self.session.exec(
            select(Tenant).where(Tenant.is_primary == True)  # noqa: E712
        ).first()

    def get_by_name(self, name: str) -> Tenant | None:
        return self.session.exec(select(Tenant).where(Tenant.name == name)).first()


class IdentityUserRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, user: User) -> User:
        self.session.add(user)
        return user

    def get(self, user_id: str) -> User | None:
        return self.session.get(User, user_id)

    def get_super_admin(self) -> User | None:
        return self.session.exec(
            select(User).where(User.is_super_admin == True)  # noqa: E712
        ).first()

    def list_super_admins(self, *, for_update: bool = False) -> list[User]:
        statement = (
            select(User)
            .where(User.is_super_admin == True)  # noqa: E712
            .order_by(User.is_active.desc(), User.created_at)
        )
        if for_update:
            statement = statement.with_for_update()
        return list(self.session.exec(statement).all())

    def get_by_email(self, email: str) -> User | None:
        return self.session.exec(select(User).where(User.email == email)).first()

    def list_login_candidates(self, email: str) -> list[User]:
        return list(
            self.session.exec(
                select(User)
                .where(User.email == email, User.is_active == True)  # noqa: E712
                .order_by(User.updated_at.desc(), User.created_at.desc())
            ).all()
        )

    def get_for_tenant(self, tenant_id: str, user_id: str) -> User | None:
        user = self.get(user_id)
        if not user or user.tenant_id != tenant_id:
            return None
        return user

    def get_by_email_for_tenant(self, tenant_id: str, email: str) -> User | None:
        return self.session.exec(
            select(User).where(User.tenant_id == tenant_id, User.email == email)
        ).first()

    def duplicate_email_for_tenant(
        self, *, tenant_id: str, email: str, exclude_user_id: str
    ) -> User | None:
        return self.session.exec(
            select(User).where(
                User.tenant_id == tenant_id,
                User.email == email,
                User.id != exclude_user_id,
            )
        ).first()

    def list_for_tenant(self, tenant_id: str) -> list[User]:
        return list(
            self.session.exec(
                select(User)
                .where(User.tenant_id == tenant_id)
                .order_by(User.updated_at.desc(), User.created_at.desc())
            ).all()
        )


class IdentityPermissionRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, permission: Permission) -> Permission:
        self.session.add(permission)
        return permission

    def get_by_key(self, key: str) -> Permission | None:
        return self.session.exec(
            select(Permission).where(Permission.key == key)
        ).first()


class IdentityRoleRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, role: Role) -> Role:
        self.session.add(role)
        return role

    def get(self, role_id: str) -> Role | None:
        return self.session.get(Role, role_id)

    def get_for_tenant(self, tenant_id: str, role_id: str) -> Role | None:
        role = self.get(role_id)
        if not role or role.tenant_id != tenant_id:
            return None
        return role

    def get_by_key_for_tenant(self, tenant_id: str, key: str) -> Role | None:
        return self.session.exec(
            select(Role).where(Role.tenant_id == tenant_id, Role.key == key)
        ).first()

    def duplicate_key_for_tenant(
        self, *, tenant_id: str, key: str, exclude_role_id: str
    ) -> Role | None:
        return self.session.exec(
            select(Role).where(
                Role.tenant_id == tenant_id,
                Role.key == key,
                Role.id != exclude_role_id,
            )
        ).first()

    def get_primary_template_by_key(self, key: str) -> Role | None:
        return self.session.exec(
            select(Role)
            .join(Tenant, Tenant.id == Role.tenant_id)
            .where(Tenant.is_primary == True, Role.key == key)  # noqa: E712
        ).first()

    def list_for_tenant(self, tenant_id: str) -> list[Role]:
        return list(
            self.session.exec(
                select(Role)
                .where(Role.tenant_id == tenant_id)
                .order_by(Role.updated_at.desc(), Role.created_at.desc())
            ).all()
        )

    def list_by_name_for_tenant(self, tenant_id: str, name: str) -> list[Role]:
        return list(
            self.session.exec(
                select(Role)
                .where(Role.tenant_id == tenant_id, Role.name == name)
                .order_by(Role.updated_at.desc(), Role.created_at.desc())
            ).all()
        )


class IdentityRolePermissionRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, role_permission: RolePermission) -> RolePermission:
        self.session.add(role_permission)
        return role_permission

    def delete(self, role_permission: RolePermission) -> None:
        self.session.delete(role_permission)

    def get(self, *, role_id: str, permission_id: str) -> RolePermission | None:
        return self.session.exec(
            select(RolePermission).where(
                RolePermission.role_id == role_id,
                RolePermission.permission_id == permission_id,
            )
        ).first()

    def list_for_role(self, role_id: str) -> list[RolePermission]:
        return list(
            self.session.exec(
                select(RolePermission).where(RolePermission.role_id == role_id)
            ).all()
        )

    def permission_keys_for_role(self, role_id: str) -> list[str]:
        return list(
            self.session.exec(
                select(Permission.key)
                .join(RolePermission, RolePermission.permission_id == Permission.id)
                .where(RolePermission.role_id == role_id)
                .order_by(Permission.key)
            ).all()
        )


class IdentityUserRoleRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, user_role: UserRole) -> UserRole:
        self.session.add(user_role)
        return user_role

    def delete(self, user_role: UserRole) -> None:
        self.session.delete(user_role)

    def get(self, *, user_id: str, role_id: str) -> UserRole | None:
        return self.session.exec(
            select(UserRole).where(
                UserRole.user_id == user_id, UserRole.role_id == role_id
            )
        ).first()

    def list_for_user(self, user_id: str) -> list[UserRole]:
        return list(
            self.session.exec(select(UserRole).where(UserRole.user_id == user_id)).all()
        )


class IdentityAuthSessionRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, auth_session: AuthSession) -> AuthSession:
        self.session.add(auth_session)
        return auth_session
