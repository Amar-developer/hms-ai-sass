from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session

from app.core.auth import get_current_user, require_any_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.error_logs.repositories import ErrorLogRepository
from app.modules.error_logs.schemas import (
    ClientErrorLogCreate,
    ErrorLogAccepted,
    ErrorLogPage,
    ErrorLogRead,
    ErrorLogResolve,
)
from app.modules.error_logs.service import record_error_log, resolve_error_log
from app.modules.identity import permissions
from app.modules.identity.models import User


router = APIRouter(prefix="/error-logs")
legacy_router = APIRouter(prefix="/client-logs")

# Backward compatibility for code importing the previous schema.
ClientLogCreate = ClientErrorLogCreate


def _client_category(payload: ClientErrorLogCreate) -> str:
    if payload.category:
        return payload.category
    if payload.status_code in (401, 403):
        return "permission"
    if payload.status_code == 422:
        return "validation"
    if payload.status_code and payload.status_code >= 500:
        return "api"
    return "frontend"


def _record_client_log(
    payload: ClientErrorLogCreate,
    tenant_id: str,
    current_user: User,
    session: Session,
) -> ErrorLogAccepted:
    if not current_user.is_super_admin and current_user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied"
        )
    row = record_error_log(
        session,
        tenant_id=tenant_id,
        branch_id=current_user.branch_id,
        user_id=current_user.id,
        source="frontend",
        level=payload.level,
        category=_client_category(payload),
        event=payload.event,
        message=payload.message,
        module=payload.module,
        route=payload.route,
        method=payload.method,
        status_code=payload.status_code,
        request_id=payload.request_id,
        stack_trace=payload.stack,
        metadata_json=payload.metadata_json,
    )
    return ErrorLogAccepted(accepted=True, id=row.id if row else None)


@router.post(
    "/client",
    response_model=ErrorLogAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Record frontend error or warning",
)
def create_client_error_log(
    payload: ClientErrorLogCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ErrorLogAccepted:
    return _record_client_log(payload, tenant_id, current_user, session)


@legacy_router.post(
    "",
    response_model=ErrorLogAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Record frontend log (legacy path)",
    deprecated=True,
)
def create_legacy_client_log(
    payload: ClientErrorLogCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ErrorLogAccepted:
    return _record_client_log(payload, tenant_id, current_user, session)


@router.get(
    "",
    response_model=ErrorLogPage,
    summary="List error logs",
    dependencies=[
        Depends(
            require_any_permission(
                permissions.ERROR_LOGS_READ, permissions.ERROR_LOGS_MANAGE
            )
        )
    ],
)
def list_error_logs(
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    level: str | None = Query(default=None),
    source: str | None = Query(default=None),
    category: str | None = Query(default=None),
    resolved: bool | None = Query(default=None),
    status_code: int | None = Query(default=None, ge=100, le=599),
    q: str | None = Query(default=None, max_length=200),
    include_global: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> ErrorLogPage:
    repository = ErrorLogRepository(session)
    resolved_include_global = bool(include_global and current_user.is_super_admin)
    rows, total = repository.list(
        tenant_id=tenant_id,
        include_global=resolved_include_global,
        level=level,
        source=source,
        category=category,
        resolved=resolved,
        status_code=status_code,
        query=q,
        limit=limit,
        offset=offset,
    )
    summary = repository.summary(
        tenant_id=tenant_id,
        include_global=resolved_include_global,
        level=level,
        source=source,
        category=category,
        resolved=resolved,
        status_code=status_code,
        query=q,
    )
    return ErrorLogPage(
        items=rows, total=total, limit=limit, offset=offset, summary=summary
    )


def _tenant_error_log_or_404(
    session: Session,
    tenant_id: str,
    error_log_id: str,
    current_user: User,
):
    row = ErrorLogRepository(session).get(error_log_id)
    allowed_global = current_user.is_super_admin and row and row.tenant_id is None
    if not row or (row.tenant_id != tenant_id and not allowed_global):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Error log not found"
        )
    return row


@router.get(
    "/{error_log_id}",
    response_model=ErrorLogRead,
    summary="Get error log",
    dependencies=[
        Depends(
            require_any_permission(
                permissions.ERROR_LOGS_READ, permissions.ERROR_LOGS_MANAGE
            )
        )
    ],
)
def get_error_log(
    error_log_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return _tenant_error_log_or_404(session, tenant_id, error_log_id, current_user)


@router.patch(
    "/{error_log_id}",
    response_model=ErrorLogRead,
    summary="Resolve or reopen error log",
    dependencies=[Depends(require_any_permission(permissions.ERROR_LOGS_MANAGE))],
)
def update_error_log(
    error_log_id: str,
    payload: ErrorLogResolve,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    row = _tenant_error_log_or_404(session, tenant_id, error_log_id, current_user)
    return resolve_error_log(
        session,
        row,
        resolved=payload.resolved,
        resolution_note=payload.resolution_note,
        actor_user_id=current_user.id,
    )


@router.delete(
    "/{error_log_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete error log",
    dependencies=[Depends(require_any_permission(permissions.ERROR_LOGS_MANAGE))],
)
def delete_error_log(
    error_log_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    row = _tenant_error_log_or_404(session, tenant_id, error_log_id, current_user)
    ErrorLogRepository(session).delete(row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
