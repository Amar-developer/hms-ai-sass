from datetime import date, datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class PatientSubscriptionStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class PatientSubscriptionEnrollmentStatus(str, Enum):
    ACTIVE = "active"
    QUEUED = "queued"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class PatientSubscriptionPlan(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("ptplan"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    name: str = Field(min_length=2, max_length=160)
    code: str | None = Field(default=None, index=True, max_length=60)
    price_amount: int = Field(default=0, ge=0)
    duration_days: int = Field(ge=1)
    activation_after_days: int = Field(default=0, ge=0)
    free_consultations: int = Field(default=0, ge=0)
    free_consultation_department_ids_json: str = Field(default="[]")
    lab_discount_percentage: int = Field(default=0, ge=0, le=100)
    pharmacy_discount_percentage: int = Field(default=0, ge=0, le=100)
    min_discount_amount: int = Field(default=0, ge=0)
    pharmacy_discount_slabs_json: str = Field(default="[]")
    free_lab_test_ids_json: str = Field(default="[]")
    discounted_lab_test_ids_json: str = Field(default="[]")
    free_medicine_ids_json: str = Field(default="[]")
    discounted_medicine_ids_json: str = Field(default="[]")
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class PatientSubscriptionEnrollment(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("ptsub"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    plan_id: str = Field(index=True, foreign_key="patientsubscriptionplan.id")
    starts_on: date = Field(default_factory=date.today)
    ends_on: date
    # Set when the enrollment actually starts granting benefits. For queued
    # plans, starts_on/ends_on hold the expected future validity period and are
    # recalculated together with activated_on on the actual promotion date.
    # created_at remains the purchase timestamp.
    activated_on: date | None = Field(default=None)
    status: PatientSubscriptionEnrollmentStatus = Field(
        default=PatientSubscriptionEnrollmentStatus.ACTIVE, index=True
    )
    used_consultations: int = Field(default=0, ge=0)
    used_free_lab_json: str = Field(default="{}")
    used_free_medicine_json: str = Field(default="{}")
    paid_amount: int = Field(default=0, ge=0)
    purchase_invoice_id: str | None = Field(
        default=None, index=True, foreign_key="invoice.id"
    )
    created_by_user_id: str | None = Field(default=None, index=True)
    cancelled_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
