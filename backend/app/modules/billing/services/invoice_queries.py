from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import (
    enforce_entitlement,
    require_user_branch_access,
    scoped_branch_id,
)
from app.modules.billing.repositories.read_repository import BillingReadRepository
from app.modules.billing.schemas import InvoiceDetailRead, InvoiceRead
from app.modules.billing.services.ledger import read_invoice_detail_full
from app.modules.billing.services.read_models import (
    invoice_reads,
)
from app.modules.identity.models import User


def list_billing_invoices(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    patient_id: str | None,
    current_user: User,
) -> list[InvoiceRead]:
    enforce_entitlement(session, tenant_id, "billing_basic")
    scoped_branch = scoped_branch_id(current_user, branch_id)
    invoices = BillingReadRepository(session).list_invoices(
        tenant_id=tenant_id,
        branch_id=scoped_branch,
        patient_id=patient_id,
    )
    # Status is maintained by payment/refund/cancellation commands. List reads
    # must stay read-only and batch related display data instead of repairing
    # every invoice with per-row queries and commits.
    return invoice_reads(session, invoices)


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
