from sqlmodel import Session

from app.core.access_control import scoped_branch_id
from app.modules.identity.models import User
from app.modules.pharmacy.models import (
    MedicineCatalog,
    PharmacyStockLedger,
    StockLedgerMovement,
)
from app.modules.pharmacy.repositories import (
    PharmacyCatalogRepository,
    PharmacyStockRepository,
)
from app.modules.pharmacy.schemas import LowStockRead
from app.modules.subscriptions.service import enforce_module_enabled


def stock_balance(
    session: Session, tenant_id: str, branch_id: str, medicine_id: str
) -> int:
    return PharmacyStockRepository(session).stock_balance(
        tenant_id=tenant_id,
        branch_id=branch_id,
        medicine_id=medicine_id,
    )


def record_stock(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    medicine_id: str,
    batch_id: str | None,
    movement_type: StockLedgerMovement,
    quantity_delta: int,
    reference_type: str,
    reference_id: str,
    actor_user_id: str | None,
) -> None:
    session.add(
        PharmacyStockLedger(
            tenant_id=tenant_id,
            branch_id=branch_id,
            medicine_id=medicine_id,
            batch_id=batch_id,
            movement_type=movement_type,
            quantity_delta=quantity_delta,
            balance_after=stock_balance(session, tenant_id, branch_id, medicine_id),
            reference_type=reference_type,
            reference_id=reference_id,
            actor_user_id=actor_user_id,
        )
    )


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
) -> list[PharmacyStockLedger]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    branch_id = scoped_branch_id(actor, branch_id)
    return PharmacyStockRepository(session).list_stock_ledger(
        tenant_id=tenant_id,
        branch_id=branch_id,
        medicine_id=medicine_id,
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
