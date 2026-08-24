from datetime import date
from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session
from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.list_filters import ListFilterOption, parse_list_filters, parse_list_sort
from app.core.pagination import Page
from app.core.tenant_context import require_tenant_id
from app.modules.expenses.models import ExpenseCategory, ExpenseStatus
from app.modules.expenses.schemas import (
    ExpenseAttachReceiptRequest,
    ExpenseCreate,
    ExpenseRead,
    ExpenseRejectRequest,
    ExpenseSubcategoryCreate,
    ExpenseSubcategoryRead,
    ExpenseSubcategoryUpdate,
    ExpenseUpdate,
    RecentSubcategory,
)
from app.modules.expenses.services.expense import (
    create_expense,
    approve_expense,
    attach_receipt,
    update_expense,
    list_expenses,
    list_expense_filter_options,
    reject_expense,
    reimburse_expense,
    get_expense,
    get_recent_subcategories,
)
from app.modules.expenses.services.expense_subcategory import (
    create_expense_subcategory,
    delete_expense_subcategory,
    list_expense_subcategories,
    update_expense_subcategory,
)

from app.modules.identity import permissions
from app.modules.identity.models import User

router = APIRouter(prefix="/expenses")


@router.get("", response_model=Page[ExpenseRead])
def list_expenses_endpoint(
    branch_id: str | None = Query(default=None),
    status_filter: ExpenseStatus | None = Query(default=None, alias="status"),
    category: ExpenseCategory | None = Query(default=None),
    submitted_by: str | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    q: str | None = Query(default=None),
    filters: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.EXPENSES_MANAGE, permissions.EXPENSES_READ)
    ),
) -> Page[ExpenseRead]:
    items, total = list_expenses(
        session,
        tenant_id=tenant_id,
        actor=current_user,
        branch_id=branch_id,
        status_filter=status_filter,
        category=category,
        submitted_by=submitted_by,
        from_date=from_date,
        to_date=to_date,
        query=q,
        limit=limit,
        offset=offset,
        list_filters=parse_list_filters(filters),
        list_sort=parse_list_sort(sort),
    )

    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/filter-options", response_model=dict[str, list[ListFilterOption]])
def list_expense_filter_options_endpoint(
    branch_id: str | None = Query(default=None),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.EXPENSES_MANAGE, permissions.EXPENSES_READ)
    ),
) -> dict[str, list[ListFilterOption]]:
    return list_expense_filter_options(
        session,
        tenant_id=tenant_id,
        actor=current_user,
        branch_id=branch_id,
    )


@router.get("/subcategories/recent", response_model=list[RecentSubcategory])
def recent_subcategories_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.EXPENSES_MANAGE,
            permissions.EXPENSES_CREATE,
            permissions.EXPENSES_READ,
        )
    ),
) -> list[RecentSubcategory]:
    return get_recent_subcategories(session, tenant_id=tenant_id)


@router.post(
    "/subcategory-configs",
    response_model=ExpenseSubcategoryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_expense_subcategory_config_endpoint(
    payload: ExpenseSubcategoryCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.EXPENSE_SUBCATEGORIES_MANAGE,
            permissions.EXPENSE_SUBCATEGORIES_CREATE,
        )
    ),
) -> ExpenseSubcategoryRead:
    return create_expense_subcategory(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get(
    "/subcategory-configs",
    response_model=list[ExpenseSubcategoryRead],
)
def list_expense_subcategory_configs_endpoint(
    category: ExpenseCategory | None = Query(default=None),
    active_only: bool = Query(default=False),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.EXPENSE_SUBCATEGORIES_MANAGE,
            permissions.EXPENSE_SUBCATEGORIES_READ,
            permissions.EXPENSES_MANAGE,
            permissions.EXPENSES_CREATE,
        )
    ),
) -> list[ExpenseSubcategoryRead]:
    return list_expense_subcategories(
        session, tenant_id=tenant_id, category=category, active_only=active_only
    )


@router.patch(
    "/subcategory-configs/{subcategory_id}",
    response_model=ExpenseSubcategoryRead,
)
def update_expense_subcategory_config_endpoint(
    subcategory_id: str,
    payload: ExpenseSubcategoryUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.EXPENSE_SUBCATEGORIES_MANAGE,
            permissions.EXPENSE_SUBCATEGORIES_EDIT,
        )
    ),
) -> ExpenseSubcategoryRead:
    return update_expense_subcategory(
        session,
        tenant_id=tenant_id,
        subcategory_id=subcategory_id,
        payload=payload,
        actor=current_user,
    )


@router.delete(
    "/subcategory-configs/{subcategory_id}",
    response_model=ExpenseSubcategoryRead,
)
def delete_expense_subcategory_config_endpoint(
    subcategory_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.EXPENSE_SUBCATEGORIES_MANAGE,
            permissions.EXPENSE_SUBCATEGORIES_DELETE,
        )
    ),
) -> ExpenseSubcategoryRead:
    return delete_expense_subcategory(
        session, tenant_id=tenant_id, subcategory_id=subcategory_id, actor=current_user
    )


@router.get("/{expense_id}", response_model=ExpenseRead)
def get_expense_endpoint(
    expense_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.EXPENSES_MANAGE, permissions.EXPENSES_READ)
    ),
) -> ExpenseRead:
    return get_expense(
        session, tenant_id=tenant_id, expense_id=expense_id, actor=current_user
    )


@router.post("", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
def create_expense_endpoint(
    payload: ExpenseCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.EXPENSES_MANAGE, permissions.EXPENSES_CREATE)
    ),
) -> ExpenseRead:
    return create_expense(
        session=session, payload=payload, tenant_id=tenant_id, actor=current_user
    )


@router.patch("/{expense_id}", response_model=ExpenseRead)
def update_expense_endpoint(
    expense_id: str,
    payload: ExpenseUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.EXPENSES_MANAGE, permissions.EXPENSES_CREATE)
    ),
) -> ExpenseRead:
    return update_expense(
        session,
        tenant_id=tenant_id,
        expense_id=expense_id,
        payload=payload,
        actor=current_user,
    )


@router.post("/{expense_id}/receipt", response_model=ExpenseRead)
def attach_receipt_endpoint(
    expense_id: str,
    payload: ExpenseAttachReceiptRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.EXPENSES_MANAGE, permissions.EXPENSES_CREATE)
    ),
) -> ExpenseRead:
    return attach_receipt(
        session,
        tenant_id=tenant_id,
        expense_id=expense_id,
        payload=payload,
        actor=current_user,
    )


@router.post("/{expense_id}/approve", response_model=ExpenseRead)
def approve_expense_endpoint(
    expense_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.EXPENSES_APPROVE)),
) -> ExpenseRead:
    return approve_expense(
        session, tenant_id=tenant_id, expense_id=expense_id, actor=current_user
    )


@router.post("/{expense_id}/reject", response_model=ExpenseRead)
def reject_expense_endpoint(
    expense_id: str,
    payload: ExpenseRejectRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.EXPENSES_APPROVE)),
) -> ExpenseRead:
    return reject_expense(
        session,
        tenant_id=tenant_id,
        expense_id=expense_id,
        payload=payload,
        actor=current_user,
    )


@router.post("/{expense_id}/reimburse", response_model=ExpenseRead)
def reimburse_expense_endpoint(
    expense_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.EXPENSES_MANAGE)),
) -> ExpenseRead:
    return reimburse_expense(
        session, tenant_id=tenant_id, expense_id=expense_id, actor=current_user
    )
