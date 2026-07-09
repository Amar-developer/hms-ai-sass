from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.reports.repositories import MonthlyRevenueSnapshotRepository
from app.modules.reports.schemas import (
    MonthlySnapshotArchiveRequest,
    MonthlySnapshotRead,
)
from app.modules.reports.services.read_models import read_snapshot
from app.modules.reports.snapshots import archive_month, previous_calendar_month


def list_monthly_snapshots(
    session: Session, *, tenant_id: str, branch_id: str | None, limit: int
) -> list[MonthlySnapshotRead]:
    # branch_id NULL is the all-branches aggregate; a specific branch returns
    # that branch's frozen figures.
    snapshots = MonthlyRevenueSnapshotRepository(session).list_for_tenant(
        tenant_id=tenant_id,
        branch_id=branch_id,
        limit=limit,
    )
    return [read_snapshot(row) for row in snapshots]


def get_monthly_snapshot(
    session: Session, *, tenant_id: str, snapshot_id: str
) -> MonthlySnapshotRead:
    snapshot = MonthlyRevenueSnapshotRepository(session).get_for_tenant(
        tenant_id, snapshot_id
    )
    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found"
        )
    return read_snapshot(snapshot)


def archive_snapshot(
    session: Session,
    *,
    tenant_id: str,
    payload: MonthlySnapshotArchiveRequest,
    actor_user_id: str | None,
) -> list[MonthlySnapshotRead]:
    # Backfill / re-close a specific month on demand. Defaults to the previous
    # calendar month. Existing frozen snapshots are kept unless overwrite=True.
    default_year, default_month = previous_calendar_month()
    year = payload.year or default_year
    month = payload.month or default_month
    if not 1 <= month <= 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid month"
        )
    if date(year, month, 1) > date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot archive a future month",
        )
    snapshots = archive_month(
        session,
        tenant_id=tenant_id,
        year=year,
        month=month,
        actor_user_id=actor_user_id,
        overwrite=payload.overwrite,
    )
    return [read_snapshot(row) for row in snapshots]
