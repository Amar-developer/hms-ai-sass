from datetime import date, datetime

from pydantic import BaseModel, Field

from app.modules.patient_subscriptions.models import PatientSubscriptionEnrollmentStatus


class PatientSubscriptionPlanCreate(BaseModel):
    branch_id: str | None = None
    name: str = Field(min_length=2, max_length=160)
    code: str | None = Field(default=None, max_length=60)
    price_amount: int = Field(default=0, ge=0)
    duration_days: int = Field(default=30, ge=1)
    free_consultations: int = Field(default=0, ge=0)
    lab_discount_percentage: int = Field(default=0, ge=0, le=100)
    pharmacy_discount_percentage: int = Field(default=0, ge=0, le=100)
    free_lab_test_ids: list[str] = Field(default_factory=list)
    discounted_lab_test_ids: list[str] = Field(default_factory=list)
    free_medicine_ids: list[str] = Field(default_factory=list)
    discounted_medicine_ids: list[str] = Field(default_factory=list)
    created_by_user_id: str | None = None


class PatientSubscriptionPlanUpdate(BaseModel):
    branch_id: str | None = None
    name: str | None = Field(default=None, min_length=2, max_length=160)
    code: str | None = Field(default=None, max_length=60)
    price_amount: int | None = Field(default=None, ge=0)
    duration_days: int | None = Field(default=None, ge=1)
    free_consultations: int | None = Field(default=None, ge=0)
    lab_discount_percentage: int | None = Field(default=None, ge=0, le=100)
    pharmacy_discount_percentage: int | None = Field(default=None, ge=0, le=100)
    free_lab_test_ids: list[str] | None = None
    discounted_lab_test_ids: list[str] | None = None
    free_medicine_ids: list[str] | None = None
    discounted_medicine_ids: list[str] | None = None
    is_active: bool | None = None
    updated_by_user_id: str | None = None


class PatientSubscriptionPlanRead(PatientSubscriptionPlanCreate):
    id: str
    tenant_id: str
    is_active: bool
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class PatientSubscriptionEnrollmentCreate(BaseModel):
    branch_id: str | None = None
    patient_id: str
    plan_id: str
    starts_on: date = Field(default_factory=date.today)
    paid_amount: int | None = Field(default=None, ge=0)
    created_by_user_id: str | None = None


class PatientSubscriptionEnrollmentRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    patient_id: str
    plan_id: str
    starts_on: date
    ends_on: date
    status: PatientSubscriptionEnrollmentStatus
    used_consultations: int
    paid_amount: int
    purchase_invoice_id: str | None = None
    created_by_user_id: str | None
    cancelled_by_user_id: str | None
    created_at: datetime
    updated_at: datetime
    plan: PatientSubscriptionPlanRead | None = None


class PatientBenefitPreviewRequest(BaseModel):
    patient_id: str
    branch_id: str
    service_type: str = Field(pattern="^(consultation|lab|pharmacy)$")
    item_ids: list[str] = Field(default_factory=list)
    subtotal_amount: int = Field(default=0, ge=0)


class PatientBenefitPreviewRead(BaseModel):
    has_active_subscription: bool
    plan_id: str | None = None
    plan_name: str | None = None
    service_type: str
    subtotal_amount: int
    discount_amount: int
    payable_amount: int
    free_item_ids: list[str] = Field(default_factory=list)
    discounted_item_ids: list[str] = Field(default_factory=list)
    reason: str | None = None
