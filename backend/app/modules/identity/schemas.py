from datetime import datetime
from typing import Literal

import re

from pydantic import AliasChoices, BaseModel, Field, field_validator


def _validate_email(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    local, separator, domain = normalized.partition("@")
    if (
        not separator
        or not local
        or not domain
        or any(character.isspace() for character in normalized)
    ):
        raise ValueError("Enter a valid email address")
    return normalized


def _unique_strings(values: list[str] | None) -> list[str] | None:
    if values is None:
        return None
    return list(dict.fromkeys(values))


def _validate_username(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip().lower()
    if not normalized:
        return None
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,79}", normalized):
        raise ValueError(
            "Username must be 3-80 characters using letters, numbers, dots, hyphens, or underscores"
        )
    return normalized


class LoginRequest(BaseModel):
    identifier: str = Field(
        min_length=3,
        max_length=220,
        validation_alias=AliasChoices("identifier", "email"),
    )
    password: str = Field(min_length=8, max_length=128)
    tenant_id: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ResetUserPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)
    must_change_password: bool = True


class BootstrapSuperAdminRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=220)
    password: str = Field(min_length=8, max_length=128)
    # Required only in production (matched against MEDIZINHUB_BOOTSTRAP_TOKEN).
    bootstrap_token: str | None = Field(default=None, max_length=200)


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    username: str | None = Field(default=None, min_length=3, max_length=80)
    email: str = Field(min_length=5, max_length=220)
    password: str = Field(min_length=8, max_length=128)
    user_type: str = Field(default="staff", min_length=2, max_length=60)
    mobile: str | None = Field(default=None, max_length=20)
    branch_id: str | None = None
    role_keys: list[str] = Field(default_factory=list)
    must_change_password: bool = True

    @field_validator("email", mode="before")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return str(_validate_email(value))

    @field_validator("username", mode="before")
    @classmethod
    def validate_username(cls, value: str | None) -> str | None:
        return _validate_username(value)


class SuperAdminCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=220)
    temporary_password: str = Field(min_length=12, max_length=128)
    current_password: str = Field(min_length=8, max_length=128)
    mobile: str | None = Field(default=None, max_length=20)
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("email", mode="before")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return str(_validate_email(value))


class SuperAdminStatusUpdate(BaseModel):
    is_active: bool
    current_password: str = Field(min_length=8, max_length=128)
    reason: str = Field(min_length=3, max_length=500)


class PrivilegedAccountCreate(BaseModel):
    account_type: Literal["platform_admin", "support_admin"]
    name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=220)
    temporary_password: str = Field(min_length=12, max_length=128)
    current_password: str = Field(min_length=8, max_length=128)
    mobile: str | None = Field(default=None, max_length=20)
    permission_keys: list[str] = Field(default_factory=list)
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("email", mode="before")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return str(_validate_email(value))

    @field_validator("permission_keys")
    @classmethod
    def unique_permission_keys(cls, value: list[str]) -> list[str]:
        return _unique_strings(value) or []


class PrivilegedAccountUpdate(BaseModel):
    permission_keys: list[str] | None = None
    is_active: bool | None = None
    current_password: str = Field(min_length=8, max_length=128)
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("permission_keys")
    @classmethod
    def unique_permission_keys(cls, value: list[str] | None) -> list[str] | None:
        return _unique_strings(value)


class SupportAccessGrantCreate(BaseModel):
    user_id: str
    tenant_id: str
    permission_keys: list[str] = Field(default_factory=list)
    duration_minutes: int = Field(default=60, ge=15, le=480)
    current_password: str = Field(min_length=8, max_length=128)
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("permission_keys")
    @classmethod
    def unique_permission_keys(cls, value: list[str]) -> list[str]:
        return _unique_strings(value) or []


class SupportAccessGrantRevoke(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    reason: str = Field(min_length=3, max_length=500)


class SupportAccessGrantRead(BaseModel):
    id: str
    tenant_id: str
    tenant_name: str | None = None
    user_id: str
    user_name: str | None = None
    user_email: str | None = None
    permission_keys: list[str] = Field(default_factory=list)
    reason: str
    starts_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
    granted_by_user_id: str
    revoked_by_user_id: str | None = None
    revoke_reason: str | None = None
    status: Literal["scheduled", "active", "expired", "revoked"]
    created_at: datetime


class PrivilegedAccessOptionsRead(BaseModel):
    platform_permission_keys: list[str]
    support_permission_keys: list[str]
    maximum_support_duration_minutes: int = 480


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    username: str | None = Field(default=None, min_length=3, max_length=80)
    email: str | None = Field(default=None, min_length=5, max_length=220)
    user_type: str | None = Field(default=None, min_length=2, max_length=60)
    mobile: str | None = Field(default=None, max_length=20)
    branch_id: str | None = None
    role_keys: list[str] | None = None
    is_active: bool | None = None
    must_change_password: bool | None = None

    @field_validator("email", mode="before")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return _validate_email(value)

    @field_validator("username", mode="before")
    @classmethod
    def validate_username(cls, value: str | None) -> str | None:
        return _validate_username(value)


class UserRead(BaseModel):
    id: str
    tenant_id: str | None
    tenant_name: str | None = None
    branch_id: str | None
    user_number: str | None = None
    user_type: str = "staff"
    name: str
    username: str | None = None
    email: str
    mobile: str | None
    is_super_admin: bool
    is_active: bool
    must_change_password: bool
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    last_login_at: datetime | None
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    key: str = Field(min_length=2, max_length=80)
    permission_keys: list[str] = Field(default_factory=list)

    @field_validator("permission_keys")
    @classmethod
    def unique_permission_keys(cls, value: list[str]) -> list[str]:
        return _unique_strings(value) or []


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    key: str | None = Field(default=None, min_length=2, max_length=80)
    permission_keys: list[str] | None = None
    is_active: bool | None = None

    @field_validator("permission_keys")
    @classmethod
    def unique_permission_keys(cls, value: list[str] | None) -> list[str] | None:
        return _unique_strings(value)


class RoleRead(BaseModel):
    id: str
    tenant_id: str | None
    source_template_role_id: str | None = None
    name: str
    key: str
    is_active: bool = True
    is_global_template: bool = False
    is_template_locked: bool = False
    permission_keys: list[str] = Field(default_factory=list)
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


class PermissionRead(BaseModel):
    key: str
    module: str
    module_label: str
    action: str
    description: str


class AuthUserRead(UserRead):
    roles: list[str]
    permissions: list[str]


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: AuthUserRead
