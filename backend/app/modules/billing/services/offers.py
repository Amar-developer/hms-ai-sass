"""Manual (staff-initiated) promotional offers on an invoice.

Offers are never applied automatically. An invoice is *scanned* for eligible
offers so the billing screen can suggest the best one, but the invoice total
only changes when a user applies it, and the offer can be removed again until
a payment is recorded. This mirrors how patient membership benefits already
behave (see ``membership.py``).
"""

from collections.abc import Callable
from decimal import Decimal

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import enforce_entitlement, require_user_branch_access
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.billing.models import DiscountOffer, Invoice, InvoiceStatus
from app.modules.billing.repositories.adjustment_repository import (
    BillingAdjustmentRepository,
)
from app.modules.billing.repositories.invoice_support_repository import (
    BillingInvoiceSupportRepository,
)
from app.modules.billing.repositories.reference_repository import (
    BillingReferenceRepository,
)
from app.modules.billing.schemas import InvoiceDetailRead, InvoiceOfferBenefitRead
from app.modules.billing.services.discount_policy import (
    MEMBERSHIP_DISCOUNT_CONFLICT_DETAIL,
    compose_invoice_discounts,
    invoice_has_applied_membership_benefit,
    invoice_service_scope,
)
from app.modules.billing.services.invoice_status import update_invoice_payment_status
from app.modules.billing.services.line_discounts import sync_invoice_item_discounts
from app.modules.billing.services.money import ZERO, money_value, percentage_amount
from app.modules.billing.services.rules import (
    calculate_fee_split,
    calculate_offer_discount,
    find_best_eligible_offer,
    find_tax_rule,
    list_eligible_offers,
    offer_discount_amount,
)
from app.modules.identity.models import User

InvoiceDetailReader = Callable[[Session, Invoice], InvoiceDetailRead]
LedgerRecorder = Callable[..., object]

OFFER_AMOUNT_FIELDS = (
    "status",
    "discount_amount",
    "discount_offer_id",
    "taxable_amount",
    "tax_amount",
    "total_amount",
    "balance_amount",
    "doctor_share_amount",
    "clinic_share_amount",
)


def _attached_offer(session: Session, invoice: Invoice) -> DiscountOffer | None:
    if not invoice.discount_offer_id:
        return None
    offer = BillingReferenceRepository(session).get_discount_offer(
        invoice.discount_offer_id
    )
    return offer if offer and offer.tenant_id == invoice.tenant_id else None


def _current_offer_discount(session: Session, invoice: Invoice) -> Decimal:
    """How much of the invoice's discount comes from its applied offer.

    Valued without re-checking eligibility: an offer that has since expired or
    been deactivated is still owed to a patient it was already granted to, and
    treating it as zero would silently re-bill them for it.
    """
    offer = _attached_offer(session, invoice)
    if not offer:
        return ZERO
    return offer_discount_amount(offer, money_value(invoice.subtotal_amount))


def _approved_discount(session: Session, invoice: Invoice) -> Decimal:
    """The request-approved portion, i.e. everything that is not membership
    or offer. Recomputed rather than stored so applying and removing an offer
    never erodes an admin-approved discount."""
    return max(
        money_value(invoice.discount_amount)
        - min(
            money_value(invoice.membership_discount_amount),
            money_value(invoice.subtotal_amount),
        )
        - _current_offer_discount(session, invoice),
        ZERO,
    )


def _blocking_reason(invoice: Invoice) -> str | None:
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        return f"Cannot change offers on a {invoice.status.value} invoice"
    if money_value(invoice.paid_amount) > 0:
        return "Cannot change offers after a payment is recorded"
    if invoice_has_applied_membership_benefit(invoice):
        return MEMBERSHIP_DISCOUNT_CONFLICT_DETAIL
    return None


def invoice_offer_benefit(
    session: Session, invoice: Invoice
) -> InvoiceOfferBenefitRead:
    """Describe the offer state of an invoice: applied, or what staff could
    apply. Never mutates the invoice."""
    subtotal = money_value(invoice.subtotal_amount)
    blocked = _blocking_reason(invoice)
    applied_amount = _current_offer_discount(session, invoice)
    if applied_amount > 0:
        offer = _attached_offer(session, invoice)
        return InvoiceOfferBenefitRead(
            is_applied=True,
            can_apply=False,
            # An applied offer stays removable until money is collected.
            can_remove=money_value(invoice.paid_amount) <= 0
            and invoice.status not in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED},
            offer_id=invoice.discount_offer_id,
            offer_name=offer.name if offer else None,
            offer_code=offer.code if offer else None,
            discount_type=offer.discount_type if offer else None,
            discount_value=money_value(offer.value) if offer else ZERO,
            discount_amount=applied_amount,
            payable_amount=max(subtotal - applied_amount, ZERO),
            reason="Offer applied",
        )
    if blocked:
        return InvoiceOfferBenefitRead(
            payable_amount=subtotal,
            reason=blocked,
        )
    eligible = list_eligible_offers(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        service_scope=invoice_service_scope(invoice),
        subtotal=subtotal,
    )
    if not eligible:
        return InvoiceOfferBenefitRead(
            payable_amount=subtotal,
            reason="No eligible offer for this invoice",
        )
    discount, offer = eligible[0]
    return InvoiceOfferBenefitRead(
        is_applied=False,
        can_apply=True,
        eligible_count=len(eligible),
        offer_id=offer.id,
        offer_name=offer.name,
        offer_code=offer.code,
        discount_type=offer.discount_type,
        discount_value=money_value(offer.value),
        discount_amount=discount,
        payable_amount=max(subtotal - discount, ZERO),
        reason=f"{len(eligible)} eligible offer{'s' if len(eligible) > 1 else ''}",
    )


def _resolve_offer(
    session: Session,
    invoice: Invoice,
    *,
    discount_offer_id: str | None,
    code: str | None,
) -> tuple[Decimal, DiscountOffer]:
    """Pick the offer to apply: the one named, the one matching the entered
    code, or the best eligible one when the caller named neither."""
    scope = invoice_service_scope(invoice)
    subtotal = money_value(invoice.subtotal_amount)
    if discount_offer_id:
        discount, offer = calculate_offer_discount(
            session,
            tenant_id=invoice.tenant_id,
            branch_id=invoice.branch_id,
            service_scope=scope,
            subtotal=subtotal,
            discount_offer_id=discount_offer_id,
        )
        if not offer or discount <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This offer is not valid for this invoice",
            )
        return discount, offer
    eligible = list_eligible_offers(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        service_scope=scope,
        subtotal=subtotal,
    )
    if code:
        wanted = code.strip().casefold()
        for discount, offer in eligible:
            if (offer.code or "").strip().casefold() == wanted:
                return discount, offer
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No valid offer found for this code",
        )
    if not eligible:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No eligible offer for this invoice",
        )
    return eligible[0]


def _recompute_invoice_totals(
    session: Session,
    invoice: Invoice,
    *,
    offer_discount: Decimal,
    approved_discount: Decimal,
) -> None:
    """Rebuild gross -> discount -> taxable -> tax -> total for a changed
    offer amount, leaving the invoice's own items and subtotal intact.

    ``approved_discount`` must be measured by the caller *before* the offer
    reference is changed — once it has, the old offer's value can no longer be
    told apart from an admin-approved discount.
    """
    subtotal = money_value(invoice.subtotal_amount)
    composition = compose_invoice_discounts(
        subtotal=subtotal,
        membership_discount=invoice.membership_discount_amount,
        approved_discount=approved_discount,
        offer_discount=offer_discount,
    )
    taxable = max(subtotal - composition.total, ZERO)
    tax_rule = find_tax_rule(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        service_scope=invoice_service_scope(invoice),
        tax_rule_id=invoice.tax_rule_id,
    )
    tax_amount = percentage_amount(taxable, tax_rule.tax_percentage if tax_rule else 0)
    total = taxable + tax_amount

    fee_rule = (
        BillingAdjustmentRepository(session).get_fee_rule(invoice.fee_rule_id)
        if invoice.fee_rule_id
        else None
    )
    if fee_rule and subtotal > 0:
        # Consultation invoices split by the doctor's fee rule, so the share
        # is re-derived from the rule rather than scaled.
        split = calculate_fee_split(fee_rule, subtotal)
        share_basis = total if fee_rule.share_tax_with_doctor else taxable
        doctor_share = money_value(split.doctor_share_amount * share_basis / subtotal)
    else:
        old_total = money_value(invoice.total_amount)
        doctor_share = (
            money_value(money_value(invoice.doctor_share_amount) * total / old_total)
            if old_total > 0
            else ZERO
        )

    invoice.discount_amount = composition.total
    invoice.taxable_amount = taxable
    invoice.tax_amount = tax_amount
    invoice.tax_rule_id = tax_rule.id if tax_rule else invoice.tax_rule_id
    invoice.total_amount = total
    invoice.balance_amount = max(total - money_value(invoice.paid_amount), ZERO)
    invoice.doctor_share_amount = min(doctor_share, total)
    invoice.clinic_share_amount = max(total - invoice.doctor_share_amount, ZERO)


def apply_invoice_offer(
    session: Session,
    invoice: Invoice,
    *,
    discount_offer_id: str | None = None,
    code: str | None = None,
) -> tuple[Invoice, DiscountOffer, Decimal]:
    blocked = _blocking_reason(invoice)
    if blocked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=blocked)
    if _current_offer_discount(session, invoice) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An offer is already applied — remove it before applying another",
        )
    discount, offer = _resolve_offer(
        session, invoice, discount_offer_id=discount_offer_id, code=code
    )
    old_total = money_value(invoice.total_amount)
    approved = _approved_discount(session, invoice)
    invoice.discount_offer_id = offer.id
    _recompute_invoice_totals(
        session, invoice, offer_discount=discount, approved_discount=approved
    )
    applied = max(old_total - money_value(invoice.total_amount), ZERO)
    session.add(invoice)
    sync_invoice_item_discounts(session, invoice)
    session.commit()
    session.refresh(invoice)
    return update_invoice_payment_status(session, invoice), offer, applied


def remove_invoice_offer(session: Session, invoice: Invoice) -> tuple[Invoice, Decimal]:
    if not invoice.discount_offer_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No offer is applied to this invoice",
        )
    if money_value(invoice.paid_amount) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot remove an offer after a payment is recorded",
        )
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot change offers on a {invoice.status.value} invoice",
        )
    old_total = money_value(invoice.total_amount)
    # Measure the admin-approved portion while the offer is still attached —
    # afterwards the two are indistinguishable inside discount_amount.
    approved = _approved_discount(session, invoice)
    invoice.discount_offer_id = None
    _recompute_invoice_totals(
        session, invoice, offer_discount=ZERO, approved_discount=approved
    )
    restored = max(money_value(invoice.total_amount) - old_total, ZERO)
    session.add(invoice)
    sync_invoice_item_discounts(session, invoice)
    session.commit()
    session.refresh(invoice)
    return update_invoice_payment_status(session, invoice), restored


def _load_invoice(session: Session, *, tenant_id: str, invoice_id: str) -> Invoice:
    invoice = BillingInvoiceSupportRepository(session).get_invoice_for_tenant(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    return invoice


def apply_offer_to_invoice(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    current_user: User,
    discount_offer_id: str | None,
    code: str | None,
    record_billing_ledger: LedgerRecorder,
    read_invoice_detail: InvoiceDetailReader,
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = _load_invoice(session, tenant_id=tenant_id, invoice_id=invoice_id)
    require_user_branch_access(current_user, invoice.branch_id)
    before = {key: getattr(invoice, key) for key in OFFER_AMOUNT_FIELDS}
    invoice, offer, applied = apply_invoice_offer(
        session, invoice, discount_offer_id=discount_offer_id, code=code
    )
    record_billing_ledger(
        session,
        invoice,
        entry_type="invoice_offer_applied",
        description=f"Offer applied ({offer.name})",
        credit_amount=applied,
        invoice_total_delta=-applied,
        balance_amount_delta=-applied,
        reason=f"Offer {offer.name}"
        + (f" ({offer.code})" if offer.code else "")
        + " applied by staff",
        actor_user_id=current_user.id,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=current_user.id,
        action="invoice.offer_applied",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing",
        changes=diff_changes(
            before, {key: getattr(invoice, key) for key in OFFER_AMOUNT_FIELDS}
        ),
    )
    return read_invoice_detail(session, invoice)


def remove_offer_from_invoice(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    current_user: User,
    record_billing_ledger: LedgerRecorder,
    read_invoice_detail: InvoiceDetailReader,
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = _load_invoice(session, tenant_id=tenant_id, invoice_id=invoice_id)
    require_user_branch_access(current_user, invoice.branch_id)
    before = {key: getattr(invoice, key) for key in OFFER_AMOUNT_FIELDS}
    offer_name = None
    if invoice.discount_offer_id:
        offer = BillingReferenceRepository(session).get_discount_offer(
            invoice.discount_offer_id
        )
        offer_name = offer.name if offer else None
    invoice, restored = remove_invoice_offer(session, invoice)
    record_billing_ledger(
        session,
        invoice,
        entry_type="invoice_offer_removed",
        description=f"Offer removed ({offer_name})" if offer_name else "Offer removed",
        debit_amount=restored,
        invoice_total_delta=restored,
        balance_amount_delta=restored,
        reason="Offer removed by staff",
        actor_user_id=current_user.id,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=current_user.id,
        action="invoice.offer_removed",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing",
        changes=diff_changes(
            before, {key: getattr(invoice, key) for key in OFFER_AMOUNT_FIELDS}
        ),
    )
    return read_invoice_detail(session, invoice)


__all__ = [
    "apply_invoice_offer",
    "apply_offer_to_invoice",
    "find_best_eligible_offer",
    "invoice_offer_benefit",
    "remove_invoice_offer",
    "remove_offer_from_invoice",
]
