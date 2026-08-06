from collections.abc import Iterable

from sqlmodel import Session, select

from app.modules.billing.models import Invoice, InvoiceStatus


def active_lab_invoice_reference_map(
    session: Session,
    *,
    tenant_id: str,
    lab_order_ids: Iterable[str],
) -> dict[str, str]:
    """Return the newest active invoice for each requested lab order."""
    normalized_ids = {order_id for order_id in lab_order_ids if order_id}
    if not normalized_ids:
        return {}

    rows = session.exec(
        select(Invoice.lab_order_id, Invoice.id)
        .where(
            Invoice.tenant_id == tenant_id,
            Invoice.lab_order_id.in_(normalized_ids),
            Invoice.status.notin_([InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]),
        )
        .order_by(Invoice.created_at.desc())
    ).all()
    references: dict[str, str] = {}
    for lab_order_id, invoice_id in rows:
        if lab_order_id:
            references.setdefault(lab_order_id, invoice_id)
    return references
