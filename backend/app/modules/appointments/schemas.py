from datetime import date, datetime, time

from pydantic import BaseModel, Field

from app.core.validation import (
    AppointmentId,
    BranchId,
    DepartmentId,
    PatientId,
    PractitionerId,
    UserId,
)
from app.modules.appointments.models import AppointmentStatus, AppointmentType
from app.modules.queue.models import QueuePriority


class AppointmentCreate(BaseModel):
    branch_id: BranchId
    patient_id: PatientId
    department_id: DepartmentId
    practitioner_id: PractitionerId
    appointment_type: AppointmentType = AppointmentType.OP
    appointment_date: date
    appointment_time: time | None = None
    reason: str | None = Field(default=None, max_length=500)
    visit_purpose: str | None = Field(default=None, max_length=120)
    source_appointment_id: AppointmentId | None = None
    is_billable: bool | None = None
    custom_fee_amount: int | None = Field(default=None, ge=0)
    billing_note: str | None = Field(default=None, max_length=500)
    emergency_reason: str | None = Field(default=None, max_length=500)
    intake_vitals: str | None = Field(default=None, max_length=1000)
    intake_complaints: str | None = Field(default=None, max_length=2000)
    created_by_user_id: UserId | None = None


class FollowUpAppointmentCreate(BaseModel):
    appointment_date: date
    appointment_time: time | None = None
    reason: str | None = Field(default=None, max_length=500)
    is_billable: bool = True
    billing_note: str | None = Field(default=None, max_length=500)
    created_by_user_id: UserId | None = None


class AppointmentRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    patient_id: str
    department_id: str | None
    practitioner_id: str | None
    appointment_type: AppointmentType
    status: AppointmentStatus
    appointment_date: date
    appointment_time: time | None
    reason: str | None
    visit_purpose: str | None
    source_appointment_id: str | None
    is_billable: bool
    custom_fee_amount: int | None = None
    billing_note: str | None
    emergency_reason: str | None
    intake_vitals: str | None
    intake_complaints: str | None
    created_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class AppointmentBookingRead(BaseModel):
    appointment: AppointmentRead
    queue_entry: "QueueEntryRead"


class AppointmentGridRead(BaseModel):
    id: str
    tenant_id: str
    tenant_name: str
    branch_id: str
    branch_name: str
    patient_id: str
    patient_name: str
    patient_mobile: str | None
    department_id: str | None
    department_name: str | None
    practitioner_id: str | None
    practitioner_name: str | None
    token_number: str | None
    appointment_type: AppointmentType
    visit_purpose: str | None
    reason: str | None = None
    source_appointment_id: str | None = None
    is_billable: bool
    custom_fee_amount: int | None = None
    billing_note: str | None = None
    emergency_reason: str | None = None
    intake_vitals: str | None = None
    intake_complaints: str | None = None
    appointment_date: date
    appointment_time: time | None
    status: AppointmentStatus
    consultation_status: str | None
    created_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime


class QueueEntryRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    appointment_id: str
    patient_id: str
    token_number: str
    priority: QueuePriority
    priority_rank: int
    queue_position: int
    status: AppointmentStatus
    missed_call_count: int
    called_at: datetime | None
    completed_at: datetime | None
    token_language: str | None = None
    display_text: str | None = None
    call_message: str | None = None
    created_at: datetime
    updated_at: datetime


class QueueTransitionRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)
    actor_user_id: UserId | None = None


class RequeueRequest(QueueTransitionRequest):
    place_at_end: bool = True


class QueueDisplayRead(BaseModel):
    id: str
    token_number: str
    patient_id: str
    appointment_id: str
    priority: str
    status: AppointmentStatus
    queue_position: int
    display_text: str
    call_message: str


AppointmentBookingRead.model_rebuild()
