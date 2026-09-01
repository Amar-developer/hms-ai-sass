from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.billing.schemas import (
    CollectionReport,
    DoctorSettlementFinalize,
    DoctorSettlementRead,
    DoctorSettlementSummary,
    DueCollectionReport,
    RevenueReport,
    VendorSettlementFinalize,
    VendorSettlementRead,
)
from app.modules.billing.services.settlements_reports import (
    collection_report,
    doctor_settlement_summary,
    due_collection_report,
    finalize_doctor_settlement,
    finalize_vendor_settlement,
    revenue_report,
)
from app.modules.identity import permissions
from app.modules.identity.models import User

router = APIRouter(prefix="/billing")


@router.get("/doctor-settlements/summary", response_model=DoctorSettlementSummary)
def doctor_settlement_summary_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    practitioner_id: str | None = None,
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.SETTLEMENTS_READ,
            permissions.BILLING_MANAGE,
        )
    ),
) -> DoctorSettlementSummary:
    return doctor_settlement_summary(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        actor=current_user,
    )


@router.post("/doctor-settlements/finalize", response_model=DoctorSettlementRead)
def finalize_doctor_settlement_endpoint(
    payload: DoctorSettlementFinalize,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DoctorSettlementRead:
    return finalize_doctor_settlement(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.post("/vendor-settlements/finalize", response_model=VendorSettlementRead)
def finalize_vendor_settlement_endpoint(
    payload: VendorSettlementFinalize,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> VendorSettlementRead:
    return finalize_vendor_settlement(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/reports/due-collection", response_model=DueCollectionReport)
def due_collection_report_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.REPORTS_REVENUE_READ,
        )
    ),
) -> DueCollectionReport:
    return due_collection_report(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        actor=current_user,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/reports/revenue", response_model=RevenueReport)
def revenue_report_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    group_by: str = Query(
        default="branch", pattern="^(branch|doctor|department|visit_purpose)$"
    ),
    branch_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.REPORTS_REVENUE_READ,
        )
    ),
) -> RevenueReport:
    return revenue_report(
        session,
        tenant_id=tenant_id,
        group_by=group_by,
        branch_id=branch_id,
        from_date=from_date,
        to_date=to_date,
        actor=current_user,
    )


@router.get("/reports/collections", response_model=CollectionReport)
def collection_report_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.REPORTS_REVENUE_READ,
        )
    ),
) -> CollectionReport:
    return collection_report(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        from_date=from_date,
        to_date=to_date,
        actor=current_user,
    )
