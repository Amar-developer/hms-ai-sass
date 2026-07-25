from datetime import date, datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class SubscriptionStatus(str, Enum):
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class CreditStatus(str, Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class SubscriptionInvoiceStatus(str, Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    PAID = "paid"
    CANCELLED = "cancelled"


class SubscriptionPlan(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("plan"), primary_key=True)
    key: str = Field(index=True, unique=True, min_length=2, max_length=80)
    name: str = Field(min_length=2, max_length=160)
    monthly_patient_limit: int = Field(default=300, ge=0)
    monthly_whatsapp_message_limit: int = Field(default=0, ge=0)
    included_branches: int = Field(default=1, ge=0)
    included_doctors: int = Field(default=1, ge=0)
    price_inr_monthly: int = Field(default=0, ge=0)
    enabled_modules_json: str = Field(default="[]")
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class TenantSubscription(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("sub"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    plan_id: str = Field(index=True, foreign_key="subscriptionplan.id")
    starts_on: date
    ends_on: date | None = Field(default=None)
    is_active: bool = Field(default=True, index=True)
    is_trial: bool = Field(default=False, index=True)
    status: SubscriptionStatus = Field(default=SubscriptionStatus.ACTIVE, index=True)
    billing_amount: int = Field(default=0, ge=0)
    notes: str | None = Field(default=None, max_length=1000)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class SubscriptionCredit(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("credit"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    subscription_id: str | None = Field(
        default=None, index=True, foreign_key="tenantsubscription.id"
    )
    credit_type: str = Field(default="patients", index=True, max_length=80)
    quantity: int = Field(default=0, ge=0)
    used_quantity: int = Field(default=0, ge=0)
    amount: int = Field(default=0, ge=0)
    starts_on: date = Field(default_factory=date.today)
    expires_on: date | None = Field(default=None)
    status: CreditStatus = Field(default=CreditStatus.ACTIVE, index=True)
    reason: str | None = Field(default=None, max_length=500)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class SubscriptionInvoice(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("subinv"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    subscription_id: str | None = Field(
        default=None, index=True, foreign_key="tenantsubscription.id"
    )
    credit_id: str | None = Field(
        default=None, index=True, foreign_key="subscriptioncredit.id"
    )
    invoice_number: str = Field(index=True, max_length=80)
    description: str = Field(default="", max_length=500)
    amount: int = Field(default=0, ge=0)
    taxable_amount: int = Field(default=0, ge=0)
    tax_amount: int = Field(default=0, ge=0)
    total_amount: int = Field(default=0, ge=0)
    paid_amount: int = Field(default=0, ge=0)
    balance_amount: int = Field(default=0, ge=0)
    status: SubscriptionInvoiceStatus = Field(
        default=SubscriptionInvoiceStatus.ISSUED, index=True
    )
    issued_on: date = Field(default_factory=date.today)
    due_on: date | None = Field(default=None)
    paid_on: date | None = Field(default=None)
    payment_method: str | None = Field(default=None, max_length=80)
    payment_reference: str | None = Field(default=None, max_length=160)
    gateway_transaction_id: str | None = Field(default=None, index=True, max_length=160)
    gateway_status: str | None = Field(default=None, index=True, max_length=80)
    failed_reason: str | None = Field(default=None, max_length=500)
    last_payment_attempt_at: datetime | None = Field(default=None, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)
