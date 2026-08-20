from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field
from app.core.validation import BranchId
from app.modules.expenses.models import ExpenseCategory, ExpenseStatus


class ExpenseCreate(BaseModel):
    branch_id: BranchId | None = None
    category: ExpenseCategory
    subcategory: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(gt=0, decimal_places=2)
    currency: str = Field(default="INR", max_length=3)
    incurred_on: date
    description: str = Field(min_length=1, max_length=500)


class ExpenseUpdate(BaseModel):
    branch_id: BranchId | None = None
    category: ExpenseCategory
    subcategory: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(gt=0, decimal_places=2)
    currency: str = Field(default="INR", max_length=3)
    incurred_on: date
    description: str = Field(min_length=0, max_length=500)


class ExpenseRejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ExpenseAttachReceiptRequest(BaseModel):
    reciept_file_id: str = Field(min_length=1)


class ExpenseRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str | None
    currency: str
    amount: Decimal
    category: ExpenseCategory
    subcategory: str | None
    incurred_on: date
    description: str
    status: ExpenseStatus
    submitted_by: str
    approved_by: str | None
    created_by_user_id: str | None
    updated_by_user_id: str | None
    rejection_reason: str | None
    receipt_file_id: str | None
    created_at: datetime
    updated_at: datetime
