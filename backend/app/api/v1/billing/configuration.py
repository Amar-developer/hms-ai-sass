from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.billing.models import (
    DiscountApproval,
    DiscountOffer,
    DoctorFeeRule,
    TaxRule,
)
from app.modules.billing.schemas import (
    DiscountApprovalCreate,
    DiscountApprovalDecision,
    DiscountApprovalRead,
    DiscountOfferCreate,
    DiscountOfferRead,
    DiscountOfferUpdate,
    DoctorFeeRuleCreate,
    DoctorFeeRuleRead,
    TaxRuleCreate,
    TaxRuleRead,
    TaxRuleUpdate,
)
from app.modules.billing.services.configuration import (
    create_discount_offer,
    create_doctor_fee_rule,
    create_tax_rule,
    decide_discount_approval,
    list_accessible_discount_offers,
    list_accessible_doctor_fee_rules,
    list_accessible_tax_rules,
    request_discount_approval,
    update_discount_offer,
    update_tax_rule,
)
from app.modules.identity import permissions
from app.modules.identity.models import User

router = APIRouter(prefix="/billing")


@router.post(
    "/doctor-fee-rules",
    response_model=DoctorFeeRuleRead,
    status_code=status.HTTP_201_CREATED,
)
def create_doctor_fee_rule_endpoint(
    payload: DoctorFeeRuleCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_CREATE,
            permissions.PRACTITIONERS_EDIT,
        )
    ),
) -> DoctorFeeRule:
    return create_doctor_fee_rule(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/doctor-fee-rules", response_model=list[DoctorFeeRuleRead])
def list_doctor_fee_rules_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_READ,
            permissions.PRACTITIONERS_EDIT,
            permissions.PHYSIOTHERAPY_READ,
            permissions.PHYSIOTHERAPY_EDIT,
        )
    ),
) -> list[DoctorFeeRule]:
    return list_accessible_doctor_fee_rules(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        actor=current_user,
    )


@router.post(
    "/tax-rules", response_model=TaxRuleRead, status_code=status.HTTP_201_CREATED
)
def create_tax_rule_endpoint(
    payload: TaxRuleCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.TAX_MANAGE, permissions.TAX_CREATE, permissions.BILLING_MANAGE
        )
    ),
) -> TaxRule:
    return create_tax_rule(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/tax-rules", response_model=list[TaxRuleRead])
def list_tax_rules_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.TAX_MANAGE, permissions.TAX_READ, permissions.BILLING_MANAGE
        )
    ),
) -> list[TaxRule]:
    return list_accessible_tax_rules(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        actor=current_user,
    )


@router.patch("/tax-rules/{rule_id}", response_model=TaxRuleRead)
def update_tax_rule_endpoint(
    rule_id: str,
    payload: TaxRuleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.TAX_MANAGE, permissions.TAX_EDIT, permissions.BILLING_MANAGE
        )
    ),
) -> TaxRule:
    return update_tax_rule(
        session,
        tenant_id=tenant_id,
        rule_id=rule_id,
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/discount-offers",
    response_model=DiscountOfferRead,
    status_code=status.HTTP_201_CREATED,
)
def create_discount_offer_endpoint(
    payload: DiscountOfferCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.DISCOUNTS_MANAGE,
            permissions.DISCOUNTS_CREATE,
            permissions.BILLING_MANAGE,
        )
    ),
) -> DiscountOffer:
    return create_discount_offer(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/discount-offers", response_model=list[DiscountOfferRead])
def list_discount_offers_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.DISCOUNTS_MANAGE,
            permissions.DISCOUNTS_READ,
            permissions.BILLING_MANAGE,
        )
    ),
) -> list[DiscountOffer]:
    return list_accessible_discount_offers(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        actor=current_user,
    )


@router.patch("/discount-offers/{offer_id}", response_model=DiscountOfferRead)
def update_discount_offer_endpoint(
    offer_id: str,
    payload: DiscountOfferUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.DISCOUNTS_MANAGE,
            permissions.DISCOUNTS_EDIT,
            permissions.BILLING_MANAGE,
        )
    ),
) -> DiscountOffer:
    return update_discount_offer(
        session,
        tenant_id=tenant_id,
        offer_id=offer_id,
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/discount-approvals",
    response_model=DiscountApprovalRead,
    status_code=status.HTTP_201_CREATED,
)
def request_discount_approval_endpoint(
    payload: DiscountApprovalCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DiscountApproval:
    return request_discount_approval(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.post(
    "/discount-approvals/{approval_id}/decision", response_model=DiscountApprovalRead
)
def decide_discount_approval_endpoint(
    approval_id: str,
    payload: DiscountApprovalDecision,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DiscountApproval:
    return decide_discount_approval(
        session,
        tenant_id=tenant_id,
        approval_id=approval_id,
        payload=payload,
        actor=current_user,
    )
