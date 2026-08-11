from datetime import date
from sqlalchemy import func
from sqlmodel import Session, select
from app.modules.expenses.models import Expense, ExpenseCategory, ExpenseStatus


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

        total = self.session.exec(
            select(func.count()).select_from(stmt.subquery())
        ).one()

        rows = self.session.exec(
            stmt.order_by(Expense.incurred_on.desc(), Expense.created_at.desc())
            .limit(limit)
            .offset(offset)
        ).all()

        return list(rows), total

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
