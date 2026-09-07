from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlmodel import Session

from app.core.access_control import scoped_branch_id
from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.reports import service as reports_service
from app.modules.reports.schemas import (
    DashboardMetricsRead,
    MonthlyReportConfigRead,
    MonthlyReportConfigUpdate,
    MonthlyReportSendRequest,
    MonthlySnapshotArchiveRequest,
    MonthlySnapshotRead,
    ProfitReportEmailRead,
    ProfitReportEmailRequest,
    ReportJobRead,
    ReportResendRequest,
)

router = APIRouter(prefix="/reports")


@router.get("/dashboard-metrics", response_model=DashboardMetricsRead)
def get_dashboard_metrics(
    from_date: date = Query(),
    to_date: date = Query(),
    series_from: date = Query(),
    series_to: date = Query(),
    branch_id: str | None = Query(default=None),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> DashboardMetricsRead:
    """Canonical live Metrics Dashboard totals, comparisons, and chart data."""

    return DashboardMetricsRead.model_validate(
        reports_service.build_live_dashboard_metrics(
            session,
            tenant_id=tenant_id,
            branch_id=scoped_branch_id(current_user, branch_id),
            start=from_date,
            end=to_date,
            series_start=series_from,
            series_end=series_to,
        )
    )


@router.get(
    "/monthly-email/config",
    response_model=MonthlyReportConfigRead,
    dependencies=[
        Depends(
            require_any_permission(
                permissions.SETTINGS_MANAGE, permissions.SETTINGS_READ
            )
        )
    ],
)
def get_monthly_report_config(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(permissions.SETTINGS_MANAGE, permissions.SETTINGS_READ)
    ),
) -> MonthlyReportConfigRead:
    return reports_service.read_config(
        reports_service.load_monthly_report_config(session, tenant_id)
    )


@router.put(
    "/monthly-email/config",
    response_model=MonthlyReportConfigRead,
    dependencies=[
        Depends(
            require_any_permission(
                permissions.SETTINGS_MANAGE, permissions.SETTINGS_EDIT
            )
        )
    ],
)
def update_monthly_report_config(
    payload: MonthlyReportConfigUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.SETTINGS_MANAGE, permissions.SETTINGS_EDIT)
    ),
) -> MonthlyReportConfigRead:
    saved = reports_service.save_monthly_report_config(
        session,
        tenant_id=tenant_id,
        recipients=[str(email) for email in payload.recipients],
        cc=[str(email) for email in payload.cc],
        enabled=payload.enabled,
        send_day=payload.send_day,
        filters=payload.filters.model_dump(),
        actor_user_id=current_user.id,
    )
    return reports_service.read_config(saved)


@router.post(
    "/monthly-email/send",
    response_model=ReportJobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
def send_monthly_report_now(
    payload: MonthlyReportSendRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.REPORTS_READ,
            permissions.SETTINGS_MANAGE,
            permissions.BILLING_MANAGE,
        )
    ),
) -> ReportJobRead:
    return reports_service.queue_monthly_report(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.post("/profit-email/send", response_model=ProfitReportEmailRead)
def send_profit_report_now(
    payload: ProfitReportEmailRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> ProfitReportEmailRead:
    return reports_service.send_profit_report(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/monthly-email/jobs", response_model=list[ReportJobRead])
def list_monthly_report_jobs(
    tenant_id: str = Depends(require_tenant_id),
    limit: int = Query(default=10, ge=1, le=50),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.REPORTS_READ,
            permissions.SETTINGS_MANAGE,
            permissions.BILLING_MANAGE,
        )
    ),
) -> list[ReportJobRead]:
    return reports_service.list_monthly_report_jobs(
        session, tenant_id=tenant_id, limit=limit
    )


@router.get("/monthly-email/jobs/{job_id}/download")
def download_monthly_report_job(
    job_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.REPORTS_READ,
            permissions.SETTINGS_MANAGE,
            permissions.BILLING_MANAGE,
        )
    ),
) -> Response:
    filename, content = reports_service.download_monthly_report_job(
        session, tenant_id=tenant_id, job_id=job_id
    )
    return Response(
        content=content,
        media_type="application/vnd.ms-excel",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/monthly-email/jobs/{job_id}/resend",
    response_model=ReportJobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
def resend_monthly_report_job(
    job_id: str,
    payload: ReportResendRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.REPORTS_READ,
            permissions.SETTINGS_MANAGE,
            permissions.BILLING_MANAGE,
        )
    ),
) -> ReportJobRead:
    return reports_service.resend_monthly_report_job(
        session,
        tenant_id=tenant_id,
        job_id=job_id,
        payload=payload,
        actor=current_user,
    )


@router.get("/monthly-snapshots", response_model=list[MonthlySnapshotRead])
def list_monthly_snapshots(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = Query(default=None),
    limit: int = Query(default=24, ge=1, le=120),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.REPORTS_READ,
            permissions.SETTINGS_MANAGE,
            permissions.BILLING_MANAGE,
        )
    ),
) -> list[MonthlySnapshotRead]:
    return reports_service.list_monthly_snapshots(
        session, tenant_id=tenant_id, branch_id=branch_id, limit=limit
    )


@router.get("/monthly-snapshots/{snapshot_id}", response_model=MonthlySnapshotRead)
def get_monthly_snapshot(
    snapshot_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.REPORTS_READ,
            permissions.SETTINGS_MANAGE,
            permissions.BILLING_MANAGE,
        )
    ),
) -> MonthlySnapshotRead:
    return reports_service.get_monthly_snapshot(
        session, tenant_id=tenant_id, snapshot_id=snapshot_id
    )


@router.post(
    "/monthly-snapshots/archive",
    response_model=list[MonthlySnapshotRead],
    status_code=status.HTTP_201_CREATED,
)
def archive_monthly_snapshot(
    payload: MonthlySnapshotArchiveRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> list[MonthlySnapshotRead]:
    return reports_service.archive_snapshot(
        session,
        tenant_id=tenant_id,
        payload=payload,
        actor_user_id=current_user.id,
    )
