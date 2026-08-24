from sqlmodel import Session, select
from app.modules.expenses.models import ExpenseCategory, ExpenseSubcategory


class ExpenseSubcategoryRepository:
    def __init__(self, session: Session):
        self.session = session

    def get(self, subcategory_id: str) -> ExpenseSubcategory | None:
        return self.session.get(ExpenseSubcategory, subcategory_id)

    def get_for_tenant(
        self, *, tenant_id: str, subcategory_id: str
    ) -> ExpenseSubcategory | None:
        subcategory = self.get(subcategory_id)
        if not subcategory or subcategory.tenant_id != tenant_id:
            return None
        return subcategory

    def add(self, subcategory: ExpenseSubcategory) -> ExpenseSubcategory:
        self.session.add(subcategory)
        self.session.flush()
        return subcategory

    def list_for_tenant(
        self,
        *,
        tenant_id: str,
        category: ExpenseCategory | None = None,
        active_only: bool = False,
    ) -> list[ExpenseSubcategory]:
        stmt = select(ExpenseSubcategory).where(
            ExpenseSubcategory.tenant_id == tenant_id
        )
        if category:
            stmt = stmt.where(ExpenseSubcategory.category == category)
        if active_only:
            stmt = stmt.where(ExpenseSubcategory.is_active == True)  # noqa: E712
        stmt = stmt.order_by(ExpenseSubcategory.category, ExpenseSubcategory.name)
        return list(self.session.exec(stmt).all())
