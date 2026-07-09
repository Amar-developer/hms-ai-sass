from sqlmodel import Session

from app.core.access_control import (
    enforce_entitlement,
    require_branch_in_tenant,
    require_user_branch_access,
)
from app.modules.identity.models import User
from app.modules.patient_subscriptions.schemas import (
    PatientBenefitPreviewRead,
    PatientBenefitPreviewRequest,
)
from app.modules.patient_subscriptions.services.benefits import benefit_preview
from app.modules.patient_subscriptions.services.eligibility import (
    active_patient_enrollment,
)
from app.modules.patient_subscriptions.services.usage_sync import (
    sync_free_item_usage_from_invoices,
)


def preview_benefits(
    session: Session,
    *,
    tenant_id: str,
    payload: PatientBenefitPreviewRequest,
    actor: User,
) -> PatientBenefitPreviewRead:
    enforce_entitlement(session, tenant_id, "patient_subscriptions", current_user=actor)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(actor, payload.branch_id)
    active = active_patient_enrollment(
        session,
        tenant_id=tenant_id,
        patient_id=payload.patient_id,
    )
    if not active:
        return PatientBenefitPreviewRead(
            has_active_subscription=False,
            service_type=payload.service_type,
            subtotal_amount=payload.subtotal_amount,
            discount_amount=0,
            payable_amount=payload.subtotal_amount,
            reason="No active patient subscription",
        )
    enrollment, plan = active
    sync_free_item_usage_from_invoices(session, enrollment, plan)
    return PatientBenefitPreviewRead(
        has_active_subscription=True,
        **benefit_preview(
            plan=plan,
            enrollment=enrollment,
            service_type=payload.service_type,
            item_ids=payload.item_ids,
            subtotal_amount=payload.subtotal_amount,
            department_id=payload.department_id,
            session=session,
        ),
    )
