from sqlmodel import Session

from app.core.access_control import scoped_branch_id
from app.core.pagination import DEFAULT_LIST_LIMIT
from app.modules.identity.models import User
from app.modules.pharmacy.models import (
    MedicineCatalog,
    PharmacyStockLedger,
)
from app.modules.pharmacy.repositories import (
    PharmacyCatalogRepository,
    PharmacyStockRepository,
)
from app.modules.pharmacy.schemas import LowStockRead
from app.modules.pharmacy.services.stock import stock_balance
from app.modules.subscriptions.service import enforce_module_enabled


def low_stock_rows(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    medicines: list[MedicineCatalog],
) -> list[LowStockRead]:
    rows = []
    for medicine in medicines:
        if branch_id and medicine.branch_id not in {None, branch_id}:
            continue
        check_branch = branch_id or medicine.branch_id
        if not check_branch:
            continue
        balance = stock_balance(session, tenant_id, check_branch, medicine.id)
        if balance <= medicine.reorder_level:
            rows.append(
                LowStockRead(
                    medicine_id=medicine.id,
                    medicine_name=medicine.name,
                    branch_id=check_branch,
                    quantity_on_hand=balance,
                    reorder_level=medicine.reorder_level,
                )
            )
    return rows


def list_batches_service(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    medicine_id: str | None,
    actor: User,
) -> list[dict]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    branch_id = scoped_branch_id(actor, branch_id)
    return [
        row.model_dump()
        for row in PharmacyStockRepository(session).list_batches(
            tenant_id=tenant_id,
            branch_id=branch_id,
            medicine_id=medicine_id,
        )
    ]


def list_stock_ledger_service(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    medicine_id: str | None,
    actor: User,
    limit: int = DEFAULT_LIST_LIMIT,
    offset: int = 0,
) -> list[PharmacyStockLedger]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    branch_id = scoped_branch_id(actor, branch_id)
    return PharmacyStockRepository(session).list_stock_ledger(
        tenant_id=tenant_id,
        branch_id=branch_id,
        medicine_id=medicine_id,
        limit=limit,
        offset=offset,
    )


def list_low_stock_service(
    session: Session, *, tenant_id: str, branch_id: str | None, actor: User
) -> list[LowStockRead]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    branch_id = scoped_branch_id(actor, branch_id)
    catalog_repo = PharmacyCatalogRepository(session)
    medicines = catalog_repo.list_active_medicines(tenant_id=tenant_id)
    return low_stock_rows(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        medicines=medicines,
    )
