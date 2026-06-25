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
