import json
from fastapi import HTTPException, status
from sqlmodel import Session
from app.core.access_control import require_user_branch_access, scoped_branch_id
from app.core.list_filters import ListFilter, ListFilterOption, ListSort
from app.modules.audit.service import record_audit_event
from app.modules.expenses.models import Expense, ExpenseStatus
from app.modules.expenses.repositories.expense_repository import ExpenseRepository
from app.modules.expenses.schemas import (
    ExpenseAttachReceiptRequest,
    ExpenseCreate,
    ExpenseUpdate,
    ExpenseRead,
    ExpenseRejectRequest,
    RecentSubcategory,
)
from app.modules.identity.models import User
from app.modules.subscriptions.service import enforce_module_enabled


EXPENSE_MODULE_KEY = "expense"


def _read(expense: Expense, *, user_names: dict[str, str] | None = None) -> ExpenseRead:
    read = ExpenseRead.model_validate(expense, from_attributes=True)
    if user_names:
        read.submitted_by_name = user_names.get(expense.submitted_by)
        if expense.approved_by:
            read.approved_by_name = user_names.get(expense.approved_by)
    return read


def _user_names_for(
    repo: ExpenseRepository, *, tenant_id: str, expenses: list[Expense]
) -> dict[str, str]:
    user_ids = {expense.submitted_by for expense in expenses} | {
        expense.approved_by for expense in expenses if expense.approved_by
    }
    return repo.user_names(tenant_id=tenant_id, user_ids=user_ids)


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found"
    )


def _get_or_404(repo: ExpenseRepository, *, tenant_id: str, expense_id: str) -> Expense:
    expense = repo.get_for_tenant(tenant_id=tenant_id, expense_id=expense_id)
    if not expense:
        raise _not_found()
    return expense


def list_expenses(
    session: Session,
    *,
    actor: User,
    tenant_id: str,
    branch_id: str | None,
    status_filter: ExpenseStatus | None,
    category,
    submitted_by,
    from_date,
    to_date,
    query: str | None,
    limit: int,
    offset: int,
    list_filters: list[ListFilter] | None = None,
    list_sort: ListSort | None = None,
) -> tuple[list[ExpenseRead], int]:
    enforce_module_enabled(session, tenant_id, EXPENSE_MODULE_KEY, current_user=actor)
    repo = ExpenseRepository(session=session)
    rows, total = repo.list_for_tenant(
        tenant_id=tenant_id,
        branch_id=scoped_branch_id(actor, branch_id=branch_id),
        status_filter=status_filter,
        category=category,
        submitted_by=submitted_by,
        from_date=from_date,
        to_date=to_date,
        query=query,
        list_filters=list_filters,
        list_sort=list_sort,
        limit=limit,
        offset=offset,
    )

    user_names = _user_names_for(repo, tenant_id=tenant_id, expenses=rows)
    return [_read(row, user_names=user_names) for row in rows], total


def list_expense_filter_options(
    session: Session,
    *,
    actor: User,
    tenant_id: str,
    branch_id: str | None,
) -> dict[str, list[ListFilterOption]]:
    enforce_module_enabled(session, tenant_id, EXPENSE_MODULE_KEY, current_user=actor)
    repo = ExpenseRepository(session=session)
    return repo.filter_options(
        tenant_id=tenant_id,
        branch_id=scoped_branch_id(actor, branch_id=branch_id),
    )


def get_expense(session: Session, *, tenant_id: str, expense_id: str, actor: User):
    enforce_module_enabled(session, tenant_id, EXPENSE_MODULE_KEY, current_user=actor)
    repo = ExpenseRepository(session=session)
    expense = _get_or_404(repo=repo, tenant_id=tenant_id, expense_id=expense_id)
    user_names = _user_names_for(repo, tenant_id=tenant_id, expenses=[expense])
    return _read(expense, user_names=user_names)


def get_recent_subcategories(
    session: Session, *, tenant_id: str, limit: int = 50
) -> list[RecentSubcategory]:
    repo = ExpenseRepository(session=session)
    rows = repo.recent_subcategories(tenant_id=tenant_id, limit=limit)
    return [RecentSubcategory(category=category, name=name) for category, name in rows]


def create_expense(
    session: Session, *, tenant_id: str, payload: ExpenseCreate, actor: User
) -> ExpenseRead:
    enforce_module_enabled(session, tenant_id, EXPENSE_MODULE_KEY, current_user=actor)
    require_user_branch_access(actor, payload.branch_id)
    repo = ExpenseRepository(session=session)
    expense = Expense(
        tenant_id=tenant_id,
        branch_id=payload.branch_id or actor.branch_id,
        category=payload.category,
        subcategory=payload.subcategory,
        amount=payload.amount,
        currency=payload.currency,
        incurred_on=payload.incurred_on,
        description=payload.description,
        quantity=payload.quantity,
        submitted_by=actor.id,
        created_by_user_id=actor.id,
        updated_by_user_id=actor.id,
    )
    repo.add(expense)
    session.commit()
    session.refresh(expense)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=expense.branch_id,
        actor_user_id=actor.id,
        action="expenses.expense.created",
        resource_type="expense",
        resource_id=expense.id,
        purpose="expense_claim",
        metadata_json=json.dumps(
            {"category": str(expense.category), "amount": str(expense.amount)},
            default=str,
        ),
    )

    user_names = _user_names_for(repo, tenant_id=tenant_id, expenses=[expense])
    return _read(expense=expense, user_names=user_names)


def update_expense(
    session: Session,
    *,
    tenant_id: str,
    expense_id: str,
    payload: ExpenseUpdate,
    actor: User,
) -> ExpenseRead:
    enforce_module_enabled(session, tenant_id, EXPENSE_MODULE_KEY, current_user=actor)
    repo = ExpenseRepository(session)
    expense = _get_or_404(repo, tenant_id=tenant_id, expense_id=expense_id)
    require_user_branch_access(actor, expense.branch_id)
    if expense.status != ExpenseStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending expenses can be edited",
        )
    if not actor.is_super_admin and expense.submitted_by != actor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the submitter can edit this expense",
        )
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(expense, field, value)
    expense.updated_by_user_id = actor.id
    session.add(expense)
    session.commit()
    session.refresh(expense)
    user_names = _user_names_for(repo, tenant_id=tenant_id, expenses=[expense])
    return _read(expense, user_names=user_names)


def attach_receipt(
    session: Session,
    tenant_id: str,
    expense_id: str,
    payload: ExpenseAttachReceiptRequest,
    actor: User,
) -> ExpenseRead:
    enforce_module_enabled(session, tenant_id, EXPENSE_MODULE_KEY, current_user=actor)
    repo = ExpenseRepository(session=session)
    expense = _get_or_404(repo=repo, tenant_id=tenant_id, expense_id=expense_id)
    require_user_branch_access(actor, expense.branch_id)
    if not actor.is_super_admin and expense.submitted_by != actor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the submitter can attach the receipt",
        )

    expense.receipt_file_id = payload.reciept_file_id
    expense.updated_by_user_id = actor.id
    session.add(expense)
    session.commit()
    session.refresh(expense)

    user_names = _user_names_for(repo, tenant_id=tenant_id, expenses=[expense])
    return _read(expense=expense, user_names=user_names)


def approve_expense(
    session: Session, *, tenant_id: str, expense_id: str, actor: User
) -> ExpenseRead:
    enforce_module_enabled(session, tenant_id, EXPENSE_MODULE_KEY, current_user=actor)
    repo = ExpenseRepository(session)
    expense = _get_or_404(repo, tenant_id=tenant_id, expense_id=expense_id)
    require_user_branch_access(actor, expense.branch_id)
    if expense.status != ExpenseStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending expenses can be approved",
        )
    expense.status = ExpenseStatus.APPROVED
    expense.approved_by = actor.id
    expense.updated_by_user_id = actor.id
    session.add(expense)
    session.commit()
    session.refresh(expense)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=expense.branch_id,
        actor_user_id=actor.id,
        action="expenses.expense.approved",
        resource_type="expense",
        resource_id=expense.id,
        purpose="expense_claim",
    )
    user_names = _user_names_for(repo, tenant_id=tenant_id, expenses=[expense])
    return _read(expense, user_names=user_names)


def reject_expense(
    session: Session,
    *,
    tenant_id: str,
    expense_id: str,
    payload: ExpenseRejectRequest,
    actor: User,
) -> ExpenseRead:
    enforce_module_enabled(session, tenant_id, EXPENSE_MODULE_KEY, current_user=actor)
    repo = ExpenseRepository(session)
    expense = _get_or_404(repo, tenant_id=tenant_id, expense_id=expense_id)
    require_user_branch_access(actor, expense.branch_id)
    if expense.status != ExpenseStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending expenses can be rejected",
        )
    expense.status = ExpenseStatus.REJECTED
    expense.rejection_reason = payload.reason
    expense.updated_by_user_id = actor.id
    session.add(expense)
    session.commit()
    session.refresh(expense)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=expense.branch_id,
        actor_user_id=actor.id,
        action="expenses.expense.rejected",
        resource_type="expense",
        resource_id=expense.id,
        purpose="expense_claim",
        metadata_json=json.dumps({"reason": payload.reason}),
    )
    user_names = _user_names_for(repo, tenant_id=tenant_id, expenses=[expense])
    return _read(expense, user_names=user_names)


def reimburse_expense(
    session: Session, *, tenant_id: str, expense_id: str, actor: User
) -> ExpenseRead:
    enforce_module_enabled(session, tenant_id, EXPENSE_MODULE_KEY, current_user=actor)
    repo = ExpenseRepository(session)
    expense = _get_or_404(repo, tenant_id=tenant_id, expense_id=expense_id)
    require_user_branch_access(actor, expense.branch_id)
    if expense.status != ExpenseStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only approved expenses can be reimbursed",
        )
    expense.status = ExpenseStatus.REIMBURSED
    expense.updated_by_user_id = actor.id
    session.add(expense)
    session.commit()
    session.refresh(expense)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=expense.branch_id,
        actor_user_id=actor.id,
        action="expenses.expense.reimbursed",
        resource_type="expense",
        resource_id=expense.id,
        purpose="expense_claim",
    )
    user_names = _user_names_for(repo, tenant_id=tenant_id, expenses=[expense])
    return _read(expense, user_names=user_names)
