from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import (
    enforce_entitlement,
    require_branch_in_tenant,
    require_user_branch_access,
)
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.billing.models import (
    DiscountApproval,
    DiscountOffer,
    DoctorFeeRule,
    TaxRule,
)
from app.modules.billing.repositories import BillingReferenceRepository
from app.modules.billing.schemas import (
    DiscountApprovalCreate,
    DiscountApprovalDecision,
    DiscountOfferCreate,
    DiscountOfferUpdate,
    DoctorFeeRuleCreate,
    TaxRuleCreate,
    TaxRuleUpdate,
)
from app.modules.identity.models import User


def create_doctor_fee_rule(
    session: Session, *, tenant_id: str, payload: DoctorFeeRuleCreate, actor: User
) -> DoctorFeeRule:
    enforce_entitlement(session, tenant_id, "billing_basic", current_user=actor)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(actor, payload.branch_id)
    reference_repo = BillingReferenceRepository(session)
    if payload.practitioner_id:
        practitioner = reference_repo.get_practitioner(payload.practitioner_id)
        if (
            practitioner
            and practitioner.tenant_id == tenant_id
            and payload.department_id
        ):
            department_link = reference_repo.get_practitioner_department(
                practitioner_id=payload.practitioner_id,
                department_id=payload.department_id,
            )
            if (
                not department_link
                or department_link.tenant_id != tenant_id
                or not department_link.is_active
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Practitioner is not assigned to this department",
                )
    if (
        payload.share_type.value == "percentage"
        and payload.doctor_share_percentage is None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doctor_share_percentage is required for percentage share",
        )
    if payload.share_type.value == "fixed" and payload.doctor_fixed_amount is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doctor_fixed_amount is required for fixed share",
        )
    existing_rules = reference_repo.list_duplicate_fee_rules(
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        practitioner_id=payload.practitioner_id,
        appointment_type=payload.appointment_type,
        treatment_type=payload.treatment_type,
    )
    if any(
        existing.fee_amount == payload.fee_amount
        and existing.share_type == payload.share_type
        and existing.doctor_share_percentage == payload.doctor_share_percentage
        and existing.doctor_fixed_amount == payload.doctor_fixed_amount
        and existing.share_tax_with_doctor == payload.share_tax_with_doctor
        for existing in existing_rules
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An identical active doctor fee rule already exists",
        )
    for existing in existing_rules:
        existing.is_active = False
        session.add(existing)

    rule = DoctorFeeRule.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(rule)
    session.commit()
    session.refresh(rule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=rule.branch_id,
        actor_user_id=actor.id,
        action="doctor_fee_rule.created",
        resource_type="doctor_fee_rule",
        resource_id=rule.id,
        purpose="billing_configuration",
    )
    return rule


def list_doctor_fee_rules(
    session: Session, *, tenant_id: str, branch_id: str | None
) -> list[DoctorFeeRule]:
    return BillingReferenceRepository(session).list_fee_rules(
        tenant_id=tenant_id,
        branch_id=branch_id,
    )


def create_tax_rule(
    session: Session, *, tenant_id: str, payload: TaxRuleCreate, actor: User
) -> TaxRule:
    enforce_entitlement(session, tenant_id, "billing_basic")
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(actor, payload.branch_id)
    rule = TaxRule.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(rule)
    session.commit()
    session.refresh(rule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=rule.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="tax_rule.created",
        resource_type="tax_rule",
        resource_id=rule.id,
        purpose="billing_tax_configuration",
    )
    return rule


def list_tax_rules(
    session: Session, *, tenant_id: str, branch_id: str | None
) -> list[TaxRule]:
    return BillingReferenceRepository(session).list_tax_rules(
        tenant_id=tenant_id,
        branch_id=branch_id,
    )


def update_tax_rule(
    session: Session,
    *,
    tenant_id: str,
    rule_id: str,
    payload: TaxRuleUpdate,
    actor: User,
) -> TaxRule:
    enforce_entitlement(session, tenant_id, "billing_basic")
    rule = BillingReferenceRepository(session).get_tax_rule(rule_id)
    if not rule or rule.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tax rule not found"
        )
    if payload.branch_id:
        require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(actor, payload.branch_id or rule.branch_id)
    updates = payload.model_dump(exclude_unset=True)
    before = {key: getattr(rule, key) for key in updates}
    for key, value in updates.items():
        setattr(rule, key, value)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=rule.branch_id,
        actor_user_id=actor.id,
        action="tax_rule.updated",
        resource_type="tax_rule",
        resource_id=rule.id,
        purpose="billing_tax_configuration",
        changes=diff_changes(before, updates),
    )
    return rule


def create_discount_offer(
    session: Session, *, tenant_id: str, payload: DiscountOfferCreate, actor: User
) -> DiscountOffer:
    enforce_entitlement(session, tenant_id, "billing_basic")
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(actor, payload.branch_id)
    offer = DiscountOffer.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(offer)
    session.commit()
    session.refresh(offer)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=offer.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="discount_offer.created",
        resource_type="discount_offer",
        resource_id=offer.id,
        purpose="discount_offer_configuration",
    )
    return offer


def list_discount_offers(
    session: Session, *, tenant_id: str, branch_id: str | None
) -> list[DiscountOffer]:
    return BillingReferenceRepository(session).list_discount_offers(
        tenant_id=tenant_id,
        branch_id=branch_id,
    )


def update_discount_offer(
    session: Session,
    *,
    tenant_id: str,
    offer_id: str,
    payload: DiscountOfferUpdate,
    actor: User,
) -> DiscountOffer:
    enforce_entitlement(session, tenant_id, "billing_basic")
    offer = BillingReferenceRepository(session).get_discount_offer(offer_id)
    if not offer or offer.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Discount offer not found"
        )
    if payload.branch_id:
        require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(actor, payload.branch_id or offer.branch_id)
    updates = payload.model_dump(exclude_unset=True)
    before = {key: getattr(offer, key) for key in updates}
    for key, value in updates.items():
        setattr(offer, key, value)
    session.add(offer)
    session.commit()
    session.refresh(offer)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=offer.branch_id,
        actor_user_id=actor.id,
        action="discount_offer.updated",
        resource_type="discount_offer",
        resource_id=offer.id,
        purpose="discount_offer_configuration",
        changes=diff_changes(before, updates),
    )
    return offer


def request_discount_approval(
    session: Session, *, tenant_id: str, payload: DiscountApprovalCreate, actor: User
) -> DiscountApproval:
    enforce_entitlement(session, tenant_id, "billing_basic")
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(actor, payload.branch_id)
    approval = DiscountApproval.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(approval)
    session.commit()
    session.refresh(approval)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=approval.branch_id,
        actor_user_id=payload.requested_by_user_id,
        action="discount_approval.requested",
        resource_type="discount_approval",
        resource_id=approval.id,
        purpose="discount_control",
    )
    return approval


def decide_discount_approval(
    session: Session,
    *,
    tenant_id: str,
    approval_id: str,
    payload: DiscountApprovalDecision,
    actor: User,
) -> DiscountApproval:
    approval = session.get(DiscountApproval, approval_id)
    if not approval or approval.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Discount approval not found"
        )
    require_user_branch_access(actor, approval.branch_id)
    before = {
        "status": approval.status,
        "approved_by_user_id": approval.approved_by_user_id,
    }
    approval.status = payload.status
    approval.approved_by_user_id = payload.approved_by_user_id
    approval.decided_at = datetime.now(timezone.utc)
    session.add(approval)
    session.commit()
    session.refresh(approval)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=approval.branch_id,
        actor_user_id=payload.approved_by_user_id,
        action=f"discount_approval.{payload.status.value}",
        resource_type="discount_approval",
        resource_id=approval.id,
        purpose="discount_control",
        changes=diff_changes(
            before,
            {
                "status": approval.status,
                "approved_by_user_id": approval.approved_by_user_id,
            },
        ),
    )
    return approval
