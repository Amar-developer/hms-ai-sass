from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.pharmacy.models import PharmacyIssueSource, PharmacyIssueStatus, StockLedgerMovement


class MedicineCreate(BaseModel):
    branch_id: str | None = None
    code: str = Field(min_length=2, max_length=60)
    name: str = Field(min_length=2, max_length=220)
    generic_name: str | None = Field(default=None, max_length=220)
    form: str | None = Field(default=None, max_length=80)
    strength: str | None = Field(default=None, max_length=80)
    manufacturer: str | None = Field(default=None, max_length=220)
    supplier_id: str | None = None
    purchase_price: int = Field(default=0, ge=0)
    default_sale_price: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=0, ge=0)
    created_by_user_id: str | None = None


class MedicineUpdate(BaseModel):
    branch_id: str | None = None
    code: str | None = Field(default=None, min_length=2, max_length=60)
    name: str | None = Field(default=None, min_length=2, max_length=220)
    generic_name: str | None = Field(default=None, max_length=220)
    form: str | None = Field(default=None, max_length=80)
    strength: str | None = Field(default=None, max_length=80)
    manufacturer: str | None = Field(default=None, max_length=220)
    supplier_id: str | None = None
    purchase_price: int | None = Field(default=None, ge=0)
    default_sale_price: int | None = Field(default=None, ge=0)
    reorder_level: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
    updated_by_user_id: str | None = None


class MedicineRead(MedicineCreate):
    id: str
    tenant_id: str
    is_active: bool
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class SupplierCreate(BaseModel):
    name: str = Field(min_length=2, max_length=220)
    gstin: str | None = Field(default=None, max_length=40)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=500)
    created_by_user_id: str | None = None


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=220)
    gstin: str | None = Field(default=None, max_length=40)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class SupplierRead(SupplierCreate):
    id: str
    tenant_id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PurchaseItemCreate(BaseModel):
    medicine_id: str
    batch_number: str = Field(min_length=1, max_length=120)
    expiry_date: datetime | None = None
    quantity: int = Field(gt=0)
    cost_price: int = Field(default=0, ge=0)
    sale_price: int = Field(default=0, ge=0)
    discount_percentage: int = Field(default=0, ge=0)
    cgst_percentage: int = Field(default=0, ge=0)
    sgst_percentage: int = Field(default=0, ge=0)


class PurchaseCreate(BaseModel):
    branch_id: str
    supplier_id: str | None = None
    purchase_order_id: str | None = Field(default=None, max_length=120)
    invoice_number: str | None = Field(default=None, max_length=120)
    purchase_date: datetime | None = None
    discount_percentage: int = Field(default=0, ge=0)
    items: list[PurchaseItemCreate] = Field(min_length=1)
    purchased_by_user_id: str | None = None


class MedicineBatchRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    medicine_id: str
    purchase_id: str | None
    batch_number: str
    expiry_date: datetime | None
    quantity_on_hand: int
    cost_price: int
    sale_price: int
    created_at: datetime
    updated_at: datetime


class PurchaseRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    supplier_id: str | None
    purchase_order_id: str | None
    invoice_number: str | None
    purchase_date: datetime
    discount_percentage: int
    discount_amount: int
    taxable_amount: int
    cgst_amount: int
    sgst_amount: int
    gst_amount: int
    total_amount: int
    purchased_by_user_id: str | None
    created_at: datetime
    updated_at: datetime
    batches: list[MedicineBatchRead] = []


class PharmacyIssueItemCreate(BaseModel):
    medicine_id: str | None = None
    substitute_for_medicine_id: str | None = None
    batch_id: str | None = None
    medicine_name: str | None = Field(default=None, max_length=220)
    quantity: int = Field(default=1, gt=0)
    unit_price: int = Field(default=0, ge=0)


class PharmacyIssueItemRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    pharmacy_issue_id: str
    medicine_id: str | None
    substitute_for_medicine_id: str | None
    batch_id: str | None
    medicine_name: str
    quantity: int
    unit_price: int
    dispensed_quantity: int
    created_at: datetime
    updated_at: datetime


class PharmacyIssueCreate(BaseModel):
    branch_id: str
    patient_id: str
    consultation_id: str | None = None
    source: PharmacyIssueSource = PharmacyIssueSource.OP_DIRECT
    medicine_text: str = Field(min_length=2, max_length=5000)
    items: list[PharmacyIssueItemCreate] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=2000)
    external_prescriber: str | None = Field(default=None, max_length=220)
    amount: int = Field(default=0, ge=0)
    issued_by_user_id: str | None = None


class PharmacyIssueFromConsultation(BaseModel):
    amount: int = Field(default=0, ge=0)
    issued_by_user_id: str | None = None


class PharmacyIssueStatusUpdate(BaseModel):
    status: PharmacyIssueStatus
    items: list[PharmacyIssueItemCreate] | None = None
    notes: str | None = Field(default=None, max_length=2000)
    reason: str | None = Field(default=None, max_length=500)
    actor_user_id: str | None = None


class PharmacyIssueRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    patient_id: str
    consultation_id: str | None
    source: PharmacyIssueSource
    status: PharmacyIssueStatus
    medicine_text: str
    notes: str | None
    external_prescriber: str | None
    amount: int
    billing_invoice_id: str | None
    issued_by_user_id: str | None
    dispensed_by_user_id: str | None
    dispensed_at: datetime | None
    cancelled_reason: str | None
    created_at: datetime
    updated_at: datetime


class PharmacyIssueDetailRead(BaseModel):
    issue: PharmacyIssueRead
    items: list[PharmacyIssueItemRead] = []


class StockLedgerRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    medicine_id: str
    batch_id: str | None
    movement_type: StockLedgerMovement
    quantity_delta: int
    balance_after: int
    reference_type: str | None
    reference_id: str | None
    actor_user_id: str | None
    created_at: datetime


class LowStockRead(BaseModel):
    medicine_id: str
    medicine_name: str
    branch_id: str | None
    quantity_on_hand: int
    reorder_level: int


class PharmacyReturnItemCreate(BaseModel):
    medicine_id: str
    batch_id: str
    quantity: int = Field(gt=0)
    amount: int = Field(default=0, ge=0)


class PharmacyReturnCreate(BaseModel):
    branch_id: str
    supplier_id: str | None = None
    purchase_id: str | None = None
    reason: str = Field(min_length=2, max_length=500)
    items: list[PharmacyReturnItemCreate] = Field(min_length=1)
    returned_by_user_id: str | None = None


class PharmacyReturnRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    supplier_id: str | None
    purchase_id: str | None
    return_date: datetime
    reason: str
    total_amount: int
    returned_by_user_id: str | None
    created_at: datetime


class PharmacyBillingLink(BaseModel):
    billing_invoice_id: str = Field(min_length=2, max_length=120)
    actor_user_id: str | None = None
