from datetime import datetime

from pydantic import BaseModel, Field, field_validator


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


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=220)
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


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
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


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
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


class UserRead(BaseModel):
    id: str
    tenant_id: str | None
    tenant_name: str | None = None
    branch_id: str | None
    user_number: str | None = None
    user_type: str = "staff"
    name: str
    email: str
    mobile: str | None
    is_super_admin: bool
    is_active: bool
    must_change_password: bool
    roles: list[str] = Field(default_factory=list)
    last_login_at: datetime | None
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    key: str = Field(min_length=2, max_length=80)
    permission_keys: list[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    key: str | None = Field(default=None, min_length=2, max_length=80)
    permission_keys: list[str] | None = None
    is_active: bool | None = None


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
