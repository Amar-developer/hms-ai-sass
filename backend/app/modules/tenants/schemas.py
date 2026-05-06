from datetime import datetime

from pydantic import BaseModel, Field

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


class BranchCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    code: str = Field(min_length=2, max_length=40)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)


class BranchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    code: str | None = Field(default=None, min_length=2, max_length=40)
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


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    code: str | None = Field(default=None, min_length=2, max_length=40)
    branch_id: str | None = None
    is_active: bool | None = None


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
