from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.lab.models import LabOrderPriority, LabOrderSource, LabOrderStatus


class LabTestCatalogCreate(BaseModel):
    branch_id: str | None = None
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=220)
    department: str | None = Field(default=None, max_length=120)
    sample_type: str | None = Field(default=None, max_length=120)
    default_price: int = Field(default=0, ge=0)
    supplier_id: str | None = None
    purchase_price: int = Field(default=0, ge=0)
    turnaround_minutes: int | None = Field(default=None, ge=0)
    instructions: str | None = Field(default=None, max_length=1000)
    created_by_user_id: str | None = None


class LabTestCatalogUpdate(BaseModel):
    branch_id: str | None = None
    code: str | None = Field(default=None, min_length=2, max_length=40)
    name: str | None = Field(default=None, min_length=2, max_length=220)
    department: str | None = Field(default=None, max_length=120)
    sample_type: str | None = Field(default=None, max_length=120)
    default_price: int | None = Field(default=None, ge=0)
    supplier_id: str | None = None
    purchase_price: int | None = Field(default=None, ge=0)
    turnaround_minutes: int | None = Field(default=None, ge=0)
    instructions: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None
    updated_by_user_id: str | None = None


class LabTestCatalogRead(LabTestCatalogCreate):
    id: str
    tenant_id: str
    is_active: bool
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class LabTestPackageCreate(BaseModel):
    branch_id: str | None = None
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=220)
    description: str | None = Field(default=None, max_length=1000)
    package_price: int = Field(default=0, ge=0)
    supplier_id: str | None = None
    purchase_price: int = Field(default=0, ge=0)
    test_ids: list[str] = Field(default_factory=list)
    created_by_user_id: str | None = None


class LabTestPackageUpdate(BaseModel):
    branch_id: str | None = None
    code: str | None = Field(default=None, min_length=2, max_length=40)
    name: str | None = Field(default=None, min_length=2, max_length=220)
    description: str | None = Field(default=None, max_length=1000)
    package_price: int | None = Field(default=None, ge=0)
    supplier_id: str | None = None
    purchase_price: int | None = Field(default=None, ge=0)
    test_ids: list[str] | None = None
    is_active: bool | None = None
    updated_by_user_id: str | None = None


class LabTestPackageRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str | None
    code: str
    name: str
    description: str | None
    package_price: int
    supplier_id: str | None = None
    purchase_price: int = 0
    test_ids: list[str] = []
    is_active: bool
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class LabResultTemplateCreate(BaseModel):
    test_id: str | None = None
    name: str = Field(min_length=2, max_length=220)
    content: dict = Field(default_factory=dict)
    created_by_user_id: str | None = None


class LabResultTemplateRead(BaseModel):
    id: str
    tenant_id: str
    test_id: str | None
    name: str
    content: dict
    is_active: bool
    created_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class LabOrderCreate(BaseModel):
    branch_id: str
    patient_id: str
    consultation_id: str | None = None
    source: LabOrderSource = LabOrderSource.OP_DIRECT
    priority: LabOrderPriority = LabOrderPriority.ROUTINE
    tests: str = Field(min_length=2, max_length=2000)
    test_ids: list[str] = Field(default_factory=list)
    package_ids: list[str] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=2000)
    external_referrer: str | None = Field(default=None, max_length=220)
    amount: int = Field(default=0, ge=0)
    ordered_by_user_id: str | None = None


class LabOrderFromConsultation(BaseModel):
    amount: int = Field(default=0, ge=0)
    priority: LabOrderPriority = LabOrderPriority.ROUTINE
    ordered_by_user_id: str | None = None


class LabOrderStatusUpdate(BaseModel):
    status: LabOrderStatus
    notes: str | None = Field(default=None, max_length=2000)
    reason: str | None = Field(default=None, max_length=500)
    actor_user_id: str | None = None


class LabResultCreate(BaseModel):
    template_id: str | None = None
    result_summary: str = Field(min_length=2, max_length=5000)
    abnormal_flag: bool = False
    report_url: str | None = Field(default=None, max_length=500)
    report_file_name: str | None = Field(default=None, max_length=220)
    released_by_user_id: str | None = None


class LabSampleCreate(BaseModel):
    barcode: str | None = Field(default=None, max_length=120)
    sample_type: str | None = Field(default=None, max_length=120)
    collected_by_user_id: str | None = None
    notes: str | None = Field(default=None, max_length=1000)


class LabSampleRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    lab_order_id: str
    barcode: str
    sample_type: str | None
    collected_by_user_id: str | None
    collected_at: datetime
    notes: str | None


class LabOrderItemRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    lab_order_id: str
    test_id: str | None
    package_id: str | None
    test_name: str
    sample_type: str | None
    price: int
    status: LabOrderStatus
    created_at: datetime
    updated_at: datetime


class LabResultRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    lab_order_id: str
    template_id: str | None
    result_summary: str
    abnormal_flag: bool
    report_url: str | None
    report_file_name: str | None
    released_by_user_id: str | None
    released_at: datetime


class LabOrderRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    patient_id: str
    consultation_id: str | None
    lab_order_number: str | None = None
    source: LabOrderSource
    status: LabOrderStatus
    priority: LabOrderPriority
    tests: str
    notes: str | None
    external_referrer: str | None
    amount: int
    ordered_by_user_id: str | None
    sample_collected_at: datetime | None
    result_ready_at: datetime | None
    cancelled_reason: str | None
    created_at: datetime
    updated_at: datetime


class LabOrderDetailRead(BaseModel):
    order: LabOrderRead
    items: list[LabOrderItemRead] = []
    samples: list[LabSampleRead] = []
    results: list[LabResultRead] = []
