from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from app.core.auth import require_any_permission
from app.core.database import get_session
from app.core.list_filters import ListFilterOption, parse_list_filters, parse_list_sort
from app.core.pagination import Page
from app.core.tenant_context import require_tenant_id
from app.modules.billing.schemas import InvoiceDetailRead
from app.modules.home_care.models import HomeCareService
from app.modules.home_care.schemas import (
    HomeCareBookingCreate,
    HomeCareBookingRead,
    HomeCareBookingUpdate,
    HomeCareInvoiceCreate,
    HomeCareServiceCreate,
    HomeCareServiceRead,
    HomeCareServiceUpdate,
    HomeCareVisitLogCreate,
    HomeCareVisitLogRead,
    HomeCareVisitLogUpdate,
)
from app.modules.home_care.services.billing_service import HomeCareBillingService
from app.modules.home_care.services.booking_service import (
    HomeCareBookingLifecycleService,
)
from app.modules.home_care.services.catalog_service import HomeCareCatalogService
from app.modules.home_care.services.visit_service import HomeCareVisitService
from app.modules.identity import permissions
from app.modules.identity.models import User

router = APIRouter(prefix="/home-care")


@router.get("/services", response_model=list[HomeCareServiceRead])
def list_services(
    branch_id: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.HOME_CARE_READ, permissions.HOME_CARE_MANAGE)
    ),
) -> list[HomeCareService]:
    return HomeCareCatalogService(session).list_services(
        tenant_id=tenant_id, branch_id=branch_id, actor=current_user
    )


@router.get("/services/page", response_model=Page[HomeCareServiceRead])
def list_service_page(
    branch_id: str | None = None,
    include_inactive: bool = False,
    q: str | None = Query(default=None),
    filters: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.HOME_CARE_READ,
            permissions.HOME_CARE_MANAGE,
            permissions.SERVICE_ITEMS_READ,
            permissions.SERVICE_ITEMS_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> Page[HomeCareServiceRead]:
    return HomeCareCatalogService(session).list_service_page(
        tenant_id=tenant_id,
        branch_id=branch_id,
        include_inactive=include_inactive,
        q=q,
        list_filters=parse_list_filters(filters),
        list_sort=parse_list_sort(sort),
        limit=limit,
        offset=offset,
        actor=current_user,
    )


@router.get(
    "/services/filter-options", response_model=dict[str, list[ListFilterOption]]
)
def list_service_filter_options(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.HOME_CARE_READ,
            permissions.HOME_CARE_MANAGE,
            permissions.SERVICE_ITEMS_READ,
            permissions.SERVICE_ITEMS_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> dict[str, list[ListFilterOption]]:
    return HomeCareCatalogService(session).list_service_filter_options(
        tenant_id=tenant_id
    )


@router.post(
    "/services", response_model=HomeCareServiceRead, status_code=status.HTTP_201_CREATED
)
def create_service(
    payload: HomeCareServiceCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.HOME_CARE_CREATE, permissions.HOME_CARE_MANAGE
        )
    ),
) -> HomeCareServiceRead:
    return HomeCareCatalogService(session).create_service(
        tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.patch("/services/{service_id}", response_model=HomeCareServiceRead)
def update_service(
    service_id: str,
    payload: HomeCareServiceUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.HOME_CARE_EDIT, permissions.HOME_CARE_MANAGE)
    ),
) -> HomeCareServiceRead:
    return HomeCareCatalogService(session).update_service(
        tenant_id=tenant_id, service_id=service_id, payload=payload, actor=current_user
    )


@router.delete("/services/{service_id}", response_model=HomeCareServiceRead)
def delete_service(
    service_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.HOME_CARE_DELETE, permissions.HOME_CARE_MANAGE
        )
    ),
) -> HomeCareServiceRead:
    return HomeCareCatalogService(session).delete_service(
        tenant_id=tenant_id, service_id=service_id, actor=current_user
    )


@router.get("/bookings", response_model=list[HomeCareBookingRead])
def list_bookings(
    branch_id: str | None = None,
    patient_id: str | None = None,
    status_filter: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.HOME_CARE_READ, permissions.HOME_CARE_MANAGE)
    ),
) -> list[HomeCareBookingRead]:
    return HomeCareBookingLifecycleService(session).list_bookings(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        status_filter=status_filter,
        actor=current_user,
    )


@router.post(
    "/bookings", response_model=HomeCareBookingRead, status_code=status.HTTP_201_CREATED
)
def create_booking(
    payload: HomeCareBookingCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.HOME_CARE_CREATE, permissions.HOME_CARE_MANAGE
        )
    ),
) -> HomeCareBookingRead:
    return HomeCareBookingLifecycleService(session).create_booking(
        tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.patch("/bookings/{booking_id}", response_model=HomeCareBookingRead)
def update_booking(
    booking_id: str,
    payload: HomeCareBookingUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.HOME_CARE_EDIT, permissions.HOME_CARE_MANAGE)
    ),
) -> HomeCareBookingRead:
    return HomeCareBookingLifecycleService(session).update_booking(
        tenant_id=tenant_id,
        booking_id=booking_id,
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/bookings/{booking_id}/visits",
    response_model=HomeCareVisitLogRead,
    status_code=status.HTTP_201_CREATED,
)
def create_visit_log(
    booking_id: str,
    payload: HomeCareVisitLogCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.HOME_CARE_CREATE, permissions.HOME_CARE_MANAGE
        )
    ),
) -> HomeCareVisitLogRead:
    return HomeCareVisitService(session).create_visit_log(
        tenant_id=tenant_id,
        booking_id=booking_id,
        payload=payload,
        actor=current_user,
    )


@router.patch(
    "/bookings/{booking_id}/visits/{visit_id}",
    response_model=HomeCareVisitLogRead,
)
def update_visit_log(
    booking_id: str,
    visit_id: str,
    payload: HomeCareVisitLogUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.HOME_CARE_EDIT, permissions.HOME_CARE_MANAGE)
    ),
) -> HomeCareVisitLogRead:
    return HomeCareVisitService(session).update_visit_log(
        tenant_id=tenant_id,
        booking_id=booking_id,
        visit_id=visit_id,
        payload=payload,
        actor=current_user,
    )


@router.delete(
    "/bookings/{booking_id}/visits/{visit_id}",
    response_model=HomeCareVisitLogRead,
)
def delete_visit_log(
    booking_id: str,
    visit_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.HOME_CARE_EDIT, permissions.HOME_CARE_MANAGE)
    ),
) -> HomeCareVisitLogRead:
    return HomeCareVisitService(session).delete_visit_log(
        tenant_id=tenant_id,
        booking_id=booking_id,
        visit_id=visit_id,
        actor=current_user,
    )


@router.get("/bookings/{booking_id}/invoice", response_model=InvoiceDetailRead | None)
def get_booking_invoice(
    booking_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_READ,
            permissions.INVOICES_READ,
        )
    ),
) -> InvoiceDetailRead | None:
    return HomeCareBillingService(session).get_booking_invoice(
        tenant_id=tenant_id, booking_id=booking_id, actor=current_user
    )


@router.post(
    "/bookings/{booking_id}/invoice",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def generate_invoice(
    booking_id: str,
    payload: HomeCareInvoiceCreate | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_CREATE,
            permissions.INVOICES_CREATE,
        )
    ),
) -> InvoiceDetailRead:
    return HomeCareBillingService(session).generate_invoice(
        tenant_id=tenant_id,
        booking_id=booking_id,
        payload=payload,
        actor=current_user,
    )
