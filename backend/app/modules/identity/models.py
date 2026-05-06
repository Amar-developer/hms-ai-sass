from datetime import datetime

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class User(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("user"), primary_key=True)
    tenant_id: str | None = Field(default=None, index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    user_type: str = Field(default="staff", index=True, max_length=60)
    name: str = Field(min_length=2, max_length=160)
    email: str = Field(index=True, max_length=220)
    mobile: str | None = Field(default=None, max_length=20)
    password_hash: str = Field(default="", max_length=260)
    is_super_admin: bool = Field(default=False, index=True)
    is_active: bool = Field(default=True)
    must_change_password: bool = Field(default=False)
    last_login_at: datetime | None = Field(default=None)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class Role(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("role"), primary_key=True)
    tenant_id: str | None = Field(default=None, index=True, foreign_key="tenant.id")
    source_template_role_id: str | None = Field(default=None, index=True, foreign_key="role.id")
    name: str = Field(index=True, min_length=2, max_length=120)
    key: str = Field(index=True, min_length=2, max_length=80)
    is_active: bool = Field(default=True, index=True)
    is_global_template: bool = Field(default=False, index=True)
    is_template_locked: bool = Field(default=False, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class Permission(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("perm"), primary_key=True)
    key: str = Field(index=True, min_length=3, max_length=120)
    description: str = Field(max_length=260)


class UserRole(SQLModel, table=True):
    user_id: str = Field(foreign_key="user.id", primary_key=True)
    role_id: str = Field(foreign_key="role.id", primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    created_at: datetime = Field(default_factory=now_utc)


class RolePermission(SQLModel, table=True):
    role_id: str = Field(foreign_key="role.id", primary_key=True)
    permission_id: str = Field(foreign_key="permission.id", primary_key=True)
    created_at: datetime = Field(default_factory=now_utc)


class AuthSession(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("session"), primary_key=True)
    user_id: str = Field(index=True, foreign_key="user.id")
    tenant_id: str | None = Field(default=None, index=True, foreign_key="tenant.id")
    token_hash: str = Field(index=True, max_length=128)
    expires_at: datetime = Field(index=True)
    revoked_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=now_utc)
