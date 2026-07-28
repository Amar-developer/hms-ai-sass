from pathlib import Path
from json import dumps

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.core.uploads import PRIVATE_UPLOADS_DIR, save_private_upload
from app.modules.audit.service import record_audit_event
from app.modules.files.models import FileDocument
from app.modules.files.repositories import FileDocumentRepository
from app.modules.files.service import record_file_document
from app.modules.files.services.file_service import FileService
from app.modules.identity.models import User
from app.modules.lab.models import LabOrderStatus
from app.modules.lab.services.validation import get_order_or_404
from app.modules.subscriptions.service import enforce_module_enabled

LAB_REPORT_CATEGORY = "lab_report"
LAB_ORDER_DOCTYPE = "LabOrder"
MAX_LAB_FILES_PER_REQUEST = 10


def _validate_lab_file_owner(
    *,
    file_document: FileDocument,
    order_id: str,
) -> None:
    if (
        not file_document.is_active
        or file_document.category != LAB_REPORT_CATEGORY
        or file_document.source_module != "lab"
        or file_document.attached_to_doctype != LAB_ORDER_DOCTYPE
        or file_document.attached_to_name != order_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lab file not found"
        )


def _resolve_private_lab_file(row: FileDocument) -> Path:
    file_url = row.file_url or ""
    if not file_url.startswith("private://"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lab file not found"
        )
    filename = file_url.removeprefix("private://")
    if not filename or "/" in filename or "\\" in filename:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lab file not found"
        )
    disk_path = PRIVATE_UPLOADS_DIR / filename
    try:
        resolved = disk_path.resolve()
        resolved.relative_to(PRIVATE_UPLOADS_DIR.resolve())
    except (ValueError, OSError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lab file not found"
        )
    if not resolved.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lab file not found"
        )
    return resolved


def _remove_saved_files(saved_paths: list[Path]) -> None:
    for saved_path in saved_paths:
        saved_path.unlink(missing_ok=True)


def list_lab_order_files(
    session: Session,
    *,
    tenant_id: str,
    order_id: str,
    current_user: User,
) -> list[FileDocument]:
    enforce_module_enabled(session, tenant_id, "lab", current_user=current_user)
    order = get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    return FileService(session).list_files(
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        patient_id=order.patient_id,
        category=LAB_REPORT_CATEGORY,
        attached_to_doctype=LAB_ORDER_DOCTYPE,
        attached_to_name=order.id,
        q=None,
        limit=100,
        actor=current_user,
    )


async def upload_lab_order_files(
    session: Session,
    *,
    tenant_id: str,
    order_id: str,
    files: list[UploadFile],
    current_user: User,
) -> list[FileDocument]:
    enforce_module_enabled(session, tenant_id, "lab", current_user=current_user)
    order = get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    if order.status == LabOrderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot upload reports for a cancelled lab order",
        )
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload at least one lab report file",
        )
    if len(files) > MAX_LAB_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Upload at most {MAX_LAB_FILES_PER_REQUEST} files at a time",
        )

    saved_paths: list[Path] = []
    rows: list[FileDocument] = []
    try:
        for file in files:
            saved_filename, url_path, verified_content_type = await save_private_upload(
                file, f"lab_report_{order.id[:12]}"
            )
            saved_path = PRIVATE_UPLOADS_DIR / saved_filename
            saved_paths.append(saved_path)
            file_size = saved_path.stat().st_size if saved_path.exists() else None
            row = record_file_document(
                session,
                tenant_id=tenant_id,
                branch_id=order.branch_id,
                patient_id=order.patient_id,
                file_name=file.filename or saved_filename,
                file_url=url_path,
                content_type=verified_content_type,
                file_size=file_size,
                category=LAB_REPORT_CATEGORY,
                source_module="lab",
                attached_to_doctype=LAB_ORDER_DOCTYPE,
                attached_to_name=order.id,
                attached_to_field=None,
                attached_to_label="Lab Report",
                folder="Lab Reports",
                uploaded_by_user_id=current_user.id,
                is_private=True,
            )
            rows.append(row)
        session.commit()
        for row in rows:
            session.refresh(row)
            record_audit_event(
                session,
                tenant_id=tenant_id,
                branch_id=order.branch_id,
                actor_user_id=current_user.id,
                action="lab_order.file_uploaded",
                resource_type="lab_order",
                resource_id=order.id,
                purpose="lab_report_management",
                metadata_json=dumps({"file_id": row.id}),
            )
        return rows
    except HTTPException:
        session.rollback()
        _remove_saved_files(saved_paths)
        raise
    except OSError:
        session.rollback()
        _remove_saved_files(saved_paths)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not store lab report file",
        )
    except SQLAlchemyError:
        session.rollback()
        _remove_saved_files(saved_paths)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save lab report metadata",
        )


def prepare_lab_order_file_download(
    session: Session,
    *,
    tenant_id: str,
    order_id: str,
    file_id: str,
    current_user: User,
) -> tuple[FileDocument, Path]:
    enforce_module_enabled(session, tenant_id, "lab", current_user=current_user)
    order = get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    file_document = FileDocumentRepository(session).get_for_tenant(tenant_id, file_id)
    if not file_document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lab file not found"
        )
    _validate_lab_file_owner(file_document=file_document, order_id=order.id)
    resolved = _resolve_private_lab_file(file_document)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        actor_user_id=current_user.id,
        action="lab_order.file_downloaded",
        resource_type="lab_order",
        resource_id=order.id,
        purpose="lab_report_access",
        metadata_json=dumps({"file_id": file_document.id}),
    )
    return file_document, resolved
