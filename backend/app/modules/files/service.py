from datetime import datetime

from sqlmodel import Session

from app.modules.files.models import FileDocument
from app.modules.files.repositories import FileDocumentRepository
from app.modules.tenants.models import now_utc


def record_file_document(
    session: Session,
    *,
    document_id: str | None = None,
    tenant_id: str,
    file_name: str,
    file_url: str,
    branch_id: str | None = None,
    patient_id: str | None = None,
    content_type: str | None = None,
    file_size: int | None = None,
    category: str = "general",
    source_module: str | None = None,
    attached_to_doctype: str | None = None,
    attached_to_name: str | None = None,
    attached_to_field: str | None = None,
    attached_to_label: str | None = None,
    folder: str | None = None,
    notes: str | None = None,
    uploaded_by_user_id: str | None = None,
    is_private: bool = False,
    storage_backend: str | None = None,
    storage_key: str | None = None,
    storage_bucket: str | None = None,
    storage_region: str | None = None,
    storage_version_id: str | None = None,
    checksum_sha256: str | None = None,
    original_size_bytes: int | None = None,
    stored_size_bytes: int | None = None,
    storage_class: str | None = None,
    document_status: str = "ready",
    document_version: int = 1,
    artifact_type: str = "original",
    original_file_id: str | None = None,
    finalized_at: datetime | None = None,
    optimization_profile: str | None = None,
    optimization_status: str = "not_required",
    force_create: bool = False,
) -> FileDocument:
    existing = None
    if not force_create:
        existing = FileDocumentRepository(session).find_attachment(
            tenant_id=tenant_id,
            file_url=file_url,
            attached_to_doctype=attached_to_doctype,
            attached_to_name=attached_to_name,
            attached_to_field=attached_to_field,
            original_file_id=original_file_id,
            artifact_type=artifact_type,
        )
    if existing:
        existing.file_name = file_name or existing.file_name
        existing.file_url = file_url or existing.file_url
        existing.branch_id = branch_id or existing.branch_id
        existing.patient_id = patient_id or existing.patient_id
        existing.content_type = content_type or existing.content_type
        existing.file_size = file_size if file_size is not None else existing.file_size
        existing.category = category or existing.category
        existing.source_module = source_module or existing.source_module
        existing.attached_to_label = attached_to_label or existing.attached_to_label
        existing.folder = folder or existing.folder
        existing.notes = notes if notes is not None else existing.notes
        existing.uploaded_by_user_id = (
            uploaded_by_user_id or existing.uploaded_by_user_id
        )
        existing.is_private = is_private
        # Storage location fields describe where the ALREADY-uploaded bytes
        # live (e.g. an S3 key). A caller updating other metadata (like
        # lab result release, which only knows the file's public URL) has
        # no way to supply these, so — unlike the plain string fields above
        # — omitting them must preserve what's already on the row instead
        # of blanking it back to "local"/None and breaking signed-URL
        # generation for the real stored object.
        if storage_backend is not None:
            existing.storage_backend = storage_backend
        if storage_key is not None:
            existing.storage_key = storage_key
        if storage_bucket is not None:
            existing.storage_bucket = storage_bucket
        if storage_region is not None:
            existing.storage_region = storage_region
        if storage_version_id is not None:
            existing.storage_version_id = storage_version_id
        if checksum_sha256 is not None:
            existing.checksum_sha256 = checksum_sha256
        if original_size_bytes is not None:
            existing.original_size_bytes = original_size_bytes
        if stored_size_bytes is not None:
            existing.stored_size_bytes = stored_size_bytes
        if storage_class is not None:
            existing.storage_class = storage_class
        existing.document_status = document_status
        existing.document_version = document_version
        existing.artifact_type = artifact_type
        existing.original_file_id = original_file_id
        existing.finalized_at = finalized_at
        existing.optimization_profile = optimization_profile
        existing.optimization_status = optimization_status
        existing.is_active = True
        existing.updated_at = now_utc()
        session.add(existing)
        return existing
    row_values = dict(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        file_name=file_name,
        file_url=file_url,
        content_type=content_type,
        file_size=file_size,
        category=category or "general",
        source_module=source_module,
        attached_to_doctype=attached_to_doctype,
        attached_to_name=attached_to_name,
        attached_to_field=attached_to_field,
        attached_to_label=attached_to_label,
        folder=folder,
        notes=notes,
        uploaded_by_user_id=uploaded_by_user_id,
        is_private=is_private,
        storage_backend=storage_backend or "local",
        storage_key=storage_key,
        storage_bucket=storage_bucket,
        storage_region=storage_region,
        storage_version_id=storage_version_id,
        checksum_sha256=checksum_sha256,
        original_size_bytes=original_size_bytes,
        stored_size_bytes=stored_size_bytes,
        storage_class=storage_class,
        document_status=document_status,
        document_version=document_version,
        artifact_type=artifact_type,
        original_file_id=original_file_id,
        finalized_at=finalized_at,
        optimization_profile=optimization_profile,
        optimization_status=optimization_status,
    )
    if document_id:
        row_values["id"] = document_id
    row = FileDocument(**row_values)
    session.add(row)
    return row
