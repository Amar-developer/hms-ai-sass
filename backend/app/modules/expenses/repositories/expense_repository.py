from datetime import date
from sqlalchemy import func
from sqlmodel import Session, select
from app.core.list_filters import (
    ListFilter,
    ListFilterOption,
    ListSort,
    apply_list_filters,
    apply_list_sort,
    labeled_filter_options,
    list_filter_options,
    tenant_user_filter_options,
)
from app.modules.expenses.listing import EXPENSE_LIST_SPEC
from app.modules.expenses.models import Expense, ExpenseCategory, ExpenseStatus
from app.modules.identity.models import User
from app.modules.tenants.models import Branch


class ExpenseRepository:
    def __init__(self, session: Session):
        self.session = session

    def get(self, expense_id: str) -> Expense | None:
        return self.session.get(Expense, expense_id)

    def get_for_tenant(self, *, tenant_id: str, expense_id: str) -> Expense | None:
        expense = self.get(expense_id)
        if not expense or expense.tenant_id != tenant_id:
            return None
        return expense

    def add(self, expense: Expense) -> Expense:
        self.session.add(expense)
        self.session.flush()
        return expense

    def list_for_tenant(
        self,
        *,
        tenant_id,
        branch_id,
        status_filter: ExpenseStatus | None = None,
        category: ExpenseCategory | None = None,
        submitted_by: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        query: str | None = None,
        list_filters: list[ListFilter] | None = None,
        list_sort: ListSort | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Expense], int]:
        stmt = select(Expense).where(Expense.tenant_id == tenant_id)
        if branch_id:
            stmt = stmt.where(Expense.branch_id == branch_id)
        if status_filter:
            stmt = stmt.where(Expense.status == status_filter)
        if category:
            stmt = stmt.where(Expense.category == category)
        if submitted_by:
            stmt = stmt.where(Expense.submitted_by == submitted_by)
        if from_date:
            stmt = stmt.where(Expense.incurred_on >= from_date)
        if to_date:
            stmt = stmt.where(Expense.incurred_on <= to_date)
        if query:
            like = f"%{query.strip()}%"
            stmt = stmt.where(Expense.description.ilike(like))
        if list_filters:
            stmt = apply_list_filters(stmt, EXPENSE_LIST_SPEC, list_filters)

        total = self.session.exec(
            select(func.count()).select_from(stmt.subquery())
        ).one()

        stmt = apply_list_sort(
            stmt,
            EXPENSE_LIST_SPEC,
            list_sort,
            default_order=[Expense.incurred_on.desc(), Expense.created_at.desc()],
        )
        rows = self.session.exec(stmt.limit(limit).offset(offset)).all()

        return list(rows), total

    def filter_options(
        self, *, tenant_id: str, branch_id: str | None = None
    ) -> dict[str, list[ListFilterOption]]:
        scope = select(
            Expense.branch_id,
            Expense.category,
            Expense.status,
            Expense.currency,
        ).where(Expense.tenant_id == tenant_id)
        if branch_id:
            scope = scope.where(Expense.branch_id == branch_id)
        scoped = scope.subquery()

        branch_statement = select(Branch.id, Branch.name).where(
            Branch.tenant_id == tenant_id,
            Branch.is_active == True,  # noqa: E712
        )
        if branch_id:
            branch_statement = branch_statement.where(Branch.id == branch_id)

        return {
            "branch_id": labeled_filter_options(
                list(self.session.exec(branch_statement.order_by(Branch.name)).all())
            ),
            "category": list_filter_options(
                list(
                    self.session.exec(
                        select(scoped.c.category)
                        .distinct()
                        .order_by(scoped.c.category)
                        .limit(100)
                    ).all()
                )
            ),
            "status": list_filter_options(
                list(
                    self.session.exec(
                        select(scoped.c.status)
                        .distinct()
                        .order_by(scoped.c.status)
                        .limit(100)
                    ).all()
                )
            ),
            "currency": list_filter_options(
                list(
                    self.session.exec(
                        select(scoped.c.currency)
                        .distinct()
                        .order_by(scoped.c.currency)
                        .limit(100)
                    ).all()
                )
            ),
            "submitted_by": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
            "approved_by": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
            "created_by_user_id": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
            "updated_by_user_id": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
        }

    def recent_subcategories(self, *, tenant_id: str, limit: int = 5) -> list[str]:
        stmt = (
            select(Expense.subcategory, func.max(Expense.created_at))
            .where(
                Expense.tenant_id == tenant_id,
                Expense.subcategory.is_not(None),
            )
            .group_by(Expense.subcategory)
            .order_by(func.max(Expense.created_at).desc())
            .limit(limit)
        )
        rows = self.session.exec(stmt).all()
        return [row[0] for row in rows]
