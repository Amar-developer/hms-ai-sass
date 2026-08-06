from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.appointments.models import Appointment, AppointmentType
from app.modules.billing.models import (
    DoctorFeeRule,
    DiscountOffer,
    DiscountType,
    FeeShareType,
    TaxRule,
)
from app.modules.billing.repositories.reference_repository import (
    BillingReferenceRepository,
)
from app.modules.billing.services.money import ZERO, money_value, percentage_amount


@dataclass(frozen=True)
class FeeCalculation:
    fee_rule: DoctorFeeRule
    consultation_amount: Decimal
    doctor_share_amount: Decimal
    clinic_share_amount: Decimal


def find_fee_rule(
    session: Session, appointment: Appointment, treatment_type: str | None = None
) -> DoctorFeeRule:
    """Selects the best-matching active doctor fee rule for an appointment."""

    def _rules_for(appointment_type: AppointmentType) -> list[DoctorFeeRule]:
        return BillingReferenceRepository(session).list_active_fee_rules(
            tenant_id=appointment.tenant_id,
            appointment_type=appointment_type,
        )

    rules = _rules_for(appointment.appointment_type)
    # Emergency visits are urgent OP consultations. When no emergency-specific
    # fee rule is configured, fall back to the standard OP fee so the visit can
    # still be invoiced instead of failing with "no fee rule".
    if not rules and appointment.appointment_type == AppointmentType.EMERGENCY:
        rules = _rules_for(AppointmentType.OP)
    if not rules:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active fee rule found for appointment type",
        )

    def score(rule: DoctorFeeRule) -> int:
        value = 0
        if rule.branch_id == appointment.branch_id:
            value += 4
        elif rule.branch_id is not None:
            value -= 100
        if rule.practitioner_id == appointment.practitioner_id:
            value += 8
        elif rule.practitioner_id is not None:
            value -= 100
        if rule.department_id == appointment.department_id:
            value += 6
        elif rule.department_id is not None:
            value -= 100
        if treatment_type and rule.treatment_type == treatment_type:
            value += 10
        elif rule.treatment_type is not None:
            value -= 100
        return value

    eligible = [rule for rule in rules if score(rule) >= 0]
    if not eligible:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No matching fee rule found for appointment context",
        )
    return sorted(eligible, key=score, reverse=True)[0]


def calculate_fee_split(
    fee_rule: DoctorFeeRule, amount: Decimal | int | None = None
) -> FeeCalculation:
    """Splits a billed amount between doctor and clinic per the fee rule's
    share type (fixed amount vs. percentage)."""
    fee = money_value(fee_rule.fee_amount if amount is None else amount)
    if fee_rule.share_type == FeeShareType.FIXED:
        doctor_share = min(fee_rule.doctor_fixed_amount or 0, fee)
    else:
        percentage = (
            fee_rule.doctor_share_percentage
            if fee_rule.doctor_share_percentage is not None
            else 0
        )
        doctor_share = percentage_amount(fee, percentage)
    clinic_share = fee - doctor_share
    return FeeCalculation(
        fee_rule=fee_rule,
        consultation_amount=fee,
        doctor_share_amount=doctor_share,
        clinic_share_amount=clinic_share,
    )


def _service_matches(rule_scope: str | None, service_scope: str) -> bool:
    return (rule_scope or "all") in {"all", service_scope}


def find_tax_rule(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    service_scope: str,
    tax_rule_id: str | None = None,
) -> TaxRule | None:
    """Selects the applicable tax rule for a service scope, either an
    explicitly chosen rule or the best-matching active rule."""
    if tax_rule_id:
        tax_rule = BillingReferenceRepository(session).get_tax_rule(tax_rule_id)
        if (
            tax_rule
            and tax_rule.tenant_id == tenant_id
            and tax_rule.is_active
            and tax_rule.branch_id in {None, branch_id}
            and _service_matches(tax_rule.service_scope, service_scope)
        ):
            return tax_rule
        return None

    rules = BillingReferenceRepository(session).list_active_tax_rules(
        tenant_id=tenant_id
    )
    matching_rules = [
        rule
        for rule in rules
        if rule.branch_id in {None, branch_id}
        and _service_matches(rule.service_scope, service_scope)
    ]
    if not matching_rules:
        return None
    matching_rules.sort(
        key=lambda rule: (
            rule.service_scope == service_scope,
            rule.branch_id == branch_id,
            rule.created_at,
        ),
        reverse=True,
    )
    return matching_rules[0]


def offer_discount_amount(offer: DiscountOffer, subtotal: Decimal) -> Decimal:
    """What an offer is worth against a subtotal, ignoring whether it is
    currently *eligible*. Use this to value an offer already attached to an
    invoice — a campaign ending must not retroactively erase a discount that
    was granted while it ran."""
    discount = (
        money_value(offer.value)
        if offer.discount_type == DiscountType.FIXED
        else percentage_amount(subtotal, offer.value)
    )
    if offer.max_discount_amount is not None:
        discount = min(discount, offer.max_discount_amount)
    return max(min(money_value(discount), subtotal), ZERO)


def _offer_discount_value(offer: DiscountOffer, subtotal: Decimal) -> Decimal:
    now = datetime.now(timezone.utc)
    valid_from = (
        offer.valid_from.replace(tzinfo=timezone.utc)
        if offer.valid_from and offer.valid_from.tzinfo is None
        else offer.valid_from
    )
    valid_until = (
        offer.valid_until.replace(tzinfo=timezone.utc)
        if offer.valid_until and offer.valid_until.tzinfo is None
        else offer.valid_until
    )
    if valid_from and valid_from > now:
        return ZERO
    if valid_until and valid_until < now:
        return ZERO
    if subtotal < offer.minimum_bill_amount:
        return ZERO
    return offer_discount_amount(offer, subtotal)


def calculate_offer_discount(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    service_scope: str,
    subtotal: Decimal | int,
    discount_offer_id: str | None,
) -> tuple[Decimal, DiscountOffer | None]:
    """Value a *chosen* offer against a subtotal.

    Offers are never applied on the clinic's behalf. Without an explicit
    ``discount_offer_id`` this returns no discount, even when an eligible
    offer exists — staff apply an offer deliberately from the invoice screen
    (see ``find_best_eligible_offer``), so the billed amount never drops
    without someone deciding it should.
    """
    subtotal = money_value(subtotal)
    if subtotal <= 0 or not discount_offer_id:
        return ZERO, None
    offer = BillingReferenceRepository(session).get_discount_offer(discount_offer_id)
    if (
        not offer
        or offer.tenant_id != tenant_id
        or not offer.is_active
        or not _service_matches(offer.service_scope, service_scope)
        or (offer.branch_id and offer.branch_id != branch_id)
    ):
        return ZERO, None
    discount = _offer_discount_value(offer, subtotal)
    return (discount, offer) if discount > 0 else (ZERO, None)


def list_eligible_offers(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    service_scope: str,
    subtotal: Decimal | int,
) -> list[tuple[Decimal, DiscountOffer]]:
    """Every active offer that would produce a discount, best value first."""
    subtotal = money_value(subtotal)
    if subtotal <= 0:
        return []
    eligible: list[tuple[Decimal, DiscountOffer]] = []
    for offer in BillingReferenceRepository(session).list_active_discount_offers(
        tenant_id=tenant_id
    ):
        if not _service_matches(offer.service_scope, service_scope):
            continue
        if offer.branch_id and offer.branch_id != branch_id:
            continue
        discount = _offer_discount_value(offer, subtotal)
        if discount > 0:
            eligible.append((discount, offer))
    eligible.sort(key=lambda pair: (pair[0], pair[1].created_at), reverse=True)
    return eligible


def find_best_eligible_offer(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    service_scope: str,
    subtotal: Decimal | int,
) -> tuple[Decimal, DiscountOffer | None]:
    """The highest-value offer staff could apply, for suggestion only."""
    eligible = list_eligible_offers(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        service_scope=service_scope,
        subtotal=subtotal,
    )
    return eligible[0] if eligible else (ZERO, None)
