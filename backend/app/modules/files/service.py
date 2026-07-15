from sqlmodel import Session

from app.modules.files.models import FileDocument
from app.modules.files.repositories import FileDocumentRepository
from app.modules.tenants.models import now_utc


def record_file_document(
    session: Session,
    *,
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
) -> FileDocument:
    existing = FileDocumentRepository(session).find_attachment(
        tenant_id=tenant_id,
        file_url=file_url,
        attached_to_doctype=attached_to_doctype,
        attached_to_name=attached_to_name,
        attached_to_field=attached_to_field,
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
        existing.is_active = True
        existing.updated_at = now_utc()
        session.add(existing)
        return existing
    row = FileDocument(
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
    )
    session.add(row)
    return row
