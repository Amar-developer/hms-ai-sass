from datetime import date, datetime

from pydantic import BaseModel, Field

from app.modules.billing.models import PaymentMethod
from app.modules.patient_subscriptions.models import PatientSubscriptionEnrollmentStatus


class PatientSubscriptionPlanCreate(BaseModel):
    branch_id: str | None = None
    name: str = Field(min_length=2, max_length=160)
    code: str | None = Field(default=None, max_length=60)
    price_amount: int = Field(default=0, ge=0)
    duration_days: int = Field(ge=1)
    activation_after_days: int = Field(default=0, ge=0)
    free_consultations: int = Field(default=0, ge=0)
    free_consultation_department_ids: list[str] = Field(default_factory=list)
    lab_discount_percentage: int = Field(default=0, ge=0, le=100)
    pharmacy_discount_percentage: int = Field(default=0, ge=0, le=100)
    min_discount_amount: int = Field(default=0, ge=0)
    pharmacy_discount_slabs: list[dict[str, int | None]] = Field(default_factory=list)
    free_lab_test_ids: list[str] = Field(default_factory=list)
    free_lab_test_quantities: dict[str, int] = Field(default_factory=dict)
    discounted_lab_test_ids: list[str] = Field(default_factory=list)
    free_medicine_ids: list[str] = Field(default_factory=list)
    free_medicine_quantities: dict[str, int] = Field(default_factory=dict)
    discounted_medicine_ids: list[str] = Field(default_factory=list)
    created_by_user_id: str | None = None


class PatientSubscriptionPlanUpdate(BaseModel):
    branch_id: str | None = None
    name: str | None = Field(default=None, min_length=2, max_length=160)
    code: str | None = Field(default=None, max_length=60)
    price_amount: int | None = Field(default=None, ge=0)
    duration_days: int | None = Field(default=None, ge=1)
    activation_after_days: int | None = Field(default=None, ge=0)
    free_consultations: int | None = Field(default=None, ge=0)
    free_consultation_department_ids: list[str] | None = None
    lab_discount_percentage: int | None = Field(default=None, ge=0, le=100)
    pharmacy_discount_percentage: int | None = Field(default=None, ge=0, le=100)
    min_discount_amount: int | None = Field(default=None, ge=0)
    pharmacy_discount_slabs: list[dict[str, int | None]] | None = None
    free_lab_test_ids: list[str] | None = None
    free_lab_test_quantities: dict[str, int] | None = None
    discounted_lab_test_ids: list[str] | None = None
    free_medicine_ids: list[str] | None = None
    free_medicine_quantities: dict[str, int] | None = None
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
    payment_method: PaymentMethod = PaymentMethod.CASH
    created_by_user_id: str | None = None


class PatientSubscriptionEnrollmentUpdate(BaseModel):
    branch_id: str | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    status: PatientSubscriptionEnrollmentStatus | None = None
    used_consultations: int | None = Field(default=None, ge=0)
    paid_amount: int | None = Field(default=None, ge=0)
    updated_by_user_id: str | None = None


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
    remaining_free_consultations: int = 0
    used_free_lab_count: int = 0
    remaining_free_lab_count: int = 0
    used_free_medicine_count: int = 0
    remaining_free_medicine_count: int = 0
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
    department_id: str | None = None


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
