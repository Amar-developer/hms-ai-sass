from datetime import date, datetime, time
from enum import Enum

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class PractitionerStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class PractitionerType(str, Enum):
    DOCTOR = "doctor"
    PHYSIOTHERAPIST = "physiotherapist"
    NURSE = "nurse"
    LAB_SPECIALIST = "lab_specialist"
    TECHNICIAN = "technician"


class Practitioner(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("prac"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    user_id: str | None = Field(default=None, index=True, foreign_key="user.id")
    practitioner_number: str | None = Field(default=None, index=True, max_length=60)
    full_name: str = Field(index=True, min_length=2, max_length=180)
    practitioner_type: PractitionerType = Field(
        default=PractitionerType.DOCTOR, index=True
    )
    primary_specialty: str | None = Field(default=None, index=True, max_length=160)
    registration_number: str | None = Field(default=None, index=True, max_length=120)
    mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=220)
    status: PractitionerStatus = Field(default=PractitionerStatus.ACTIVE, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class PractitionerBranch(SQLModel, table=True):
    practitioner_id: str = Field(foreign_key="practitioner.id", primary_key=True)
    branch_id: str = Field(foreign_key="branch.id", primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=now_utc)


class PractitionerDepartment(SQLModel, table=True):
    practitioner_id: str = Field(foreign_key="practitioner.id", primary_key=True)
    department_id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=now_utc)


class PractitionerSchedule(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("psch"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    practitioner_id: str = Field(index=True, foreign_key="practitioner.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    department_id: str | None = Field(default=None, index=True)
    weekday: int = Field(index=True, ge=0, le=6)
    start_time: time
    end_time: time
    slot_minutes: int = Field(default=15, ge=1, le=240)
    room_name: str | None = Field(default=None, max_length=120)
    room_number: str | None = Field(default=None, max_length=10)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class PractitionerLeave(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("plv"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    practitioner_id: str = Field(index=True, foreign_key="practitioner.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    start_date: date = Field(index=True)
    end_date: date = Field(index=True)
    start_time: time | None = None
    end_time: time | None = None
    reason: str | None = Field(default=None, max_length=300)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class PractitionerRoomAssignment(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("proom"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    practitioner_id: str = Field(index=True, foreign_key="practitioner.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    department_id: str | None = Field(default=None, index=True)
    room_name: str = Field(index=True, min_length=1, max_length=120)
    assignment_date: date | None = Field(default=None, index=True)
    weekday: int | None = Field(default=None, index=True, ge=0, le=6)
    start_time: time
    end_time: time
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
