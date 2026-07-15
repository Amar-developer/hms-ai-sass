from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.core.auth import require_any_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.files.models import FileDocument
from app.modules.files.schemas import FileDocumentRead, FileDocumentUpdate
from app.modules.files.services.file_service import FileService
from app.modules.identity import permissions
from app.modules.identity.models import User

router = APIRouter(prefix="/files")


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
    row, resolved = FileService(session).prepare_download(
        tenant_id=tenant_id, file_id=file_id, actor=current_user
    )
    return FileResponse(
        path=str(resolved),
        media_type=row.content_type or "application/octet-stream",
        filename=row.file_name or resolved.name,
        content_disposition_type="attachment",
    )


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
    return FileService(session).list_files(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        category=category,
        attached_to_doctype=attached_to_doctype,
        attached_to_name=attached_to_name,
        q=q,
        limit=limit,
        actor=current_user,
    )


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
            permissions.LAB_MANAGE,
            permissions.LAB_EDIT,
            permissions.LAB_RESULTS_MANAGE,
        )
    ),
) -> FileDocument:
    return await FileService(session).upload_file(
        tenant_id=tenant_id,
        file=file,
        branch_id=branch_id,
        patient_id=patient_id,
        category=category,
        source_module=source_module,
        attached_to_doctype=attached_to_doctype,
        attached_to_name=attached_to_name,
        attached_to_field=attached_to_field,
        attached_to_label=attached_to_label,
        folder=folder,
        notes=notes,
        is_private=is_private,
        actor=current_user,
    )


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
    return FileService(session).sync_uploads_folder(
        tenant_id=tenant_id, actor=current_user
    )


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
    return FileService(session).update_file(
        tenant_id=tenant_id, file_id=file_id, payload=payload, actor=current_user
    )


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
    return FileService(session).delete_file(
        tenant_id=tenant_id, file_id=file_id, actor=current_user
    )
