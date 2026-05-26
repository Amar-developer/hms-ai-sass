from datetime import datetime

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class FileDocument(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("file"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    patient_id: str | None = Field(default=None, index=True, foreign_key="patient.id")
    file_name: str = Field(index=True, min_length=1, max_length=260)
    file_url: str = Field(index=True, min_length=1, max_length=500)
    content_type: str | None = Field(default=None, index=True, max_length=160)
    file_size: int | None = Field(default=None, ge=0)
    storage_backend: str = Field(default="local", index=True, max_length=40)
    is_private: bool = Field(default=False, index=True)
    category: str = Field(default="general", index=True, max_length=80)
    source_module: str | None = Field(default=None, index=True, max_length=80)
    attached_to_doctype: str | None = Field(default=None, index=True, max_length=120)
    attached_to_name: str | None = Field(default=None, index=True, max_length=160)
    attached_to_field: str | None = Field(default=None, index=True, max_length=120)
    attached_to_label: str | None = Field(default=None, max_length=180)
    folder: str | None = Field(default=None, index=True, max_length=180)
    notes: str | None = Field(default=None, max_length=1000)
    uploaded_by_user_id: str | None = Field(default=None, index=True)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
