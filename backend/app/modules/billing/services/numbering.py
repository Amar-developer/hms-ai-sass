from sqlmodel import Session

from app.modules.settings.numbering import next_document_number


def next_invoice_number(
    session: Session,
    tenant_id: str,
    prefix: str | None = None,
    branch_id: str | None = None,
) -> str:
    return next_document_number(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        entity="invoice",
        prefix_override=prefix,
    )


def next_credit_note_number(session: Session, tenant_id: str) -> str:
    # Use the shared atomic document-sequence generator (row-locked) instead of
    # COUNT(*)+1, so concurrent refunds across invoices can't mint duplicate
    # credit-note numbers.
    return next_document_number(session, tenant_id=tenant_id, entity="credit_note")
