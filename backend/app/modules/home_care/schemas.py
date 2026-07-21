from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.validation import BranchId, PatientId, UserId


class HomeCareServiceCreate(BaseModel):
    branch_id: BranchId | None = None
    code: str | None = Field(default=None, min_length=2, max_length=60)
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    mrp_price: int = Field(default=0, ge=0)
    default_price: int = Field(default=0, ge=0)


class HomeCareServiceUpdate(BaseModel):
    branch_id: BranchId | None = None
    code: str | None = Field(default=None, min_length=2, max_length=60)
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    mrp_price: int | None = Field(default=None, ge=0)
    default_price: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class HomeCareServiceRead(HomeCareServiceCreate):
    id: str
    tenant_id: str
    code: str
    is_active: bool
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class HomeCareBookingItemCreate(BaseModel):
    service_id: str | None = None
    service_category: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=260)
    quantity: int = Field(default=1, ge=1)
    unit_amount: int | None = Field(default=None, ge=0)


class HomeCareBookingItemRead(HomeCareBookingItemCreate):
    id: str
    tenant_id: str
    booking_id: str
    description: str
    service_category: str
    unit_amount: int
    total_amount: int
    created_at: datetime


class HomeCareVisitLogCreate(BaseModel):
    visit_date: date | None = None
    assigned_staff_user_id: UserId | None = None
    assigned_staff_name: str | None = Field(default=None, max_length=160)
    staff_type: str | None = Field(default=None, max_length=80)
    service_id: str | None = None
    service_category: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=260)
    quantity: int = Field(default=1, ge=1)
    unit_amount: int | None = Field(default=None, ge=0)
    status: str = Field(default="completed", max_length=40)
    notes: str | None = Field(default=None, max_length=1000)


class HomeCareVisitLogUpdate(BaseModel):
    visit_date: date | None = None
    assigned_staff_user_id: UserId | None = None
    assigned_staff_name: str | None = Field(default=None, max_length=160)
    staff_type: str | None = Field(default=None, max_length=80)
    service_id: str | None = None
    service_category: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=260)
    quantity: int | None = Field(default=None, ge=1)
    unit_amount: int | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=1000)


class HomeCareVisitLogRead(HomeCareVisitLogCreate):
    id: str
    tenant_id: str
    booking_id: str
    visit_date: date
    service_category: str
    description: str
    unit_amount: int
    total_amount: int
    status: str
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class HomeCareBookingCreate(BaseModel):
    branch_id: BranchId
    patient_id: PatientId
    assigned_staff_user_id: UserId | None = None
    assigned_staff_name: str | None = Field(default=None, max_length=160)
    staff_type: str | None = Field(default=None, max_length=80)
    booking_type: str = Field(max_length=40)
    recurrence: str = Field(max_length=40)
    start_date: date
    end_date: date
    status: str = Field(default="requested", max_length=40)
    location: str = Field(min_length=2, max_length=500)
    complaints: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)
    services: list[HomeCareBookingItemCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_booking_requirements(self) -> "HomeCareBookingCreate":
        booking_type = self.booking_type.lower()
        status = self.status.lower()
        if self.start_date is None:
            raise ValueError("Start date is required")
        if self.end_date is None:
            raise ValueError("End date is required")
        if self.end_date < self.start_date:
            raise ValueError("End date must be on or after start date")
        if not self.location or not self.location.strip():
            raise ValueError("Location is required")
        if not self.services:
            raise ValueError("At least one service is required")
        if status in {"assigned", "scheduled", "in_progress", "completed"}:
            if not self.assigned_staff_user_id:
                raise ValueError("Assigned staff is required for this booking status")
        for service in self.services:
            if service.unit_amount is None and not service.service_id:
                raise ValueError("Service price is required")
            if booking_type == "home_visit" and not service.service_id:
                raise ValueError("Home visit service is required")
            if booking_type == "home_care" and not service.service_id:
                if not service.description or not service.description.strip():
                    raise ValueError("Home care service description is required")
        return self


class HomeCareBookingUpdate(BaseModel):
    assigned_staff_user_id: UserId | None = None
    assigned_staff_name: str | None = Field(default=None, max_length=160)
    staff_type: str | None = Field(default=None, max_length=80)
    booking_type: str | None = Field(default=None, max_length=40)
    recurrence: str | None = Field(default=None, max_length=40)
    start_date: date | None = None
    end_date: date | None = None
    status: str | None = Field(default=None, max_length=40)
    location: str | None = Field(default=None, max_length=500)
    complaints: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)
    services: list[HomeCareBookingItemCreate] | None = None


class HomeCareBookingRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    patient_id: str
    assigned_staff_user_id: str | None
    assigned_staff_name: str | None = None
    staff_type: str | None = None
    booking_type: str = "home_care"
    booking_number: str
    recurrence: str
    start_date: date
    end_date: date | None
    status: str
    location: str | None
    complaints: str | None
    notes: str | None
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime
    services: list[HomeCareBookingItemRead] = Field(default_factory=list)
    visit_logs: list[HomeCareVisitLogRead] = Field(default_factory=list)


class HomeCareInvoiceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tax_rule_id: str | None = None
    discount_offer_id: str | None = None
    created_by_user_id: UserId | None = None
