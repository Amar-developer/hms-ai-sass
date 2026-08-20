from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.list_filters import ListFilter, ListFilterOption, ListSort
from app.core.access_control import (
    enforce_entitlement,
    require_user_branch_access,
    scoped_branch_id,
)
from app.core.pagination import Page
from app.modules.billing.repositories.read_repository import BillingReadRepository
from app.modules.billing.schemas import (
    InvoiceDetailRead,
    InvoiceRead,
    PendingConsultationInvoiceRead,
)
from app.modules.billing.services.ledger import read_invoice_detail_full
from app.modules.billing.services.read_models import (
    invoice_reads,
)
from app.modules.identity.models import User


def list_pending_consultation_invoice_page(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    offset: int,
    limit: int,
    current_user: User,
) -> Page[PendingConsultationInvoiceRead]:
    """Return the authoritative queue of signed, not-yet-invoiced consultations."""

    enforce_entitlement(session, tenant_id, "billing_basic")
    scoped_branch = scoped_branch_id(current_user, branch_id)
    repository = BillingReadRepository(session)
    rows = repository.list_pending_consultation_invoices(
        tenant_id=tenant_id,
        branch_id=scoped_branch,
        offset=offset,
        limit=limit,
    )
    items = [
        PendingConsultationInvoiceRead(
            consultation_id=row[0],
            appointment_id=row[1],
            branch_id=row[2],
            patient_id=row[3],
            patient_name=row[4],
            practitioner_id=row[5],
            practitioner_name=row[6],
            token_number=row[7],
            appointment_date=row[8],
            appointment_time=row[9],
            consultation_signed_at=row[10],
            consultation_created_at=row[11],
        )
        for row in rows
    ]
    total = repository.count_pending_consultation_invoices(
        tenant_id=tenant_id,
        branch_id=scoped_branch,
    )
    return Page(items=items, total=total, limit=limit, offset=offset)


def list_billing_invoices(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    patient_id: str | None,
    q: str | None = None,
    source: str | None = None,
    payment_state: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    list_filters: list[ListFilter] | None = None,
    list_sort: ListSort | None = None,
    limit: int | None = None,
    current_user: User,
    offset: int = 0,
) -> list[InvoiceRead]:
    enforce_entitlement(session, tenant_id, "billing_basic")
    scoped_branch = scoped_branch_id(current_user, branch_id)
    invoices = BillingReadRepository(session).list_invoices(
        tenant_id=tenant_id,
        branch_id=scoped_branch,
        patient_id=patient_id,
        q=q,
        source=source,
        payment_state=payment_state,
        from_date=from_date,
        to_date=to_date,
        list_filters=list_filters,
        list_sort=list_sort,
        offset=offset,
        limit=limit,
    )
    # Status is maintained by payment/refund/cancellation commands. List reads
    # must stay read-only and batch related display data instead of repairing
    # every invoice with per-row queries and commits.
    return invoice_reads(session, invoices)


def list_billing_invoice_page(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    patient_id: str | None,
    q: str | None,
    source: str | None,
    payment_state: str | None,
    from_date: date | None,
    to_date: date | None,
    list_filters: list[ListFilter],
    list_sort: ListSort | None,
    offset: int,
    limit: int,
    current_user: User,
) -> Page[InvoiceRead]:
    items = list_billing_invoices(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        q=q,
        source=source,
        payment_state=payment_state,
        from_date=from_date,
        to_date=to_date,
        list_filters=list_filters,
        list_sort=list_sort,
        offset=offset,
        limit=limit,
        current_user=current_user,
    )
    scoped_branch = scoped_branch_id(current_user, branch_id)
    total = BillingReadRepository(session).count_invoices(
        tenant_id=tenant_id,
        branch_id=scoped_branch,
        patient_id=patient_id,
        q=q,
        source=source,
        payment_state=payment_state,
        from_date=from_date,
        to_date=to_date,
        list_filters=list_filters,
    )
    return Page(items=items, total=total, limit=limit, offset=offset)


def list_billing_invoice_filter_options(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    patient_id: str | None,
    current_user: User,
) -> dict[str, list[ListFilterOption]]:
    enforce_entitlement(session, tenant_id, "billing_basic")
    scoped_branch = scoped_branch_id(current_user, branch_id)
    return BillingReadRepository(session).invoice_filter_options(
        tenant_id=tenant_id,
        branch_id=scoped_branch,
        patient_id=patient_id,
    )


def get_billing_invoice_detail(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    current_user: User,
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = BillingReadRepository(session).get_invoice_for_tenant(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    return read_invoice_detail_full(session, invoice)
