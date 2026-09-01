from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from app.core.auth import require_any_permission
from app.core.database import get_session
from app.core.list_filters import ListFilterOption, parse_list_filters, parse_list_sort
from app.core.pagination import DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, Page
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.pharmacy.models import (
    MedicineCatalog,
    PharmacyIssue,
    PharmacyIssueStatus,
    PharmacyReturn,
    PharmacyStockLedger,
    PharmacySupplier,
)
from app.modules.pharmacy.schemas import (
    LowStockRead,
    MedicineCreate,
    MedicineRead,
    MedicineUpdate,
    PharmacyBillingLink,
    PharmacyIssueAmountUpdate,
    PharmacyIssueCreate,
    PharmacyIssueDetailRead,
    PharmacyIssueFromConsultation,
    PharmacyIssueRead,
    PharmacyIssueStatusUpdate,
    PharmacyReturnCreate,
    PharmacyReturnRead,
    PurchaseCreate,
    PurchaseRead,
    StockLedgerRead,
    SupplierCreate,
    SupplierRead,
    SupplierUpdate,
)
from app.modules.pharmacy.services.catalog import (
    list_available_medicines_service,
    list_medicines_service,
    list_popular_medicines_service,
)
from app.modules.pharmacy.services.catalog_service import (
    create_medicine_record,
    create_supplier_record,
    delete_medicine_record,
    delete_supplier_record,
    list_medicine_filter_options,
    list_medicine_page,
    list_supplier_filter_options,
    list_supplier_page,
    list_supplier_records,
    update_medicine_record,
    update_supplier_record,
)
from app.modules.pharmacy.services.issues import (
    create_pharmacy_issue_from_consultation_record,
    create_pharmacy_issue_record,
    link_pharmacy_billing_record,
    update_pharmacy_issue_amount_record,
    update_pharmacy_issue_status_record,
)
from app.modules.pharmacy.services.issue_queries import (
    get_pharmacy_issue_service,
    list_pharmacy_issue_filter_options,
    list_pharmacy_issue_page,
    list_pharmacy_issues_service,
)
from app.modules.pharmacy.services.purchases import (
    create_pharmacy_return_record,
    create_purchase_record,
)
from app.modules.pharmacy.services.stock_queries import (
    list_batches_service,
    list_low_stock_service,
    list_stock_ledger_service,
)

router = APIRouter(prefix="/pharmacy")


@router.post(
    "/medicines", response_model=MedicineRead, status_code=status.HTTP_201_CREATED
)
def create_medicine(
    payload: MedicineCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PHARMACY_MANAGE,
            permissions.PHARMACY_CREATE,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> MedicineCatalog:
    return create_medicine_record(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/medicines", response_model=list[MedicineRead])
def list_medicines(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    search: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PHARMACY_MANAGE,
            permissions.PHARMACY_READ,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> list[MedicineCatalog]:
    return list_medicines_service(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        search=search,
        actor=current_user,
    )


@router.get("/medicines/page", response_model=Page[MedicineRead])
def list_medicine_page_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    include_inactive: bool = False,
    q: str | None = Query(default=None),
    filters: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PHARMACY_MANAGE,
            permissions.PHARMACY_READ,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SERVICE_ITEMS_MANAGE,
            permissions.SERVICE_ITEMS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> Page[MedicineRead]:
    return list_medicine_page(
        session,
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
    "/medicines/filter-options", response_model=dict[str, list[ListFilterOption]]
)
def list_medicine_filter_options_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.PHARMACY_MANAGE,
            permissions.PHARMACY_READ,
            permissions.SERVICE_ITEMS_MANAGE,
            permissions.SERVICE_ITEMS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> dict[str, list[ListFilterOption]]:
    return list_medicine_filter_options(session, tenant_id=tenant_id)


@router.get("/catalog/available-medicines")
def list_available_medicines(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    search: str | None = None,
    page_size: Annotated[int, Query(ge=1, le=50)] = 10,
    current_page: Annotated[int, Query(ge=1)] = 1,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_READ,
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_SIGN,
            permissions.PHARMACY_MANAGE,
            permissions.PHARMACY_READ,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> list[dict[str, str]]:
    return list_available_medicines_service(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        search=search,
        page_size=page_size,
        current_page=current_page,
        actor=current_user,
    )


@router.get("/catalog/popular-medicines")
def list_popular_medicines(
    tenant_id: str = Depends(require_tenant_id),
    limit: int = 8,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_READ,
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_SIGN,
            permissions.PHARMACY_MANAGE,
            permissions.PHARMACY_READ,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> list[dict[str, object]]:
    return list_popular_medicines_service(session, tenant_id=tenant_id, limit=limit)


@router.patch("/medicines/{medicine_id}", response_model=MedicineRead)
def update_medicine(
    medicine_id: str,
    payload: MedicineUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_EDIT)
    ),
) -> MedicineCatalog:
    return update_medicine_record(
        session,
        tenant_id=tenant_id,
        medicine_id=medicine_id,
        payload=payload,
        actor=current_user,
    )


@router.delete("/medicines/{medicine_id}", response_model=MedicineRead)
def delete_medicine(
    medicine_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_DELETE)
    ),
) -> MedicineCatalog:
    return delete_medicine_record(
        session, tenant_id=tenant_id, medicine_id=medicine_id, actor=current_user
    )


@router.post(
    "/suppliers", response_model=SupplierRead, status_code=status.HTTP_201_CREATED
)
def create_supplier(
    payload: SupplierCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.SUPPLIERS_MANAGE,
            permissions.SUPPLIERS_CREATE,
            permissions.PHARMACY_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> PharmacySupplier:
    return create_supplier_record(
        session,
        tenant_id=tenant_id,
        payload=payload,
        actor=current_user,
    )


@router.get("/suppliers", response_model=list[SupplierRead])
def list_suppliers(
    tenant_id: str = Depends(require_tenant_id),
    include_inactive: bool = False,
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.SUPPLIERS_MANAGE,
            permissions.SUPPLIERS_READ,
            permissions.PHARMACY_MANAGE,
            permissions.BILLING_MANAGE,
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.SERVICE_ITEMS_MANAGE,
            permissions.SERVICE_ITEMS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> list[PharmacySupplier]:
    return list_supplier_records(
        session,
        tenant_id=tenant_id,
        include_inactive=include_inactive,
    )


@router.get("/suppliers/page", response_model=Page[SupplierRead])
def list_supplier_page_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    include_inactive: bool = False,
    q: str | None = Query(default=None),
    filters: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.SUPPLIERS_MANAGE,
            permissions.SUPPLIERS_READ,
            permissions.PHARMACY_MANAGE,
            permissions.BILLING_MANAGE,
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.SERVICE_ITEMS_MANAGE,
            permissions.SERVICE_ITEMS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> Page[SupplierRead]:
    return list_supplier_page(
        session,
        tenant_id=tenant_id,
        include_inactive=include_inactive,
        q=q,
        list_filters=parse_list_filters(filters),
        list_sort=parse_list_sort(sort),
        limit=limit,
        offset=offset,
    )


@router.get(
    "/suppliers/filter-options", response_model=dict[str, list[ListFilterOption]]
)
def list_supplier_filter_options_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.SUPPLIERS_MANAGE,
            permissions.SUPPLIERS_READ,
            permissions.PHARMACY_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> dict[str, list[ListFilterOption]]:
    return list_supplier_filter_options(session, tenant_id=tenant_id)


@router.patch("/suppliers/{supplier_id}", response_model=SupplierRead)
def update_supplier(
    supplier_id: str,
    payload: SupplierUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.SUPPLIERS_MANAGE,
            permissions.SUPPLIERS_EDIT,
            permissions.PHARMACY_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> PharmacySupplier:
    return update_supplier_record(
        session,
        tenant_id=tenant_id,
        supplier_id=supplier_id,
        payload=payload,
        actor=current_user,
    )


@router.delete("/suppliers/{supplier_id}", response_model=SupplierRead)
def delete_supplier(
    supplier_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.SUPPLIERS_MANAGE,
            permissions.SUPPLIERS_DELETE,
            permissions.PHARMACY_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> PharmacySupplier:
    return delete_supplier_record(
        session,
        tenant_id=tenant_id,
        supplier_id=supplier_id,
        actor=current_user,
    )


@router.post(
    "/purchases", response_model=PurchaseRead, status_code=status.HTTP_201_CREATED
)
def create_purchase(
    payload: PurchaseCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_CREATE)
    ),
) -> PurchaseRead:
    return create_purchase_record(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.post(
    "/returns", response_model=PharmacyReturnRead, status_code=status.HTTP_201_CREATED
)
def create_pharmacy_return(
    payload: PharmacyReturnCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_EDIT)
    ),
) -> PharmacyReturn:
    return create_pharmacy_return_record(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/batches", response_model=list[dict])
def list_batches(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    medicine_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_READ)
    ),
) -> list[dict]:
    return list_batches_service(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        medicine_id=medicine_id,
        actor=current_user,
    )


@router.post(
    "/issues",
    response_model=PharmacyIssueRead,
    status_code=status.HTTP_201_CREATED,
)
def create_pharmacy_issue(
    payload: PharmacyIssueCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_CREATE)
    ),
) -> PharmacyIssue:
    return create_pharmacy_issue_record(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.post(
    "/issues/from-consultation/{consultation_id}",
    response_model=PharmacyIssueRead,
    status_code=status.HTTP_201_CREATED,
)
def create_pharmacy_issue_from_consultation(
    consultation_id: str,
    payload: PharmacyIssueFromConsultation,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_CREATE)
    ),
) -> PharmacyIssue:
    return create_pharmacy_issue_from_consultation_record(
        session,
        tenant_id=tenant_id,
        consultation_id=consultation_id,
        payload=payload,
        actor=current_user,
    )


@router.get("/issues", response_model=list[PharmacyIssueRead])
def list_pharmacy_issues(
    tenant_id: str = Depends(require_tenant_id),
    patient_id: str | None = None,
    status_filter: PharmacyIssueStatus | None = None,
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_READ)
    ),
) -> list[PharmacyIssueRead]:
    return list_pharmacy_issues_service(
        session,
        tenant_id=tenant_id,
        patient_id=patient_id,
        status_filter=status_filter,
        branch_id=branch_id,
        actor=current_user,
    )


@router.get("/issues/page", response_model=Page[PharmacyIssueRead])
def list_pharmacy_issue_page_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    patient_id: str | None = None,
    status_filter: PharmacyIssueStatus | None = None,
    branch_id: str | None = None,
    q: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    filters: str | None = None,
    sort: str | None = None,
    limit: int = Query(default=DEFAULT_LIST_LIMIT, ge=1, le=MAX_LIST_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_READ)
    ),
) -> Page[PharmacyIssueRead]:
    return list_pharmacy_issue_page(
        session,
        tenant_id=tenant_id,
        patient_id=patient_id,
        status_filter=status_filter,
        branch_id=branch_id,
        q=q,
        from_date=from_date,
        to_date=to_date,
        list_filters=parse_list_filters(filters),
        list_sort=parse_list_sort(sort),
        limit=limit,
        offset=offset,
        actor=current_user,
    )


@router.get("/issues/filter-options", response_model=dict[str, list[ListFilterOption]])
def list_pharmacy_issue_filter_options_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    patient_id: str | None = None,
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_READ)
    ),
) -> dict[str, list[ListFilterOption]]:
    return list_pharmacy_issue_filter_options(
        session,
        tenant_id=tenant_id,
        patient_id=patient_id,
        branch_id=branch_id,
        actor=current_user,
    )


@router.get("/issues/{issue_id}", response_model=PharmacyIssueDetailRead)
def get_pharmacy_issue(
    issue_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_READ)
    ),
) -> PharmacyIssueDetailRead:
    return get_pharmacy_issue_service(
        session, tenant_id=tenant_id, issue_id=issue_id, actor=current_user
    )


@router.patch("/issues/{issue_id}/status", response_model=PharmacyIssueRead)
def update_pharmacy_issue_status(
    issue_id: str,
    payload: PharmacyIssueStatusUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PHARMACY_MANAGE, permissions.PHARMACY_DISPENSE
        )
    ),
) -> PharmacyIssue:
    return update_pharmacy_issue_status_record(
        session,
        tenant_id=tenant_id,
        issue_id=issue_id,
        payload=payload,
        actor=current_user,
    )


@router.patch("/issues/{issue_id}/amount", response_model=PharmacyIssueRead)
def update_pharmacy_issue_amount(
    issue_id: str,
    payload: PharmacyIssueAmountUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_EDIT)
    ),
) -> PharmacyIssue:
    return update_pharmacy_issue_amount_record(
        session,
        tenant_id=tenant_id,
        issue_id=issue_id,
        payload=payload,
        actor=current_user,
    )


@router.post("/issues/{issue_id}/billing-link", response_model=PharmacyIssueRead)
def link_pharmacy_billing(
    issue_id: str,
    payload: PharmacyBillingLink,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_EDIT)
    ),
) -> PharmacyIssue:
    return link_pharmacy_billing_record(
        session,
        tenant_id=tenant_id,
        issue_id=issue_id,
        payload=payload,
        actor=current_user,
    )


@router.get("/stock-ledger", response_model=list[StockLedgerRead])
def list_stock_ledger(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    medicine_id: str | None = None,
    limit: int = Query(default=DEFAULT_LIST_LIMIT, ge=1, le=MAX_LIST_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_READ)
    ),
) -> list[PharmacyStockLedger]:
    return list_stock_ledger_service(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        medicine_id=medicine_id,
        actor=current_user,
        limit=limit,
        offset=offset,
    )


@router.get("/low-stock", response_model=list[LowStockRead])
def list_low_stock(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.PHARMACY_MANAGE, permissions.PHARMACY_READ)
    ),
) -> list[LowStockRead]:
    return list_low_stock_service(
        session, tenant_id=tenant_id, branch_id=branch_id, actor=current_user
    )
