from datetime import datetime
from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.modules.tenants.models import TenantStatus, TenantType


class TenantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    legal_name: str | None = Field(default=None, max_length=220)
    description: str | None = Field(default=None, max_length=1000)
    logo_url: str | None = Field(default=None, max_length=500)
    email: str | None = Field(default=None, max_length=220)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=1000)
    tenant_type: TenantType = TenantType.CLINIC
    is_primary: bool = False
    status: TenantStatus = TenantStatus.TRIAL
    country: str = Field(default="IN", min_length=2, max_length=2)
    timezone: str = Field(default="Asia/Kolkata", max_length=80)


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    legal_name: str | None = Field(default=None, max_length=220)
    description: str | None = Field(default=None, max_length=1000)
    logo_url: str | None = Field(default=None, max_length=500)
    email: str | None = Field(default=None, max_length=220)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=1000)
    tenant_type: TenantType | None = None
    status: TenantStatus | None = None
    country: str | None = Field(default=None, min_length=2, max_length=2)
    timezone: str | None = Field(default=None, max_length=80)


class TenantRead(TenantCreate):
    id: str
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime


class TenantBrandingRead(BaseModel):
    name: str
    legal_name: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    logo_url: str | None = None


class BranchCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    code: str = Field(min_length=2, max_length=40)
    area: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)


class BranchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    code: str | None = Field(default=None, min_length=2, max_length=40)
    area: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    is_active: bool | None = None


class BranchRead(BranchCreate):
    id: str
    tenant_id: str
    source_template_branch_id: str | None = None
    is_global_template: bool = False
    is_template_locked: bool = False
    is_active: bool
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    code: str | None = Field(default=None, min_length=2, max_length=40)
    branch_id: str | None = None
    is_active: bool = True
    created_by_user_id: str | None = None

    @field_validator("name", "code", mode="before")
    @classmethod
    def strip_required_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    code: str | None = Field(default=None, min_length=2, max_length=40)
    branch_id: str | None = None
    is_active: bool | None = None

    @field_validator("name", "code", mode="before")
    @classmethod
    def strip_required_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class DepartmentRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str | None
    source_template_department_id: str | None = None
    name: str
    code: str
    description: str | None
    created_by_user_id: str | None
    updated_by_user_id: str | None = None
    is_global_template: bool = False
    is_template_locked: bool = False
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TenantOnboardingBranchCreate(BranchCreate):
    pass


class TenantOnboardingAdminCreate(BaseModel):
    name: str = Field(default="Tenant Admin", min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=220)
    password: str = Field(min_length=8, max_length=128)
    mobile: str | None = Field(default=None, max_length=20)
    must_change_password: bool = True


class TenantOnboardingCreate(BaseModel):
    tenant: TenantCreate
    branches: list[TenantOnboardingBranchCreate] = Field(default_factory=list)
    subscription_plan_id: str | None = None
    enabled_modules: list[str] = Field(default_factory=list)
    monthly_patient_limit: int = Field(default=300, ge=0)
    included_branches: int | None = Field(default=None, ge=0)
    included_doctors: int = Field(default=1, ge=0)
    price_inr_monthly: int = Field(default=0, ge=0)
    subscription_starts_on: date = Field(default_factory=date.today)
    subscription_ends_on: date | None = None
    role_template_ids: list[str] = Field(default_factory=list)
    department_template_ids: list[str] = Field(default_factory=list)
    branch_template_ids: list[str] = Field(default_factory=list)
    admin_user: TenantOnboardingAdminCreate | None = None


class TenantOnboardingRead(BaseModel):
    tenant: TenantRead
    branches: list[BranchRead] = Field(default_factory=list)
    role_count: int = 0
    department_count: int = 0
    branch_template_count: int = 0
    subscription_id: str | None = None
    subscription_plan_id: str | None = None
    admin_user_id: str | None = None
