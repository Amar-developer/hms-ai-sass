from sqlmodel import Session

from app.modules.pharmacy.models import (
    PharmacyStockLedger,
    StockLedgerMovement,
)
from app.modules.pharmacy.repositories import PharmacyStockRepository


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
