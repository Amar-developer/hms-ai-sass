import json
from fastapi import HTTPException, status
from sqlmodel import Session
from app.core.access_control import require_user_branch_access, scoped_branch_id
from app.modules.audit.service import record_audit_event
from app.modules.expenses.models import Expense, ExpenseStatus
from app.modules.expenses.repositories.expense_repository import ExpenseRepository
from app.modules.expenses.schemas import (
    ExpenseAttachReceiptRequest,
    ExpenseCreate,
    ExpenseUpdate,
    ExpenseRead,
    ExpenseRejectRequest,
)
from app.modules.identity.models import User


def _read(expense: Expense) -> ExpenseRead:
    return ExpenseRead.model_validate(expense, from_attributes=True)


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
) -> tuple[list[ExpenseRead], int]:
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
        limit=limit,
        offset=offset,
    )

    return [_read(row) for row in rows], total


def get_expense(session: Session, *, tenant_id: str, expense_id: str):
    repo = ExpenseRepository(session=session)
    return _read(_get_or_404(repo=repo, tenant_id=tenant_id, expense_id=expense_id))


def get_recent_subcategories(
    session: Session, *, tenant_id: str, limit: int = 5
) -> list[str]:
    repo = ExpenseRepository(session=session)
    return repo.recent_subcategories(tenant_id=tenant_id, limit=limit)


def create_expense(
    session: Session, *, tenant_id: str, payload: ExpenseCreate, actor: User
) -> ExpenseRead:
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
        submitted_by=actor.id,
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

    return _read(expense=expense)


def update_expense(
    session: Session,
    *,
    tenant_id: str,
    expense_id: str,
    payload: ExpenseUpdate,
    actor: User,
) -> ExpenseRead:
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
    session.add(expense)
    session.commit()
    session.refresh(expense)
    return _read(expense)


def attach_receipt(
    session: Session,
    tenant_id: str,
    expense_id: str,
    payload: ExpenseAttachReceiptRequest,
    actor: User,
) -> ExpenseRead:
    repo = ExpenseRepository(session=session)
    expense = _get_or_404(repo=repo, tenant_id=tenant_id, expense_id=expense_id)
    require_user_branch_access(actor, expense.branch_id)
    if not actor.is_super_admin and expense.submitted_by != actor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the submitter can attach the receipt",
        )

    expense.receipt_file_id = payload.reciept_file_id
    session.add(expense)
    session.commit()
    session.refresh(expense)

    return _read(expense=expense)


def approve_expense(
    session: Session, *, tenant_id: str, expense_id: str, actor: User
) -> ExpenseRead:
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
    return _read(expense)


def reject_expense(
    session: Session,
    *,
    tenant_id: str,
    expense_id: str,
    payload: ExpenseRejectRequest,
    actor: User,
) -> ExpenseRead:
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
    return _read(expense)


def reimburse_expense(
    session: Session, *, tenant_id: str, expense_id: str, actor: User
) -> ExpenseRead:
    repo = ExpenseRepository(session)
    expense = _get_or_404(repo, tenant_id=tenant_id, expense_id=expense_id)
    require_user_branch_access(actor, expense.branch_id)
    if expense.status != ExpenseStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only approved expenses can be reimbursed",
        )
    expense.status = ExpenseStatus.REIMBURSED
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
    return _read(expense)
