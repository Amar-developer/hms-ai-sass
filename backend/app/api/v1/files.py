from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlmodel import Session, select

from app.core.access_control import require_user_branch_access, scoped_branch_id
from app.core.auth import require_any_permission
from app.core.database import get_session
from app.core.model_update import apply_update_fields
from app.core.tenant_context import require_tenant_id
from app.core.uploads import UPLOADS_DIR, save_upload
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import Invoice
from app.modules.files.models import FileDocument
from app.modules.files.schemas import FileDocumentRead, FileDocumentUpdate
from app.modules.files.service import record_file_document
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.ip.models import IPAdmission
from app.modules.lab.models import LabOrder
from app.modules.patients.models import Patient
from app.modules.physiotherapy.models import PhysiotherapyCase
from app.modules.practitioners.models import Practitioner
from app.modules.settings.models import SettingKey, SettingScope
from app.modules.settings.service import upsert_setting
from app.modules.tenants.models import Tenant, now_utc

router = APIRouter(prefix="/files")

# Maps an upload filename prefix (without the 12-char id suffix) to the entity
# that owns the file. Order matters: longest prefix first to avoid greedy match.
_UPLOAD_PREFIX_RULES: list[dict] = [
    {
        "prefix": "ip_admission_",
        "model": IPAdmission,
        "category": "admission",
        "source_module": "ip",
        "doctype": "IPAdmission",
        "field": "admission_document_url",
        "label": "Admission Document",
        "folder": "Admissions",
        "patient_attr": "patient_id",
        "branch_attr": "branch_id",
    },
    {
        "prefix": "physio_consent_",
        "model": PhysiotherapyCase,
        "category": "consent",
        "source_module": "physiotherapy",
        "doctype": "PhysiotherapyCase",
        "field": "consent_files_json",
        "label": "Consent Form",
        "folder": "Consents",
        "patient_attr": "patient_id",
        "branch_attr": "branch_id",
    },
    {
        "prefix": "lab_report_",
        "model": LabOrder,
        "category": "lab_report",
        "source_module": "lab",
        "doctype": "LabOrder",
        "field": "report_url",
        "label": "Lab Report",
        "folder": "Lab Reports",
        "patient_attr": "patient_id",
        "branch_attr": "branch_id",
    },
    {
        "prefix": "tenant_logo_",
        "model": Tenant,
        "category": "logo",
        "source_module": "tenants",
        "doctype": "Tenant",
        "field": "logo_url",
        "label": "Tenant Logo",
        "folder": "Branding",
        "patient_attr": None,
        "branch_attr": None,
    },
    {
        "prefix": "practitioner_signature_",
        "model": Practitioner,
        "category": "signature",
        "source_module": "practitioners",
        "doctype": "Practitioner",
        "field": "signature_url",
        "label": "Doctor Signature",
        "folder": "Signatures",
        "patient_attr": None,
        "branch_attr": None,
    },
    {
        "prefix": "patient_",
        "model": Patient,
        "category": "patient_photo",
        "source_module": "patients",
        "doctype": "Patient",
        "field": "photo_url",
        "label": "Patient Photo",
        "folder": "Patients",
        "patient_attr": "id",
        "branch_attr": "branch_id",
    },
    {
        "prefix": "file_",
        "model": Tenant,
        "category": "general",
        "source_module": "tenants",
        "doctype": "Tenant",
        "field": "attachment",
        "label": "Attachment",
        "folder": "General",
        "patient_attr": None,
        "branch_attr": None,
    },
    {
        "prefix": "invoice_",
        "model": Invoice,
        "category": "invoice",
        "source_module": "billing",
        "doctype": "Invoice",
        "field": "invoice_pdf",
        "label": "Invoice PDF",
        "folder": "Invoices",
        "patient_attr": "patient_id",
        "branch_attr": "branch_id",
    },
]


def _match_upload_to_entity(session: Session, tenant_id: str, filename: str):
    for rule in _UPLOAD_PREFIX_RULES:
        prefix = rule["prefix"]
        if not filename.startswith(prefix):
            continue
        remainder = filename[len(prefix) :]
        # Filename pattern: {prefix}{id_part}_{uuid_hex}{ext}. The id_part is the
        # first 12 chars of the entity id (or the full tenant id for tenant_logo).
        underscore = remainder.find("_")
        if underscore <= 0:
            continue
        id_part = remainder[:underscore]
        statement = select(rule["model"]).where(rule["model"].id.like(f"{id_part}%"))
        if hasattr(rule["model"], "tenant_id"):
            statement = statement.where(rule["model"].tenant_id == tenant_id)
        entity = session.exec(statement).first()
        if not entity:
            continue
        # Tenant model has no tenant_id column; verify the row matches the caller.
        if isinstance(entity, Tenant) and entity.id != tenant_id:
            continue
        return rule, entity
    return None, None


def _get_file(session: Session, tenant_id: str, file_id: str) -> FileDocument:
    row = session.get(FileDocument, file_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found"
        )
    return row


@router.get("/{file_id}/download", summary="Download a file (authorized)")
def download_file(
    file_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.FILES_MANAGE,
            permissions.FILES_READ,
            permissions.SETTINGS_MANAGE,
            permissions.SETTINGS_READ,
            permissions.PATIENTS_READ,
            permissions.LAB_READ,
            permissions.IP_READ,
            permissions.PHYSIOTHERAPY_READ,
            permissions.INVOICES_READ,
        )
    ),
) -> FileResponse:
    """Serve a stored file only after re-checking tenant + branch + permission —
    the same authorization stack as every JSON route. Content-Type is forced
    from the DB (server-verified at upload), and Content-Disposition is always
    ``attachment`` so nothing is rendered inline in the browser (no stored-XSS).
    """
    row = _get_file(session, tenant_id, file_id)
    require_user_branch_access(current_user, row.branch_id)
    disk_path = UPLOADS_DIR / Path(row.file_url).name
    # Reject any traversal attempt and confirm the resolved path stays inside
    # the uploads directory before touching the filesystem.
    try:
        resolved = disk_path.resolve()
        resolved.relative_to(UPLOADS_DIR.resolve())
    except (ValueError, OSError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found"
        )
    if not resolved.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found"
        )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=row.branch_id,
        actor_user_id=current_user.id,
        action="file.downloaded",
        resource_type="file",
        resource_id=row.id,
        purpose="file_access",
    )
    return FileResponse(
        path=str(resolved),
        media_type=row.content_type or "application/octet-stream",
        filename=row.file_name or resolved.name,
        content_disposition_type="attachment",
    )


def _sync_tenant_logo_attachment(
    session: Session,
    row: FileDocument,
    *,
    actor_user_id: str | None,
    overwrite_existing: bool = True,
) -> None:
    if row.attached_to_doctype != "Tenant":
        return
    if row.attached_to_name and row.attached_to_name != row.tenant_id:
        return
    field = (row.attached_to_field or "").strip().lower()
    if field not in {"logo_url", "invoice.logo_url", "invoice_logo_url"}:
        return
    tenant = session.get(Tenant, row.tenant_id)
    if not tenant:
        return
    if field == "logo_url":
        if overwrite_existing or not tenant.logo_url:
            tenant.logo_url = row.file_url
            tenant.updated_by_user_id = actor_user_id
            tenant.updated_at = now_utc()
            session.add(tenant)
        if not overwrite_existing and tenant.logo_url:
            return
    upsert_setting(
        session,
        tenant_id=row.tenant_id,
        scope=SettingScope.TENANT,
        scope_id=row.tenant_id,
        module="invoice",
        key=SettingKey.INVOICE_LOGO_URL,
        value=row.file_url,
        actor_user_id=actor_user_id,
    )


def _sync_practitioner_signature_attachment(
    session: Session,
    row: FileDocument,
    *,
    actor_user_id: str | None,
) -> None:
    if row.attached_to_doctype != "Practitioner":
        return
    field = (row.attached_to_field or "").strip().lower()
    if field != "signature_url" or not row.attached_to_name:
        return
    practitioner = session.get(Practitioner, row.attached_to_name)
    if not practitioner or practitioner.tenant_id != row.tenant_id:
        return
    practitioner.signature_url = row.file_url
    practitioner.updated_at = now_utc()
    session.add(practitioner)


@router.get(
    "",
    response_model=list[FileDocumentRead],
    summary="List files",
)
def list_files(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    patient_id: str | None = None,
    category: str | None = None,
    attached_to_doctype: str | None = None,
    attached_to_name: str | None = None,
    q: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.FILES_MANAGE,
            permissions.FILES_READ,
            permissions.SETTINGS_MANAGE,
            permissions.SETTINGS_READ,
            permissions.PATIENTS_READ,
            permissions.IP_READ,
            permissions.PHYSIOTHERAPY_READ,
            permissions.LAB_READ,
            permissions.REPORTS_READ,
            permissions.INVOICES_READ,
        )
    ),
) -> list[FileDocument]:
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(FileDocument).where(
        FileDocument.tenant_id == tenant_id,
        FileDocument.is_active == True,  # noqa: E712
    )  # noqa: E712
    if branch_id:
        statement = statement.where(FileDocument.branch_id == branch_id)
    if patient_id:
        statement = statement.where(FileDocument.patient_id == patient_id)
    if category:
        statement = statement.where(FileDocument.category == category)
    if attached_to_doctype:
        statement = statement.where(
            FileDocument.attached_to_doctype == attached_to_doctype
        )
    if attached_to_name:
        statement = statement.where(FileDocument.attached_to_name == attached_to_name)
    if q:
        pattern = f"%{q.strip().lower()}%"
        statement = statement.where(
            or_(
                FileDocument.file_name.ilike(pattern),
                FileDocument.file_url.ilike(pattern),
                FileDocument.category.ilike(pattern),
                FileDocument.source_module.ilike(pattern),
                FileDocument.attached_to_doctype.ilike(pattern),
                FileDocument.attached_to_name.ilike(pattern),
                FileDocument.notes.ilike(pattern),
            )
        )
    rows = list(
        session.exec(
            statement.order_by(FileDocument.created_at.desc()).limit(limit)
        ).all()
    )
    return rows


@router.post(
    "",
    response_model=FileDocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload file",
)
async def upload_file(
    file: UploadFile = File(...),
    branch_id: str | None = Form(default=None),
    patient_id: str | None = Form(default=None),
    category: str = Form(default="general"),
    source_module: str | None = Form(default=None),
    attached_to_doctype: str | None = Form(default=None),
    attached_to_name: str | None = Form(default=None),
    attached_to_field: str | None = Form(default=None),
    attached_to_label: str | None = Form(default=None),
    folder: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    is_private: bool = Form(default=False),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.FILES_MANAGE,
            permissions.FILES_CREATE,
            permissions.SETTINGS_MANAGE,
            permissions.SETTINGS_CREATE,
        )
    ),
) -> FileDocument:
    require_user_branch_access(current_user, branch_id)
    saved_filename, url_path, verified_content_type = await save_upload(
        file, f"file_{tenant_id[:12]}"
    )
    row = record_file_document(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        file_name=file.filename or saved_filename,
        file_url=url_path,
        # Store the server-verified content type, never the client's header.
        content_type=verified_content_type,
        category=(category or "general").strip().lower()[:80],
        source_module=source_module,
        attached_to_doctype=attached_to_doctype,
        attached_to_name=attached_to_name,
        attached_to_field=attached_to_field,
        attached_to_label=attached_to_label,
        folder=folder,
        notes=notes,
        uploaded_by_user_id=current_user.id,
        is_private=is_private,
    )
    _sync_tenant_logo_attachment(session, row, actor_user_id=current_user.id)
    _sync_practitioner_signature_attachment(session, row, actor_user_id=current_user.id)
    session.commit()
    session.refresh(row)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        actor_user_id=current_user.id,
        action="file.uploaded",
        resource_type="file",
        resource_id=row.id,
        purpose="file_management",
    )
    return row


@router.post(
    "/sync-uploads",
    response_model=list[FileDocumentRead],
    summary="Register uploaded files",
)
def sync_uploads_folder(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.FILES_MANAGE,
            permissions.FILES_CREATE,
            permissions.SETTINGS_MANAGE,
            permissions.SETTINGS_CREATE,
        )
    ),
) -> list[FileDocument]:
    folder = Path(UPLOADS_DIR)
    if not folder.exists():
        return []
    created_rows: list[FileDocument] = []
    for path in sorted(folder.iterdir()):
        if not path.is_file() or path.name.startswith("."):
            continue
        file_url = f"/uploads/{path.name}"
        existing = session.exec(
            select(FileDocument).where(
                FileDocument.tenant_id == tenant_id,
                FileDocument.file_url == file_url,
            )
        ).first()
        if existing:
            continue
        rule, entity = _match_upload_to_entity(session, tenant_id, path.name)
        if not rule or not entity:
            continue
        patient_id = (
            getattr(entity, rule["patient_attr"], None)
            if rule.get("patient_attr")
            else None
        )
        branch_id = (
            getattr(entity, rule["branch_attr"], None)
            if rule.get("branch_attr")
            else None
        )
        try:
            file_size = path.stat().st_size
        except OSError:
            file_size = None
        suffix = path.suffix.lower().lstrip(".")
        content_type = None
        if suffix in {"png", "jpg", "jpeg", "gif", "webp"}:
            content_type = f"image/{'jpeg' if suffix == 'jpg' else suffix}"
        elif suffix == "pdf":
            content_type = "application/pdf"
        row = record_file_document(
            session,
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=patient_id,
            file_name=path.name,
            file_url=file_url,
            content_type=content_type,
            file_size=file_size,
            category=rule["category"],
            source_module=rule["source_module"],
            attached_to_doctype=rule["doctype"],
            attached_to_name=entity.id,
            attached_to_field=rule["field"],
            attached_to_label=rule["label"],
            folder=rule["folder"],
            uploaded_by_user_id=current_user.id,
        )
        _sync_tenant_logo_attachment(
            session,
            row,
            actor_user_id=current_user.id,
            overwrite_existing=False,
        )
        _sync_practitioner_signature_attachment(
            session, row, actor_user_id=current_user.id
        )
        created_rows.append(row)
    if created_rows:
        session.commit()
        for row in created_rows:
            session.refresh(row)
        record_audit_event(
            session,
            tenant_id=tenant_id,
            actor_user_id=current_user.id,
            action="file.sync_uploads",
            resource_type="file",
            resource_id=tenant_id,
            purpose="file_management",
            metadata_json=f'{{"registered_count": {len(created_rows)}}}',
        )
    return created_rows


@router.patch(
    "/{file_id}",
    response_model=FileDocumentRead,
    summary="Update file metadata",
)
def update_file(
    file_id: str,
    payload: FileDocumentUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.FILES_MANAGE,
            permissions.FILES_EDIT,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> FileDocument:
    row = _get_file(session, tenant_id, file_id)
    require_user_branch_access(current_user, row.branch_id)
    apply_update_fields(row, payload)
    row.updated_at = now_utc()
    session.add(row)
    _sync_tenant_logo_attachment(session, row, actor_user_id=current_user.id)
    session.commit()
    session.refresh(row)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=row.branch_id,
        actor_user_id=current_user.id,
        action="file.updated",
        resource_type="file",
        resource_id=row.id,
        purpose="file_management",
    )
    return row


@router.delete(
    "/{file_id}",
    response_model=FileDocumentRead,
    summary="Deactivate file",
)
def delete_file(
    file_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.FILES_MANAGE,
            permissions.FILES_DELETE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> FileDocument:
    row = _get_file(session, tenant_id, file_id)
    require_user_branch_access(current_user, row.branch_id)
    row.is_active = False
    row.updated_at = now_utc()
    session.add(row)
    session.commit()
    session.refresh(row)
    # Remove the physical file too, but only when no other active record still
    # points at it, so deleting one duplicate row never breaks another that
    # references the same upload.
    if row.file_url and row.file_url.startswith("/uploads/"):
        still_referenced = session.exec(
            select(FileDocument).where(
                FileDocument.tenant_id == tenant_id,
                FileDocument.file_url == row.file_url,
                FileDocument.is_active == True,  # noqa: E712
            )
        ).first()
        if not still_referenced:
            disk_path = UPLOADS_DIR / Path(row.file_url).name
            try:
                disk_path.unlink(missing_ok=True)
            except OSError:
                pass
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=row.branch_id,
        actor_user_id=current_user.id,
        action="file.deleted",
        resource_type="file",
        resource_id=row.id,
        purpose="file_management",
    )
    return row
