from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Index, Numeric
from sqlmodel import Column, Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class ExpenseStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REIMBURSED = "reimbursed"


class ExpenseCategory(str, Enum):
    RENT = "rent"
    UTILITIES = "utilities"
    SUPPLIES = "supplies"
    TRAVEL = "travel"
    MAINTENANCE = "maintenance"
    OTHER = "other"


class Expense(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("expense"), primary_key=True)
    tenant_id: str = Field(index=True)
    branch_id: str | None = Field(default=None, index=True)
    category: ExpenseCategory
    subcategory: str | None = Field(default=None, index=True)
    amount: Decimal = Field(sa_column=Column(Numeric(12, 2)))
    currency: str = Field(default="INR")
    incurred_on: date
    description: str
    status: ExpenseStatus = Field(default=ExpenseStatus.PENDING, index=True)
    submitted_by: str = Field(index=True)
    approved_by: str | None = None
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    rejection_reason: str | None = None
    receipt_file_id: str | None = None
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)

    __table_args__ = (
        Index("ix_expense_tenant_status", "tenant_id", "status"),
        Index("ix_expense_tenant_incurred_on", "tenant_id", "incurred_on"),
    )
