from sqlmodel import Session

from app.modules.billing.schemas import InvoiceDetailRead
from app.modules.identity.models import User
from app.modules.ip.models import IPBillingItem, IPCharge
from app.modules.ip.repositories import IPBillingRepository
from app.modules.ip.services.billing import invoice_detail
from app.modules.ip.services.validation import assert_ip_enabled, get_admission


def list_ip_charges(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    current_user: User,
) -> list[IPCharge]:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    return IPBillingRepository(session).list_charges(
        tenant_id=tenant_id,
        admission_id=admission.id,
    )


def list_ip_billing_items(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    current_user: User,
) -> list[IPBillingItem]:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    return IPBillingRepository(session).list_billing_items(
        tenant_id=tenant_id,
        admission_id=admission.id,
    )


def get_ip_invoice_detail(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    current_user: User,
) -> InvoiceDetailRead | None:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    invoice = IPBillingRepository(session).get_invoice_for_admission(
        tenant_id=tenant_id,
        admission_id=admission.id,
    )
    if not invoice:
        return None
    return invoice_detail(session, invoice)
