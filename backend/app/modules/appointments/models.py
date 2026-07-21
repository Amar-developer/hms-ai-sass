from datetime import date, datetime, time
from enum import Enum
from sqlalchemy import Index, UniqueConstraint
from sqlmodel import Field, SQLModel
from app.modules.tenants.models import new_id, now_utc


class AppointmentType(str, Enum):
    OP = "op"
    WALK_IN = "walk_in"
    FOLLOW_UP = "follow_up"
    DOCTOR_REVIEW = "doctor_review"
    FITNESS_CERTIFICATE = "fitness_certificate"
    ONLINE = "online"
    HOME_VISIT = "home_visit"
    EMERGENCY = "emergency"


class AppointmentStatus(str, Enum):
    SCHEDULED = "scheduled"
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    WAITING = "waiting"
    CALLED = "called"
    PATIENT_NOT_AVAILABLE = "patient_not_available"
    REQUEUED = "requeued"
    IN_CONSULTATION = "in_consultation"
    CONSULTATION_COMPLETED = "consultation_completed"
    BILLED = "billed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class Appointment(SQLModel, table=True):
    __table_args__ = (
        Index(
            "ix_appointment_tenant_branch_date",
            "tenant_id",
            "branch_id",
            "appointment_date",
        ),
    )

    id: str = Field(default_factory=lambda: new_id("appt"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    department_id: str | None = Field(
        default=None, index=True, foreign_key="department.id"
    )
    practitioner_id: str | None = Field(default=None, index=True)
    appointment_type: AppointmentType = Field(default=AppointmentType.OP, index=True)
    status: AppointmentStatus = Field(default=AppointmentStatus.SCHEDULED, index=True)
    appointment_date: date = Field(index=True)
    appointment_time: time | None = None
    reason: str | None = Field(default=None, max_length=500)
    visit_purpose: str | None = Field(default=None, max_length=120, index=True)
    source_appointment_id: str | None = Field(default=None, index=True)
    is_billable: bool = Field(default=True, index=True)
    # Custom consultation price set at booking for non-OP visit types
    # (follow-up, doctor review, fitness certificate, etc.). OP keeps the
    # configured fee rule price. None means "use the fee rule".
    custom_fee_amount: int | None = Field(default=None)
    billing_note: str | None = Field(default=None, max_length=500)
    emergency_reason: str | None = Field(default=None, max_length=500)
    intake_vitals: str | None = Field(default=None, max_length=1000)
    intake_complaints: str | None = Field(default=None, max_length=2000)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class AppointmentIdempotencyKey(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "user_id",
            "idempotency_key",
            name="uq_appointment_idempotency_key_scope",
        ),
    )

    id: str = Field(default_factory=lambda: new_id("apptidem"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    user_id: str = Field(index=True)
    idempotency_key: str = Field(index=True, max_length=200)
    request_hash: str = Field(max_length=64)
    booking_json: str
    appointment_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
