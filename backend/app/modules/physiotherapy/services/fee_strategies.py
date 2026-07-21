from typing import Protocol

from sqlmodel import Session

from app.modules.billing.models import DoctorFeeRule, FeeShareType
from app.modules.physiotherapy.repositories import PhysiotherapyBillingRepository


class DoctorFeeShareStrategy(Protocol):
    """Computes a physiotherapist's share of a billed amount under a fee rule."""

    def share_for_amount(self, rule: DoctorFeeRule, amount: int) -> int: ...


class FixedFeeShareStrategy:
    """Doctor share is a flat amount, capped at the billed amount."""

    def share_for_amount(self, rule: DoctorFeeRule, amount: int) -> int:
        return min(rule.doctor_fixed_amount or 0, amount)


class PercentageFeeShareStrategy:
    """Doctor share is a percentage of the billed amount."""

    def share_for_amount(self, rule: DoctorFeeRule, amount: int) -> int:
        percentage = (
            rule.doctor_share_percentage
            if rule.doctor_share_percentage is not None
            else 0
        )
        return round(amount * percentage / 100)


_STRATEGIES_BY_SHARE_TYPE: dict[FeeShareType, DoctorFeeShareStrategy] = {
    FeeShareType.FIXED: FixedFeeShareStrategy(),
    FeeShareType.PERCENTAGE: PercentageFeeShareStrategy(),
}


class PhysiotherapistFeeResolver:
    """Resolves the applicable fee rule for a physiotherapist and computes their
    doctor share of a billed amount using the rule's fee-share strategy."""

    def __init__(self, session: Session):
        self.billing = PhysiotherapyBillingRepository(session)

    def resolve_fee_rule(
        self, tenant_id: str, branch_id: str, physiotherapist_id: str | None
    ) -> DoctorFeeRule | None:
        if not physiotherapist_id:
            return None
        rules = self.billing.list_physiotherapist_fee_rules(
            tenant_id=tenant_id, physiotherapist_id=physiotherapist_id
        )

        def score(rule: DoctorFeeRule) -> int:
            value = 0
            if rule.branch_id == branch_id:
                value += 4
            elif rule.branch_id is not None:
                value -= 100
            if rule.treatment_type == "physiotherapy_session":
                value += 10
            elif rule.treatment_type is not None:
                value -= 100
            return value

        eligible = [rule for rule in rules if score(rule) >= 0]
        if not eligible:
            return None
        return sorted(eligible, key=score, reverse=True)[0]

    def doctor_share_for_amount(self, rule: DoctorFeeRule | None, amount: int) -> int:
        if not rule or amount <= 0:
            return 0
        strategy = _STRATEGIES_BY_SHARE_TYPE.get(rule.share_type)
        if not strategy:
            return 0
        return strategy.share_for_amount(rule, amount)
