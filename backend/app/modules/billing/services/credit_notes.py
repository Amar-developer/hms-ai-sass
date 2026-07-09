from collections.abc import Callable

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import CreditNote, Invoice, InvoiceStatus
from app.modules.billing.repositories import BillingPaymentRepository
from app.modules.billing.schemas import CreditNoteCreate
from app.modules.billing.service import (
    next_credit_note_number,
    update_invoice_payment_status,
)
from app.modules.identity.models import User

LedgerRecorder = Callable[..., object]
SourceSyncer = Callable[[Session, Invoice], None]


def create_credit_note_for_invoice(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    payload: CreditNoteCreate,
    current_user: User,
    record_billing_ledger: LedgerRecorder,
    sync_invoice_source_after_reversal: SourceSyncer,
) -> CreditNote:
    payment_repo = BillingPaymentRepository(session)
    invoice = payment_repo.get_invoice_for_tenant(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot issue credit note for {invoice.status.value} invoice",
        )
    if payload.amount > invoice.total_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Credit note amount cannot exceed invoice total",
        )
    credit = CreditNote(
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        credit_note_number=next_credit_note_number(session, tenant_id),
        amount=payload.amount,
        reason=payload.reason,
        created_by_user_id=payload.created_by_user_id,
    )
    session.add(credit)
    session.commit()
    session.refresh(credit)
    invoice = update_invoice_payment_status(session, invoice)
    record_billing_ledger(
        session,
        invoice,
        entry_type="credit_note_issued",
        description="Credit note issued",
        debit_amount=credit.amount,
        balance_amount_delta=-credit.amount,
        reason=payload.reason,
        actor_user_id=payload.created_by_user_id,
        related_credit_note_id=credit.id,
    )
    sync_invoice_source_after_reversal(session, invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="credit_note.issued",
        resource_type="credit_note",
        resource_id=credit.id,
        purpose="credit_note",
    )
    return credit
