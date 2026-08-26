from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_branch_in_tenant
from app.core.auth import user_role_keys
from app.modules.identity.models import User
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionPlan,
)
from app.modules.patient_subscriptions.repositories import (
    PatientSubscriptionEnrollmentRepository,
    PatientSubscriptionPlanRepository,
    PatientSubscriptionSupportRepository,
)
from app.modules.patients.models import Patient


def _get_plan(
    session: Session, tenant_id: str, plan_id: str
) -> PatientSubscriptionPlan:
    plan = PatientSubscriptionPlanRepository(session).get_for_tenant(tenant_id, plan_id)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient subscription plan not found",
        )
    return plan


def _get_enrollment(
    session: Session, tenant_id: str, enrollment_id: str
) -> PatientSubscriptionEnrollment:
    enrollment = PatientSubscriptionEnrollmentRepository(session).get_for_tenant(
        tenant_id, enrollment_id
    )
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient subscription enrollment not found",
        )
    return enrollment


def require_tenant_admin_or_super_admin(
    session: Session, tenant_id: str, user: User
) -> None:
    if user.is_super_admin:
        return
    roles = user_role_keys(session, user)
    if user.tenant_id == tenant_id and (
        user.user_type == "tenant_admin" or "tenant_admin" in roles
    ):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, detail="Tenant admin access required"
    )


def require_tenant_admin(session: Session, tenant_id: str, user: User) -> None:
    """Require an administrator belonging to the selected tenant."""
    roles = user_role_keys(session, user)
    if user.tenant_id == tenant_id and (
        user.user_type == "tenant_admin" or "tenant_admin" in roles
    ):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, detail="Tenant admin access required"
    )


def _resolve_enrollment_branch(
    session: Session,
    *,
    tenant_id: str,
    payload_branch_id: str | None,
    patient: Patient,
    plan: PatientSubscriptionPlan,
) -> str:
    # Membership is tenant-scoped for benefit claims. Keep a branch on the
    # enrollment for invoice numbering/access, but prefer the patient's home
    # branch and do not treat the plan branch as a claim boundary.
    branch_id = patient.branch_id or payload_branch_id or plan.branch_id
    if not branch_id:
        branch_id = PatientSubscriptionSupportRepository(
            session
        ).first_active_branch_id(tenant_id)
    if not branch_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select a branch before enrolling the patient in a membership plan",
        )
    require_branch_in_tenant(session, tenant_id, branch_id)
    return branch_id
