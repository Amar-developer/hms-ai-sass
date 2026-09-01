from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from app.modules.appointments.models import AppointmentStatus
from app.modules.tenants.models import new_id, now_utc


class QueuePriority(str, Enum):
    EMERGENCY = "emergency"
    NORMAL = "normal"


class QueueEntry(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("queue"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    appointment_id: str = Field(index=True, foreign_key="appointment.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    token_number: str = Field(index=True, min_length=2, max_length=40)
    priority: QueuePriority = Field(default=QueuePriority.NORMAL, index=True)
    priority_rank: int = Field(default=2, index=True)
    queue_position: int = Field(default=0, index=True)
    status: AppointmentStatus = Field(default=AppointmentStatus.WAITING, index=True)
    missed_call_count: int = Field(default=0, ge=0)
    called_at: datetime | None = None
    completed_at: datetime | None = None
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class QueueEvent(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("queueevt"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    queue_entry_id: str = Field(index=True, foreign_key="queueentry.id")
    appointment_id: str = Field(index=True, foreign_key="appointment.id")
    action: str = Field(index=True, min_length=3, max_length=120)
    from_status: AppointmentStatus | None = Field(default=None)
    to_status: AppointmentStatus = Field(index=True)
    reason: str | None = Field(default=None, max_length=500)
    actor_user_id: str | None = Field(default=None, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
