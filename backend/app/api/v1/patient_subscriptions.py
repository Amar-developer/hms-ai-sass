from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.core.auth import require_any_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.patient_subscriptions.schemas import (
    PatientBenefitPreviewRead,
    PatientBenefitPreviewRequest,
    PatientSubscriptionEnrollmentCreate,
    PatientSubscriptionEnrollmentRead,
    PatientSubscriptionEnrollmentUpdate,
    PatientSubscriptionBenefitUsageUpdate,
    PatientSubscriptionPlanCreate,
    PatientSubscriptionPlanRead,
    PatientSubscriptionPlanUpdate,
)
from app.modules.patient_subscriptions import service as patient_subscription_service

router = APIRouter(prefix="/patient-subscriptions")


@router.post(
    "/plans",
    response_model=PatientSubscriptionPlanRead,
    status_code=status.HTTP_201_CREATED,
)
def create_plan(
    payload: PatientSubscriptionPlanCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_CREATE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> PatientSubscriptionPlanRead:
    return patient_subscription_service.create_plan(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/plans", response_model=list[PatientSubscriptionPlanRead])
def list_plans(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    include_inactive: bool = False,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.PATIENT_SUBSCRIPTIONS_CREATE,
            permissions.SETTINGS_MANAGE,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_READ,
        )
    ),
) -> list[PatientSubscriptionPlanRead]:
    return patient_subscription_service.list_plans(
        session,
        tenant_id=tenant_id,
        include_inactive=include_inactive,
        actor=current_user,
    )


@router.patch("/plans/{plan_id}", response_model=PatientSubscriptionPlanRead)
def update_plan(
    plan_id: str,
    payload: PatientSubscriptionPlanUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_EDIT,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> PatientSubscriptionPlanRead:
    return patient_subscription_service.update_plan(
        session,
        tenant_id=tenant_id,
        plan_id=plan_id,
        payload=payload,
        actor=current_user,
    )


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    plan_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_DELETE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> None:
    patient_subscription_service.delete_plan(
        session, tenant_id=tenant_id, plan_id=plan_id, actor=current_user
    )


@router.post(
    "/enrollments",
    response_model=PatientSubscriptionEnrollmentRead,
    status_code=status.HTTP_201_CREATED,
)
def enroll_patient(
    payload: PatientSubscriptionEnrollmentCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_CREATE,
            permissions.SETTINGS_MANAGE,
            permissions.IDENTITY_USERS_MANAGE,
        )
    ),
) -> PatientSubscriptionEnrollmentRead:
    return patient_subscription_service.enroll_patient(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/enrollments", response_model=list[PatientSubscriptionEnrollmentRead])
def list_enrollments(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    patient_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.PATIENT_SUBSCRIPTIONS_CREATE,
            permissions.SETTINGS_MANAGE,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_READ,
        )
    ),
) -> list[PatientSubscriptionEnrollmentRead]:
    return patient_subscription_service.list_enrollments(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        actor=current_user,
    )


@router.patch(
    "/enrollments/{enrollment_id}", response_model=PatientSubscriptionEnrollmentRead
)
def update_enrollment(
    enrollment_id: str,
    payload: PatientSubscriptionEnrollmentUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_EDIT,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> PatientSubscriptionEnrollmentRead:
    return patient_subscription_service.update_enrollment(
        session,
        tenant_id=tenant_id,
        enrollment_id=enrollment_id,
        payload=payload,
        actor=current_user,
    )


@router.patch(
    "/enrollments/{enrollment_id}/benefit-usage",
    response_model=PatientSubscriptionEnrollmentRead,
)
def update_benefit_usage(
    enrollment_id: str,
    payload: PatientSubscriptionBenefitUsageUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_EDIT,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> PatientSubscriptionEnrollmentRead:
    return patient_subscription_service.update_benefit_usage(
        session,
        tenant_id=tenant_id,
        enrollment_id=enrollment_id,
        payload=payload,
        actor=current_user,
    )


@router.delete("/enrollments/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_enrollment(
    enrollment_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_DELETE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> None:
    patient_subscription_service.delete_enrollment(
        session, tenant_id=tenant_id, enrollment_id=enrollment_id, actor=current_user
    )


@router.post("/benefits/preview", response_model=PatientBenefitPreviewRead)
def preview_benefits(
    payload: PatientBenefitPreviewRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SETTINGS_MANAGE,
            permissions.BILLING_MANAGE,
            permissions.LAB_READ,
            permissions.PHARMACY_READ,
        )
    ),
) -> PatientBenefitPreviewRead:
    return patient_subscription_service.preview_benefits(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )
