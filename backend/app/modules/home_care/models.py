from datetime import date, datetime

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class HomeCareService(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("hcsvc"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    code: str = Field(index=True, min_length=2, max_length=60)
    name: str = Field(index=True, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    default_price: int = Field(default=0, ge=0)
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class HomeCareBooking(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("hcbook"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    assigned_staff_user_id: str | None = Field(default=None, index=True, foreign_key="user.id")
    assigned_staff_name: str | None = Field(default=None, index=True, max_length=160)
    staff_type: str | None = Field(default=None, index=True, max_length=80)
    booking_number: str = Field(index=True, min_length=3, max_length=60)
    recurrence: str = Field(default="daily", index=True, max_length=40)
    start_date: date = Field(default_factory=date.today, index=True)
    end_date: date | None = Field(default=None, index=True)
    status: str = Field(default="requested", index=True, max_length=40)
    complaints: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class HomeCareBookingItem(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("hcitem"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    booking_id: str = Field(index=True, foreign_key="homecarebooking.id")
    service_id: str | None = Field(default=None, index=True, foreign_key="homecareservice.id")
    description: str = Field(max_length=260)
    quantity: int = Field(default=1, ge=1)
    unit_amount: int = Field(default=0, ge=0)
    total_amount: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=now_utc, index=True)
