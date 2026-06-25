from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from sqlmodel import Field, SQLModel


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class TenantStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    TRIAL = "trial"


class TenantType(str, Enum):
    PRIMARY = "primary"
    CLINIC = "clinic"
    POLYCLINIC = "polyclinic"
    GENERAL_HOSPITAL = "general_hospital"
    SPECIALTY_HOSPITAL = "specialty_hospital"
    MULTI_SPECIALTY_HOSPITAL = "multi_specialty_hospital"

    @classmethod
    def _missing_(cls, value):
        aliases = {
            "single_clinic": cls.CLINIC,
            "poly_clinic": cls.POLYCLINIC,
            "hospital": cls.GENERAL_HOSPITAL,
            "super_multi_speciality": cls.MULTI_SPECIALTY_HOSPITAL,
        }
        return aliases.get(value)


class Tenant(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("tenant"), primary_key=True)
    name: str = Field(index=True, min_length=2, max_length=160)
    legal_name: str | None = Field(default=None, max_length=220)
    description: str | None = Field(default=None, max_length=1000)
    logo_url: str | None = Field(default=None, max_length=500)
    email: str | None = Field(default=None, max_length=220)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=1000)
    tenant_type: str = Field(default=TenantType.CLINIC.value, max_length=40)
    is_primary: bool = Field(default=False, index=True)
    status: TenantStatus = Field(default=TenantStatus.TRIAL)
    country: str = Field(default="IN", max_length=2)
    timezone: str = Field(default="Asia/Kolkata", max_length=80)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class Branch(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("branch"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    source_template_branch_id: str | None = Field(
        default=None, index=True, foreign_key="branch.id"
    )
    name: str = Field(index=True, min_length=2, max_length=160)
    code: str = Field(index=True, min_length=2, max_length=40)
    area: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    is_global_template: bool = Field(default=False, index=True)
    is_template_locked: bool = Field(default=False, index=True)
    is_active: bool = Field(default=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class Department(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("dept"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    source_template_department_id: str | None = Field(
        default=None, index=True, foreign_key="department.id"
    )
    name: str = Field(index=True, min_length=2, max_length=160)
    code: str = Field(index=True, min_length=2, max_length=40)
    description: str | None = Field(default=None, max_length=1000)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    is_global_template: bool = Field(default=False, index=True)
    is_template_locked: bool = Field(default=False, index=True)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)
