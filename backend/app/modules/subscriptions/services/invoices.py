from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.audit.service import record_audit_event
from app.modules.identity.models import User
from app.modules.subscriptions.models import (
    CreditStatus,
    SubscriptionCredit,
    SubscriptionInvoice,
    SubscriptionInvoiceStatus,
)
from app.modules.subscriptions.repositories import (
    SubscriptionCreditRepository,
    SubscriptionInvoiceRepository,
    SubscriptionTenantRepository,
)
from app.modules.subscriptions.schemas import (
    SubscriptionCreditCreate,
    SubscriptionInvoiceCreate,
    SubscriptionInvoiceFailureCreate,
    SubscriptionInvoiceRead,
    SubscriptionInvoiceSettlementCreate,
)
from app.modules.subscriptions.services.read_models import read_invoice
from app.modules.tenants.models import now_utc


def next_subscription_invoice_number(session: Session) -> str:
    return SubscriptionInvoiceRepository(session).next_invoice_number()


def purchase_subscription_credit(
    session: Session,
    *,
    tenant_id: str,
    payload: SubscriptionCreditCreate,
    actor: User,
) -> SubscriptionCredit:
    target_tenant_id = payload.tenant_id or tenant_id
    if target_tenant_id != tenant_id and not actor.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied"
        )
    tenant = SubscriptionTenantRepository(session).get(target_tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    credit = SubscriptionCredit.model_validate(
        payload,
        update={
            "tenant_id": target_tenant_id,
            "status": CreditStatus.ACTIVE,
            "created_by_user_id": actor.id,
            "updated_by_user_id": actor.id,
        },
    )
    credits = SubscriptionCreditRepository(session)
    invoices = SubscriptionInvoiceRepository(session)
    credits.add(credit)
    session.commit()
    session.refresh(credit)
    invoice = SubscriptionInvoice(
        tenant_id=target_tenant_id,
        credit_id=credit.id,
        invoice_number=invoices.next_invoice_number(),
        description=f"Additional credit: {credit.quantity} {credit.credit_type}",
        amount=credit.amount,
        taxable_amount=credit.amount,
        total_amount=credit.amount,
        balance_amount=credit.amount,
        due_on=credit.starts_on,
        created_by_user_id=actor.id,
        updated_by_user_id=actor.id,
    )
    invoices.add(invoice)
    session.commit()
    record_audit_event(
        session,
        tenant_id=target_tenant_id,
        actor_user_id=actor.id,
        action="subscription_credit.purchased",
        resource_type="subscription_credit",
        resource_id=credit.id,
        purpose="saas_subscription_management",
    )
    return credit


def list_subscription_credits(
    session: Session, *, tenant_id: str
) -> list[SubscriptionCredit]:
    return SubscriptionCreditRepository(session).list_for_tenant(tenant_id)


def create_subscription_invoice(
    session: Session,
    *,
    tenant_id: str,
    payload: SubscriptionInvoiceCreate,
    actor: User,
) -> SubscriptionInvoiceRead:
    target_tenant_id = payload.tenant_id or tenant_id
    total_amount = payload.amount + payload.tax_amount
    invoice = SubscriptionInvoice.model_validate(
        payload,
        update={
            "tenant_id": target_tenant_id,
            "invoice_number": next_subscription_invoice_number(session),
            "taxable_amount": payload.amount,
            "total_amount": total_amount,
            "balance_amount": total_amount,
            "created_by_user_id": actor.id,
            "updated_by_user_id": actor.id,
        },
    )
    SubscriptionInvoiceRepository(session).add(invoice)
    session.commit()
    session.refresh(invoice)
    record_audit_event(
        session,
        tenant_id=target_tenant_id,
        actor_user_id=actor.id,
        action="subscription_invoice.created",
        resource_type="subscription_invoice",
        resource_id=invoice.id,
        purpose="saas_revenue_management",
    )
    return read_invoice(invoice)


def list_subscription_invoices(
    session: Session, *, tenant_id: str
) -> list[SubscriptionInvoiceRead]:
    invoices = SubscriptionInvoiceRepository(session).list_for_tenant(tenant_id)
    return [read_invoice(invoice) for invoice in invoices]


def get_invoice_or_404(
    session: Session, *, tenant_id: str, invoice_id: str, actor: User
) -> SubscriptionInvoice:
    invoice = SubscriptionInvoiceRepository(session).get(invoice_id)
    if not invoice or (invoice.tenant_id != tenant_id and not actor.is_super_admin):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription invoice not found",
        )
    return invoice


def settle_subscription_invoice(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    payload: SubscriptionInvoiceSettlementCreate,
    actor: User,
) -> SubscriptionInvoiceRead:
    invoice = get_invoice_or_404(
        session, tenant_id=tenant_id, invoice_id=invoice_id, actor=actor
    )
    paid_total = min(
        (invoice.paid_amount or 0) + payload.amount,
        invoice.total_amount or invoice.amount,
    )
    invoice.paid_amount = paid_total
    invoice.balance_amount = max(
        (invoice.total_amount or invoice.amount) - paid_total, 0
    )
    invoice.payment_method = payload.payment_method
    invoice.payment_reference = payload.payment_reference
    invoice.gateway_transaction_id = payload.gateway_transaction_id
    invoice.gateway_status = payload.gateway_status
    invoice.last_payment_attempt_at = now_utc()
    if invoice.balance_amount == 0:
        invoice.status = SubscriptionInvoiceStatus.PAID
        invoice.paid_on = date.today()
    invoice.updated_by_user_id = actor.id
    invoice.updated_at = now_utc()
    SubscriptionInvoiceRepository(session).add(invoice)
    session.commit()
    session.refresh(invoice)
    record_audit_event(
        session,
        tenant_id=invoice.tenant_id,
        actor_user_id=actor.id,
        action="subscription_invoice.payment_settled",
        resource_type="subscription_invoice",
        resource_id=invoice.id,
        purpose="saas_revenue_collection",
    )
    return read_invoice(invoice)


def mark_subscription_payment_failed(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    payload: SubscriptionInvoiceFailureCreate,
    actor: User,
) -> SubscriptionInvoiceRead:
    invoice = get_invoice_or_404(
        session, tenant_id=tenant_id, invoice_id=invoice_id, actor=actor
    )
    invoice.gateway_transaction_id = payload.gateway_transaction_id
    invoice.gateway_status = payload.gateway_status
    invoice.failed_reason = payload.failed_reason
    invoice.last_payment_attempt_at = now_utc()
    invoice.updated_by_user_id = actor.id
    invoice.updated_at = now_utc()
    SubscriptionInvoiceRepository(session).add(invoice)
    session.commit()
    session.refresh(invoice)
    record_audit_event(
        session,
        tenant_id=invoice.tenant_id,
        actor_user_id=actor.id,
        action="subscription_invoice.payment_failed",
        resource_type="subscription_invoice",
        resource_id=invoice.id,
        purpose="saas_failed_payment_recovery",
    )
    return read_invoice(invoice)
