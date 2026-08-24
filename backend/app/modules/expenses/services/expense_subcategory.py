from fastapi import HTTPException, status
from sqlmodel import Session
from app.modules.expenses.models import ExpenseCategory, ExpenseSubcategory
from app.modules.expenses.repositories.expense_subcategory_repository import (
    ExpenseSubcategoryRepository,
)
from app.modules.expenses.schemas import (
    ExpenseSubcategoryCreate,
    ExpenseSubcategoryRead,
    ExpenseSubcategoryUpdate,
)
from app.modules.identity.models import User
from app.modules.tenants.models import now_utc


def _read(subcategory: ExpenseSubcategory) -> ExpenseSubcategoryRead:
    return ExpenseSubcategoryRead.model_validate(subcategory, from_attributes=True)


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Expense subcategory not found"
    )


def _get_or_404(
    repo: ExpenseSubcategoryRepository, *, tenant_id: str, subcategory_id: str
) -> ExpenseSubcategory:
    subcategory = repo.get_for_tenant(
        tenant_id=tenant_id, subcategory_id=subcategory_id
    )
    if not subcategory:
        raise _not_found()
    return subcategory


def list_expense_subcategories(
    session: Session,
    *,
    tenant_id: str,
    category: ExpenseCategory | None = None,
    active_only: bool = False,
) -> list[ExpenseSubcategoryRead]:
    repo = ExpenseSubcategoryRepository(session=session)
    rows = repo.list_for_tenant(
        tenant_id=tenant_id, category=category, active_only=active_only
    )
    return [_read(row) for row in rows]


def create_expense_subcategory(
    session: Session,
    *,
    tenant_id: str,
    payload: ExpenseSubcategoryCreate,
    actor: User,
) -> ExpenseSubcategoryRead:
    repo = ExpenseSubcategoryRepository(session=session)
    subcategory = ExpenseSubcategory(
        tenant_id=tenant_id,
        category=payload.category,
        name=payload.name,
        default_amount=payload.default_amount,
        requires_quantity=payload.requires_quantity,
        created_by_user_id=actor.id,
        updated_by_user_id=actor.id,
    )
    repo.add(subcategory)
    session.commit()
    session.refresh(subcategory)
    return _read(subcategory)


def update_expense_subcategory(
    session: Session,
    *,
    tenant_id: str,
    subcategory_id: str,
    payload: ExpenseSubcategoryUpdate,
    actor: User,
) -> ExpenseSubcategoryRead:
    repo = ExpenseSubcategoryRepository(session=session)
    subcategory = _get_or_404(repo, tenant_id=tenant_id, subcategory_id=subcategory_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(subcategory, field, value)
    subcategory.updated_by_user_id = actor.id
    subcategory.updated_at = now_utc()
    session.add(subcategory)
    session.commit()
    session.refresh(subcategory)
    return _read(subcategory)


def delete_expense_subcategory(
    session: Session, *, tenant_id: str, subcategory_id: str, actor: User
) -> ExpenseSubcategoryRead:
    repo = ExpenseSubcategoryRepository(session=session)
    subcategory = _get_or_404(repo, tenant_id=tenant_id, subcategory_id=subcategory_id)
    subcategory.is_active = False
    subcategory.updated_by_user_id = actor.id
    subcategory.updated_at = now_utc()
    session.add(subcategory)
    session.commit()
    session.refresh(subcategory)
    return _read(subcategory)
