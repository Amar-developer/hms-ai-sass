from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
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


@router.get("/catalog/available-medicines")
def list_available_medicines(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    search: str | None = None,
    page_size: int = 10,
    current_page: int = 1,
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
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
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
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
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
    _current_user: User = Depends(
        require_any_permission(
            permissions.SUPPLIERS_MANAGE,
            permissions.SUPPLIERS_CREATE,
            permissions.PHARMACY_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> PharmacySupplier:
    return create_supplier_record(session, tenant_id=tenant_id, payload=payload)


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
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> list[PharmacySupplier]:
    return list_supplier_records(
        session,
        tenant_id=tenant_id,
        include_inactive=include_inactive,
    )


@router.patch("/suppliers/{supplier_id}", response_model=SupplierRead)
def update_supplier(
    supplier_id: str,
    payload: SupplierUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.SUPPLIERS_MANAGE,
            permissions.SUPPLIERS_EDIT,
            permissions.PHARMACY_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> PharmacySupplier:
    return update_supplier_record(
        session, tenant_id=tenant_id, supplier_id=supplier_id, payload=payload
    )


@router.delete("/suppliers/{supplier_id}", response_model=SupplierRead)
def delete_supplier(
    supplier_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.SUPPLIERS_MANAGE,
            permissions.SUPPLIERS_DELETE,
            permissions.PHARMACY_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> PharmacySupplier:
    return delete_supplier_record(session, tenant_id=tenant_id, supplier_id=supplier_id)


@router.post(
    "/purchases", response_model=PurchaseRead, status_code=status.HTTP_201_CREATED
)
def create_purchase(
    payload: PurchaseCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
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
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
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
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
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
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
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
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
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
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> list[PharmacyIssue]:
    return list_pharmacy_issues_service(
        session,
        tenant_id=tenant_id,
        patient_id=patient_id,
        status_filter=status_filter,
        branch_id=branch_id,
        actor=current_user,
    )


@router.get("/issues/{issue_id}", response_model=PharmacyIssueDetailRead)
def get_pharmacy_issue(
    issue_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
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
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
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
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
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
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
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
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> list[PharmacyStockLedger]:
    return list_stock_ledger_service(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        medicine_id=medicine_id,
        actor=current_user,
    )


@router.get("/low-stock", response_model=list[LowStockRead])
def list_low_stock(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> list[LowStockRead]:
    return list_low_stock_service(
        session, tenant_id=tenant_id, branch_id=branch_id, actor=current_user
    )
