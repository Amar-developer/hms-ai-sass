from datetime import datetime

from sqlalchemy import Index, UniqueConstraint, text
from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class FileDocument(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "original_file_id",
            "artifact_type",
            "document_version",
            name="uq_file_rendition_version",
        ),
        Index(
            "ix_file_attachment_artifact",
            "tenant_id",
            "attached_to_doctype",
            "attached_to_name",
            "artifact_type",
        ),
        Index(
            "uq_active_final_invoice_artifact",
            "tenant_id",
            "attached_to_doctype",
            "attached_to_name",
            "attached_to_field",
            unique=True,
            postgresql_where=text(
                "is_active = true AND artifact_type = 'final' "
                "AND attached_to_doctype = 'Invoice'"
            ),
            sqlite_where=text(
                "is_active = 1 AND artifact_type = 'final' "
                "AND attached_to_doctype = 'Invoice'"
            ),
        ),
    )

    id: str = Field(default_factory=lambda: new_id("file"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    patient_id: str | None = Field(default=None, index=True, foreign_key="patient.id")
    file_name: str = Field(index=True, min_length=1, max_length=260)
    file_url: str = Field(index=True, min_length=1, max_length=500)
    content_type: str | None = Field(default=None, index=True, max_length=160)
    file_size: int | None = Field(default=None, ge=0)
    storage_backend: str = Field(default="local", index=True, max_length=40)
    storage_key: str | None = Field(default=None, index=True, max_length=500)
    storage_bucket: str | None = Field(default=None, index=True, max_length=160)
    storage_region: str | None = Field(default=None, max_length=80)
    storage_version_id: str | None = Field(default=None, max_length=260)
    checksum_sha256: str | None = Field(default=None, index=True, max_length=64)
    original_size_bytes: int | None = Field(default=None, ge=0)
    stored_size_bytes: int | None = Field(default=None, ge=0)
    storage_class: str | None = Field(default=None, index=True, max_length=40)
    document_status: str = Field(default="ready", index=True, max_length=40)
    document_version: int = Field(default=1, ge=1, index=True)
    artifact_type: str = Field(default="original", index=True, max_length=40)
    original_file_id: str | None = Field(
        default=None, index=True, foreign_key="filedocument.id"
    )
    finalized_at: datetime | None = Field(default=None, index=True)
    optimization_profile: str | None = Field(default=None, index=True, max_length=80)
    optimization_status: str = Field(default="not_required", index=True, max_length=40)
    retention_class: str = Field(default="permanent", index=True, max_length=40)
    retention_until: datetime | None = Field(default=None, index=True)
    legal_hold: bool = Field(default=False, index=True)
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
