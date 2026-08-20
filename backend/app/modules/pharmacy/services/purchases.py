from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.audit.service import record_audit_event
from app.modules.identity.models import User
from app.modules.pharmacy.models import (
    MedicineBatch,
    PharmacyPurchase,
    PharmacyPurchaseItem,
    PharmacyReturn,
    PharmacyReturnItem,
    StockLedgerMovement,
)
from app.modules.pharmacy.repositories import (
    PharmacyCatalogRepository,
    PharmacyStockRepository,
)
from app.modules.pharmacy.schemas import (
    MedicineBatchRead,
    PharmacyReturnCreate,
    PurchaseCreate,
    PurchaseRead,
)
from app.modules.pharmacy.services.stock import record_stock
from app.modules.subscriptions.service import enforce_module_enabled


def purchase_read(
    purchase: PharmacyPurchase, batches: list[MedicineBatch]
) -> PurchaseRead:
    return PurchaseRead(
        id=purchase.id,
        tenant_id=purchase.tenant_id,
        branch_id=purchase.branch_id,
        supplier_id=purchase.supplier_id,
        purchase_order_id=purchase.purchase_order_id,
        invoice_number=purchase.invoice_number,
        purchase_date=purchase.purchase_date,
        discount_percentage=purchase.discount_percentage,
        discount_amount=purchase.discount_amount,
        taxable_amount=purchase.taxable_amount,
        cgst_amount=purchase.cgst_amount,
        sgst_amount=purchase.sgst_amount,
        gst_amount=purchase.gst_amount,
        total_amount=purchase.total_amount,
        purchased_by_user_id=purchase.purchased_by_user_id,
        created_by_user_id=purchase.created_by_user_id,
        updated_by_user_id=purchase.updated_by_user_id,
        created_at=purchase.created_at,
        updated_at=purchase.updated_at,
        batches=[
            MedicineBatchRead.model_validate(batch, from_attributes=True)
            for batch in batches
        ],
    )


def create_purchase_record(
    session: Session, *, tenant_id: str, payload: PurchaseCreate, actor: User
) -> PurchaseRead:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    require_user_branch_access(actor, payload.branch_id)
    purchase = PharmacyPurchase(
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        supplier_id=payload.supplier_id,
        purchase_order_id=payload.purchase_order_id,
        invoice_number=payload.invoice_number,
        purchase_date=payload.purchase_date or datetime.now(timezone.utc),
        discount_percentage=payload.discount_percentage,
        purchased_by_user_id=payload.purchased_by_user_id or actor.id,
        created_by_user_id=actor.id,
        updated_by_user_id=actor.id,
    )
    session.add(purchase)
    session.commit()
    session.refresh(purchase)
    batches = []
    line_discount_total = 0
    taxable_total = 0
    cgst_total = 0
    sgst_total = 0
    for item in payload.items:
        medicine = PharmacyCatalogRepository(session).get_medicine_for_tenant(
            tenant_id=tenant_id,
            medicine_id=item.medicine_id,
        )
        if not medicine:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid medicine"
            )
        gross_line = item.quantity * item.cost_price
        line_discount = round(gross_line * item.discount_percentage / 100)
        taxable_line = max(0, gross_line - line_discount)
        cgst_amount = round(taxable_line * item.cgst_percentage / 100)
        sgst_amount = round(taxable_line * item.sgst_percentage / 100)
        gst_amount = cgst_amount + sgst_amount
        line_total = taxable_line + gst_amount
        line_discount_total += line_discount
        taxable_total += taxable_line
        cgst_total += cgst_amount
        sgst_total += sgst_amount
        batch = MedicineBatch(
            tenant_id=tenant_id,
            branch_id=payload.branch_id,
            medicine_id=medicine.id,
            purchase_id=purchase.id,
            batch_number=item.batch_number,
            expiry_date=item.expiry_date,
            quantity_on_hand=item.quantity,
            cost_price=item.cost_price,
            sale_price=item.sale_price or medicine.default_sale_price,
        )
        session.add(batch)
        session.commit()
        session.refresh(batch)
        batches.append(batch)
        session.add(
            PharmacyPurchaseItem(
                tenant_id=tenant_id,
                branch_id=payload.branch_id,
                purchase_id=purchase.id,
                medicine_id=medicine.id,
                batch_id=batch.id,
                quantity=item.quantity,
                cost_price=item.cost_price,
                sale_price=batch.sale_price,
                discount_percentage=item.discount_percentage,
                discount_amount=line_discount,
                taxable_amount=taxable_line,
                cgst_percentage=item.cgst_percentage,
                sgst_percentage=item.sgst_percentage,
                cgst_amount=cgst_amount,
                sgst_amount=sgst_amount,
                gst_amount=gst_amount,
                line_total=line_total,
            )
        )
        record_stock(
            session,
            tenant_id=tenant_id,
            branch_id=payload.branch_id,
            medicine_id=medicine.id,
            batch_id=batch.id,
            movement_type=StockLedgerMovement.PURCHASE,
            quantity_delta=item.quantity,
            reference_type="pharmacy_purchase",
            reference_id=purchase.id,
            actor_user_id=purchase.purchased_by_user_id,
        )
    purchase_discount = round(taxable_total * payload.discount_percentage / 100)
    purchase.discount_amount = line_discount_total + purchase_discount
    purchase.taxable_amount = max(0, taxable_total - purchase_discount)
    if taxable_total and purchase_discount:
        cgst_total = round(cgst_total * purchase.taxable_amount / taxable_total)
        sgst_total = round(sgst_total * purchase.taxable_amount / taxable_total)
    purchase.cgst_amount = cgst_total
    purchase.sgst_amount = sgst_total
    purchase.gst_amount = cgst_total + sgst_total
    purchase.total_amount = purchase.taxable_amount + purchase.gst_amount
    purchase.updated_at = datetime.now(timezone.utc)
    purchase.updated_by_user_id = actor.id
    session.add(purchase)
    session.commit()
    session.refresh(purchase)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        actor_user_id=purchase.created_by_user_id,
        action="pharmacy_purchase.created",
        resource_type="pharmacy_purchase",
        resource_id=purchase.id,
        purpose="pharmacy",
    )
    return purchase_read(purchase, batches)


def create_pharmacy_return_record(
    session: Session, *, tenant_id: str, payload: PharmacyReturnCreate, actor: User
) -> PharmacyReturn:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    require_user_branch_access(actor, payload.branch_id)
    total = 0
    return_record = PharmacyReturn(
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        supplier_id=payload.supplier_id,
        purchase_id=payload.purchase_id,
        reason=payload.reason,
        returned_by_user_id=payload.returned_by_user_id or actor.id,
        created_by_user_id=actor.id,
        updated_by_user_id=actor.id,
    )
    session.add(return_record)
    session.commit()
    session.refresh(return_record)
    for item in payload.items:
        # Lock the batch row so the read-then-decrement is atomic under
        # concurrent returns/dispenses (no negative or lost stock updates).
        batch = PharmacyStockRepository(session).get_batch_for_update(item.batch_id)
        if (
            not batch
            or batch.tenant_id != tenant_id
            or batch.branch_id != payload.branch_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid return batch"
            )
        if batch.medicine_id != item.medicine_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Medicine and batch do not match",
            )
        if batch.quantity_on_hand < item.quantity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Return quantity exceeds stock",
            )
        amount = item.amount or item.quantity * batch.cost_price
        total += amount
        batch.quantity_on_hand -= item.quantity
        batch.updated_at = datetime.now(timezone.utc)
        session.add(batch)
        session.add(
            PharmacyReturnItem(
                tenant_id=tenant_id,
                branch_id=payload.branch_id,
                return_id=return_record.id,
                medicine_id=item.medicine_id,
                batch_id=item.batch_id,
                quantity=item.quantity,
                amount=amount,
            )
        )
        record_stock(
            session,
            tenant_id=tenant_id,
            branch_id=payload.branch_id,
            medicine_id=item.medicine_id,
            batch_id=item.batch_id,
            movement_type=StockLedgerMovement.RETURN,
            quantity_delta=-item.quantity,
            reference_type="pharmacy_return",
            reference_id=return_record.id,
            actor_user_id=return_record.returned_by_user_id,
        )
    return_record.total_amount = total
    return_record.updated_by_user_id = actor.id
    session.add(return_record)
    session.commit()
    session.refresh(return_record)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        actor_user_id=return_record.created_by_user_id,
        action="pharmacy_return.created",
        resource_type="pharmacy_return",
        resource_id=return_record.id,
        purpose="pharmacy",
    )
    return return_record
