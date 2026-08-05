from datetime import date, datetime, time

from pydantic import BaseModel, Field, model_validator

from app.core.validation import BranchId, DepartmentId, UserId
from app.modules.practitioners.models import (
    PractitionerStatus,
    PractitionerType,
    ScheduleDateMode,
)


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
    # weekday is required even for a date-specific row: it is derived from
    # schedule_date server-side, so the recurring-slot queries keep working
    # unchanged for every row.
    weekday: int | None = Field(default=None, ge=0, le=6)
    schedule_date: date | None = None
    date_mode: ScheduleDateMode | None = None
    start_time: time
    end_time: time
    slot_minutes: int = Field(default=15, ge=1, le=240)
    room_name: str | None = Field(default=None, max_length=120)
    room_number: str | None = Field(default=None, max_length=10)
    is_active: bool = True
    actor_user_id: UserId | None = None

    @model_validator(mode="after")
    def _check_recurrence(self) -> "PractitionerScheduleCreate":
        if self.schedule_date is None and self.weekday is None:
            raise ValueError("Provide either a weekday or a schedule date")
        if self.schedule_date is not None:
            # A date row must say how it relates to the weekly recurrence,
            # otherwise the availability engine cannot decide whether it
            # replaces or supplements the normal hours.
            if self.date_mode is None:
                self.date_mode = ScheduleDateMode.OVERRIDE
            self.weekday = self.schedule_date.weekday()
        elif self.date_mode is not None:
            raise ValueError("date_mode only applies to a date-specific schedule")
        return self


class PractitionerScheduleUpdate(BaseModel):
    practitioner_id: str | None = None
    branch_id: BranchId | None = None
    department_id: DepartmentId | None = None
    weekday: int | None = Field(default=None, ge=0, le=6)
    schedule_date: date | None = None
    date_mode: ScheduleDateMode | None = None
    start_time: time | None = None
    end_time: time | None = None
    slot_minutes: int | None = Field(default=None, ge=1, le=240)
    room_name: str | None = Field(default=None, max_length=120)
    room_number: str | None = Field(default=None, max_length=10)
    is_active: bool | None = None
    actor_user_id: UserId | None = None

    @model_validator(mode="after")
    def _sync_weekday(self) -> "PractitionerScheduleUpdate":
        if self.schedule_date is not None:
            if self.date_mode is None:
                self.date_mode = ScheduleDateMode.OVERRIDE
            self.weekday = self.schedule_date.weekday()
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
    weekday: int
    schedule_date: date | None = None
    date_mode: ScheduleDateMode | None = None
    start_time: time
    end_time: time
    slot_minutes: int
    room_name: str | None
    room_number: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PractitionerScheduleSlotRead(BaseModel):
    """One concrete timing row inside a grouped schedule."""

    id: str
    weekday: int
    schedule_date: date | None = None
    date_mode: ScheduleDateMode | None = None
    start_time: time
    end_time: time
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PractitionerScheduleGroupRead(BaseModel):
    """A practitioner's schedule for one branch/department/room/slot-size,
    with every timing row nested under `slots` — the shape the scheduling
    UI actually renders, so it no longer has to regroup flat rows itself."""

    group_key: str
    practitioner_id: str
    practitioner_full_name: str | None = None
    branch_id: str
    branch_name: str | None = None
    department_id: str | None = None
    department_name: str | None = None
    room_name: str | None = None
    room_number: str | None = None
    slot_minutes: int
    is_active: bool
    slots: list[PractitionerScheduleSlotRead]
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
