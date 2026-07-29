from datetime import datetime

from pydantic import BaseModel, Field


class FileDocumentRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str | None = None
    patient_id: str | None = None
    file_name: str
    file_url: str
    content_type: str | None = None
    file_size: int | None = None
    storage_backend: str = "local"
    storage_key: str | None = None
    storage_bucket: str | None = None
    storage_region: str | None = None
    storage_version_id: str | None = None
    checksum_sha256: str | None = None
    original_size_bytes: int | None = None
    stored_size_bytes: int | None = None
    storage_class: str | None = None
    document_status: str = "ready"
    document_version: int = 1
    artifact_type: str = "original"
    original_file_id: str | None = None
    finalized_at: datetime | None = None
    optimization_profile: str | None = None
    optimization_status: str = "not_required"
    retention_class: str = "permanent"
    retention_until: datetime | None = None
    legal_hold: bool = False
    is_private: bool = False
    category: str = "general"
    source_module: str | None = None
    attached_to_doctype: str | None = None
    attached_to_name: str | None = None
    attached_to_field: str | None = None
    attached_to_label: str | None = None
    folder: str | None = None
    notes: str | None = None
    uploaded_by_user_id: str | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class FileDocumentUpdate(BaseModel):
    category: str | None = Field(default=None, max_length=80)
    folder: str | None = Field(default=None, max_length=180)
    notes: str | None = Field(default=None, max_length=1000)
    attached_to_doctype: str | None = Field(default=None, max_length=120)
    attached_to_name: str | None = Field(default=None, max_length=160)
    attached_to_field: str | None = Field(default=None, max_length=120)
    attached_to_label: str | None = Field(default=None, max_length=180)
    patient_id: str | None = None
    branch_id: str | None = None
    is_private: bool | None = None
    is_active: bool | None = None
    legal_hold: bool | None = None


class FileOptimizationRead(BaseModel):
    original_file_id: str
    delivery_file_id: str
    status: str
    profile: str | None = None
    original_size_bytes: int
    stored_size_bytes: int
    saved_bytes: int
    reduction_percent: float


class StorageMetricGroupRead(BaseModel):
    documents: int
    stored_bytes: int


class StorageMetricsRead(BaseModel):
    total_documents: int
    active_documents: int
    total_stored_bytes: int
    active_stored_bytes: int
    original_bytes: int
    optimization_saved_bytes: int
    invoice_deliveries: int
    pinned_invoice_deliveries: int
    legacy_unpinned_invoice_deliveries: int
    duplicate_active_invoice_artifacts: int
    by_category: dict[str, StorageMetricGroupRead]
    by_artifact_type: dict[str, StorageMetricGroupRead]
    by_storage_backend: dict[str, StorageMetricGroupRead]
