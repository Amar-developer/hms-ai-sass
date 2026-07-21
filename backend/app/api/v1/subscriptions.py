from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.subscriptions.models import (
    SubscriptionCredit,
    SubscriptionInvoice,
    SubscriptionInvoiceStatus,
    TenantSubscription,
)
from app.modules.subscriptions.schemas import (
    EntitlementRead,
    SubscriptionAnnouncementRead,
    SubscriptionCreditCreate,
    SubscriptionCreditRead,
    SubscriptionInvoiceFailureCreate,
    SubscriptionInvoiceCreate,
    SubscriptionInvoiceRead,
    SubscriptionInvoiceSettlementCreate,
    SubscriptionPlanCreate,
    SubscriptionPlanRead,
    SubscriptionPlanStatusUpdate,
    SubscriptionPlanUpdate,
    SubscriptionRevenueReport,
    SubscriptionRevenueSummary,
    SubscriptionUsageRead,
    TenantSubscriptionCreate,
    TenantSubscriptionRead,
)
from app.modules.subscriptions import service as subscriptions_service

router = APIRouter(prefix="/subscription-plans")


@router.post(
    "", response_model=SubscriptionPlanRead, status_code=status.HTTP_201_CREATED
)
def create_plan(
    payload: SubscriptionPlanCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)
    ),
) -> SubscriptionPlanRead:
    return subscriptions_service.create_plan(
        session, payload=payload, actor=current_user
    )


@router.get("", response_model=list[SubscriptionPlanRead])
def list_plans(
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)
    ),
) -> list[SubscriptionPlanRead]:
    return subscriptions_service.list_plans(session)


@router.patch("/{plan_id}", response_model=SubscriptionPlanRead)
def update_plan(
    plan_id: str,
    payload: SubscriptionPlanUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)
    ),
) -> SubscriptionPlanRead:
    return subscriptions_service.update_plan(
        session, plan_id=plan_id, payload=payload, actor=current_user
    )


@router.post("/{plan_id}/status", response_model=SubscriptionPlanRead)
def change_plan_status(
    plan_id: str,
    payload: SubscriptionPlanStatusUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)
    ),
) -> SubscriptionPlanRead:
    return subscriptions_service.change_plan_status(
        session, plan_id=plan_id, payload=payload, actor=current_user
    )


@router.post(
    "/tenant-subscriptions",
    response_model=TenantSubscriptionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_tenant_subscription(
    payload: TenantSubscriptionCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)
    ),
) -> TenantSubscription:
    return subscriptions_service.create_tenant_subscription(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/tenant-subscriptions", response_model=list[TenantSubscriptionRead])
def list_tenant_subscriptions(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)
    ),
) -> list[TenantSubscription]:
    return subscriptions_service.list_tenant_subscriptions(session, tenant_id=tenant_id)


@router.get("/tenant-subscriptions/active", response_model=TenantSubscriptionRead)
def get_active_tenant_subscription(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> TenantSubscription:
    return subscriptions_service.get_active_tenant_subscription(
        session, tenant_id=tenant_id
    )


@router.get("/entitlements", response_model=EntitlementRead)
def get_entitlements(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.REPORTS_READ,
            permissions.SETTINGS_MANAGE,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_READ,
            permissions.IDENTITY_ROLES_MANAGE,
            permissions.BRANCHES_MANAGE,
            permissions.DEPARTMENTS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.PATIENT_SUBSCRIPTIONS_CREATE,
            permissions.HOME_CARE_MANAGE,
            permissions.HOME_CARE_READ,
            permissions.HOME_CARE_CREATE,
        )
    ),
) -> EntitlementRead:
    return subscriptions_service.get_entitlements(session, tenant_id=tenant_id)


@router.post(
    "/credits",
    response_model=SubscriptionCreditRead,
    status_code=status.HTTP_201_CREATED,
)
def purchase_subscription_credit(
    payload: SubscriptionCreditCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)
    ),
) -> SubscriptionCredit:
    return subscriptions_service.purchase_subscription_credit(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/credits", response_model=list[SubscriptionCreditRead])
def list_subscription_credits(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> list[SubscriptionCredit]:
    return subscriptions_service.list_subscription_credits(session, tenant_id=tenant_id)


@router.post(
    "/invoices",
    response_model=SubscriptionInvoiceRead,
    status_code=status.HTTP_201_CREATED,
)
def create_subscription_invoice(
    payload: SubscriptionInvoiceCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)
    ),
) -> SubscriptionInvoice:
    return subscriptions_service.create_subscription_invoice(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/invoices", response_model=list[SubscriptionInvoiceRead])
def list_subscription_invoices(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> list[SubscriptionInvoiceRead]:
    return subscriptions_service.list_subscription_invoices(
        session, tenant_id=tenant_id
    )


@router.post("/invoices/{invoice_id}/settle", response_model=SubscriptionInvoiceRead)
def settle_subscription_invoice(
    invoice_id: str,
    payload: SubscriptionInvoiceSettlementCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)
    ),
) -> SubscriptionInvoiceRead:
    return subscriptions_service.settle_subscription_invoice(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/invoices/{invoice_id}/payment-failed", response_model=SubscriptionInvoiceRead
)
def mark_subscription_payment_failed(
    invoice_id: str,
    payload: SubscriptionInvoiceFailureCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)
    ),
) -> SubscriptionInvoiceRead:
    return subscriptions_service.mark_subscription_payment_failed(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        payload=payload,
        actor=current_user,
    )


@router.get("/usage", response_model=SubscriptionUsageRead)
def get_subscription_usage(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> SubscriptionUsageRead:
    return subscriptions_service.read_usage(session, tenant_id)


@router.get("/announcements", response_model=list[SubscriptionAnnouncementRead])
def get_subscription_announcements(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> list[SubscriptionAnnouncementRead]:
    return subscriptions_service.get_subscription_announcements(
        session, tenant_id=tenant_id
    )


@router.get("/reports/revenue", response_model=SubscriptionRevenueReport)
def subscription_revenue_report(
    tenant_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    status_filter: SubscriptionInvoiceStatus | None = Query(
        default=None, alias="status"
    ),
    q: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    export: str | None = Query(default=None, pattern="^(csv|xls|pdf)$"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
):
    return subscriptions_service.subscription_revenue_report(
        session,
        current_user=current_user,
        tenant_id=tenant_id,
        from_date=from_date,
        to_date=to_date,
        status_filter=status_filter,
        q=q,
        page=page,
        page_size=page_size,
        export=export,
    )


@router.get("/platform/revenue-summary", response_model=SubscriptionRevenueSummary)
def get_platform_revenue_summary(
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)
    ),
) -> SubscriptionRevenueSummary:
    return subscriptions_service.get_platform_revenue_summary(session)
