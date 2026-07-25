from datetime import datetime
from datetime import date

from pydantic import BaseModel, Field

from app.core.validation import PlanId, TenantId
from app.modules.subscriptions.models import (
    CreditStatus,
    SubscriptionInvoiceStatus,
    SubscriptionStatus,
)


class SubscriptionPlanCreate(BaseModel):
    key: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=2, max_length=160)
    monthly_patient_limit: int = Field(default=300, ge=0)
    monthly_whatsapp_message_limit: int = Field(default=0, ge=0)
    included_branches: int = Field(default=1, ge=0)
    included_doctors: int = Field(default=1, ge=0)
    price_inr_monthly: int = Field(default=0, ge=0)
    enabled_modules: list[str] = Field(default_factory=list)


class SubscriptionPlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    monthly_patient_limit: int | None = Field(default=None, ge=0)
    monthly_whatsapp_message_limit: int | None = Field(default=None, ge=0)
    included_branches: int | None = Field(default=None, ge=0)
    included_doctors: int | None = Field(default=None, ge=0)
    price_inr_monthly: int | None = Field(default=None, ge=0)
    enabled_modules: list[str] | None = None


class SubscriptionPlanStatusUpdate(BaseModel):
    is_active: bool


class SubscriptionPlanRead(SubscriptionPlanCreate):
    id: str
    is_active: bool
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime


class TenantSubscriptionCreate(BaseModel):
    plan_id: PlanId
    starts_on: date
    ends_on: date | None = None
    is_trial: bool = False
    billing_amount: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=1000)


class TenantSubscriptionRead(TenantSubscriptionCreate):
    id: str
    tenant_id: str
    is_active: bool
    status: SubscriptionStatus
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime


class SubscriptionCreditCreate(BaseModel):
    tenant_id: TenantId | None = None
    subscription_id: str | None = None
    credit_type: str = Field(default="patients", max_length=80)
    quantity: int = Field(ge=1)
    amount: int = Field(default=0, ge=0)
    starts_on: date = Field(default_factory=date.today)
    expires_on: date | None = None
    reason: str | None = Field(default=None, max_length=500)


class SubscriptionCreditRead(SubscriptionCreditCreate):
    id: str
    tenant_id: str
    used_quantity: int
    status: CreditStatus
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime


class SubscriptionInvoiceCreate(BaseModel):
    tenant_id: TenantId | None = None
    subscription_id: str | None = None
    credit_id: str | None = None
    description: str = Field(default="", max_length=500)
    amount: int = Field(default=0, ge=0)
    tax_amount: int = Field(default=0, ge=0)
    due_on: date | None = None


class SubscriptionInvoiceRead(SubscriptionInvoiceCreate):
    id: str
    tenant_id: str
    invoice_number: str
    status: SubscriptionInvoiceStatus
    issued_on: date
    paid_on: date | None = None
    taxable_amount: int = 0
    tax_amount: int = 0
    total_amount: int = 0
    paid_amount: int = 0
    balance_amount: int = 0
    payment_method: str | None = None
    payment_reference: str | None = None
    gateway_transaction_id: str | None = None
    gateway_status: str | None = None
    failed_reason: str | None = None
    last_payment_attempt_at: datetime | None = None
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime


class SubscriptionUsageRead(BaseModel):
    tenant_id: str
    plan_key: str
    plan_name: str
    subscription_status: SubscriptionStatus
    starts_on: date
    ends_on: date | None
    monthly_patient_limit: int
    additional_patient_credits: int
    effective_patient_limit: int
    current_patient_count: int
    remaining_patient_count: int
    usage_percentage: float
    days_to_expiry: int | None
    alerts: list[str]


class SubscriptionRevenueSummary(BaseModel):
    total_active_subscriptions: int
    scheduled_subscriptions: int
    expiring_in_7_days: int
    estimated_monthly_recurring_revenue: int
    issued_invoice_amount: int
    paid_invoice_amount: int
    pending_invoice_amount: int
    credit_revenue_amount: int
    failed_invoice_amount: int = 0


class SubscriptionInvoiceSettlementCreate(BaseModel):
    amount: int = Field(gt=0)
    payment_method: str = Field(default="bank_transfer", max_length=80)
    payment_reference: str | None = Field(default=None, max_length=160)
    gateway_transaction_id: str | None = Field(default=None, max_length=160)
    gateway_status: str | None = Field(default="captured", max_length=80)


class SubscriptionInvoiceFailureCreate(BaseModel):
    failed_reason: str = Field(min_length=2, max_length=500)
    gateway_transaction_id: str | None = Field(default=None, max_length=160)
    gateway_status: str | None = Field(default="failed", max_length=80)


class SubscriptionRevenueReport(BaseModel):
    rows: list[dict]
    total_invoice_amount: int
    total_paid_amount: int
    total_pending_amount: int
    total_tax_amount: int
    total_failed_amount: int
    mrr_by_plan: list[dict]
    page: int
    page_size: int
    total_rows: int


class SubscriptionAnnouncementRead(BaseModel):
    tenant_id: str
    severity: str
    message: str
    action: str | None = None


class EntitlementRead(BaseModel):
    tenant_id: str
    plan_key: str
    plan_name: str
    is_trial: bool
    starts_on: date
    ends_on: date | None
    monthly_patient_limit: int
    included_branches: int
    additional_patient_credits: int = 0
    effective_patient_limit: int
    current_patient_count: int
    remaining_patient_count: int
    is_expired: bool
    enabled_modules: list[str]
