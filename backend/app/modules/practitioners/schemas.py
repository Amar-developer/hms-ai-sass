from datetime import date, datetime, time

from pydantic import BaseModel, Field, model_validator

from app.core.validation import BranchId, DepartmentId, UserId
from app.modules.practitioners.models import PractitionerStatus, PractitionerType
from app.modules.practitioners.schedule_days import ScheduleMode


class PractitionerCreate(BaseModel):
    user_id: UserId | None = None
    full_name: str = Field(min_length=2, max_length=180)
    practitioner_type: PractitionerType = PractitionerType.DOCTOR
    primary_specialty: str | None = Field(default=None, max_length=160)
    registration_number: str | None = Field(default=None, max_length=120)
    mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=220)
    signature_url: str | None = Field(default=None, max_length=500)
    branch_ids: list[BranchId] = Field(min_length=1)
    department_ids: list[DepartmentId] = Field(min_length=1)
    actor_user_id: UserId | None = None


class PractitionerUpdate(BaseModel):
    user_id: UserId | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=180)
    practitioner_type: PractitionerType | None = None
    primary_specialty: str | None = Field(default=None, max_length=160)
    registration_number: str | None = Field(default=None, max_length=120)
    mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=220)
    signature_url: str | None = Field(default=None, max_length=500)
    status: PractitionerStatus | None = None
    branch_ids: list[BranchId] | None = None
    department_ids: list[DepartmentId] | None = None
    actor_user_id: UserId | None = None


class PractitionerRead(BaseModel):
    id: str
    tenant_id: str
    user_id: str | None
    practitioner_number: str | None = None
    full_name: str
    practitioner_type: PractitionerType
    primary_specialty: str | None
    registration_number: str | None
    mobile: str | None
    email: str | None
    signature_url: str | None = None
    status: PractitionerStatus
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime
    branch_ids: list[str] = []
    department_ids: list[str] = []


class PractitionerEligibilityRead(BaseModel):
    practitioner_id: str
    tenant_id: str
    branch_id: str
    department_id: str | None
    eligible: bool


class PractitionerScheduleCreate(BaseModel):
    branch_id: BranchId
    department_id: DepartmentId | None = None
    mode: ScheduleMode = ScheduleMode.CUSTOM
    # Only consulted when mode == custom; daily/mon_saturday are always
    # resolved server-side so a client can't send a mismatched combination.
    weekdays: list[int] = Field(default_factory=list)
    start_time: time
    end_time: time
    slot_minutes: int = Field(default=15, ge=1, le=240)
    is_active: bool = True
    actor_user_id: UserId | None = None

    @model_validator(mode="after")
    def _check_weekdays(self) -> "PractitionerScheduleCreate":
        if self.mode == ScheduleMode.CUSTOM and not self.weekdays:
            raise ValueError("Select at least one weekday")
        if any(day < 0 or day > 6 for day in self.weekdays):
            raise ValueError("weekdays must be between 0 (Monday) and 6 (Sunday)")
        return self


class PractitionerScheduleUpdate(BaseModel):
    practitioner_id: str | None = None
    branch_id: BranchId | None = None
    department_id: DepartmentId | None = None
    mode: ScheduleMode | None = None
    weekdays: list[int] | None = None
    start_time: time | None = None
    end_time: time | None = None
    slot_minutes: int | None = Field(default=None, ge=1, le=240)
    is_active: bool | None = None
    actor_user_id: UserId | None = None

    @model_validator(mode="after")
    def _check_weekdays(self) -> "PractitionerScheduleUpdate":
        if self.mode == ScheduleMode.CUSTOM and not self.weekdays:
            raise ValueError("Select at least one weekday")
        if self.weekdays and any(day < 0 or day > 6 for day in self.weekdays):
            raise ValueError("weekdays must be between 0 (Monday) and 6 (Sunday)")
        return self


class PractitionerScheduleRead(BaseModel):
    id: str
    tenant_id: str
    practitioner_id: str
    practitioner_full_name: str | None = None
    branch_id: str
    branch_name: str | None = None
    department_id: str | None
    department_name: str | None = None
    mode: ScheduleMode
    weekdays: list[int] = Field(default_factory=list)
    start_time: time
    end_time: time
    slot_minutes: int
    is_active: bool
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime


class PractitionerLeaveCreate(BaseModel):
    branch_id: BranchId | None = None
    start_date: date
    end_date: date
    start_time: time | None = None
    end_time: time | None = None
    reason: str | None = Field(default=None, max_length=300)
    actor_user_id: UserId | None = None


class PractitionerLeaveRead(BaseModel):
    id: str
    tenant_id: str
    practitioner_id: str
    branch_id: str | None
    start_date: date
    end_date: date
    start_time: time | None
    end_time: time | None
    reason: str | None
    is_active: bool
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime


class PractitionerRoomAssignmentCreate(BaseModel):
    branch_id: BranchId
    department_id: DepartmentId | None = None
    room_name: str = Field(min_length=1, max_length=120)
    assignment_date: date | None = None
    weekday: int | None = Field(default=None, ge=0, le=6)
    start_time: time
    end_time: time
    actor_user_id: UserId | None = None


class PractitionerRoomAssignmentRead(BaseModel):
    id: str
    tenant_id: str
    practitioner_id: str
    branch_id: str
    department_id: str | None
    room_name: str
    assignment_date: date | None
    weekday: int | None
    start_time: time
    end_time: time
    is_active: bool
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime


class PractitionerAvailabilityRead(BaseModel):
    practitioner_id: str
    tenant_id: str
    branch_id: str
    department_id: str | None
    appointment_date: date
    appointment_time: time
    available: bool
    reason: str | None = None
    schedule_id: str | None = None
    room_name: str | None = None


class PractitionerSlotRead(BaseModel):
    appointment_date: date
    start_time: time
    end_time: time
    status: str
    available: bool
    reason: str | None = None
    schedule_id: str | None = None
    room_name: str | None = None


class PractitionerCalendarDayRead(BaseModel):
    appointment_date: date
    weekday: int
    total_slots: int
    available_slots: int
    slots: list[PractitionerSlotRead]


class PractitionerCalendarRead(BaseModel):
    practitioner_id: str
    tenant_id: str
    branch_id: str
    department_id: str | None
    start_date: date
    end_date: date
    days: list[PractitionerCalendarDayRead]
