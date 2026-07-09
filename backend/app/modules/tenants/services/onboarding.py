from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.audit.models import AuditEvent
from app.modules.audit.repositories import AuditEventRepository
from app.modules.identity.models import User, UserRole
from app.modules.identity.repositories import (
    IdentityRoleRepository,
    IdentityUserRepository,
    IdentityUserRoleRepository,
)
from app.modules.identity.security import hash_password
from app.modules.settings.numbering import next_document_number
from app.modules.subscriptions.models import (
    SubscriptionInvoice,
    SubscriptionStatus,
    TenantSubscription,
)
from app.modules.subscriptions.repositories import (
    SubscriptionInvoiceRepository,
    SubscriptionPlanRepository,
    TenantSubscriptionRepository,
)
from app.modules.subscriptions.service import (
    create_default_trial_subscription,
    next_subscription_invoice_number,
    plan_duration_days,
)
from app.modules.tenants.models import Branch, Tenant, TenantType, now_utc
from app.modules.tenants.repositories import (
    BranchRepository,
    DepartmentRepository,
    TenantRepository,
)
from app.modules.tenants.schemas import (
    BranchRead,
    TenantOnboardingCreate,
    TenantOnboardingRead,
    TenantRead,
)
from app.modules.tenants.services.helpers import (
    assert_unique_tenant_values,
    copy_branch_template,
    copy_department_template,
    copy_role_template,
    ensure_tenant_admin_role,
)


def onboard_tenant(
    session: Session, payload: TenantOnboardingCreate, current_user: User
) -> TenantOnboardingRead:
    tenants = TenantRepository(session)
    branches_repo = BranchRepository(session)
    departments_repo = DepartmentRepository(session)
    roles = IdentityRoleRepository(session)
    users = IdentityUserRepository(session)
    user_roles = IdentityUserRoleRepository(session)
    subscription_plans = SubscriptionPlanRepository(session)
    subscriptions = TenantSubscriptionRepository(session)
    subscription_invoices = SubscriptionInvoiceRepository(session)
    audit_events = AuditEventRepository(session)
    assert_unique_tenant_values(
        session,
        name=payload.tenant.name,
        email=payload.tenant.email,
        phone=payload.tenant.phone,
    )
    if payload.tenant.is_primary or payload.tenant.tenant_type in (
        TenantType.PRIMARY,
        TenantType.PRIMARY.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use bootstrap for the primary tenant",
        )

    plan_id = payload.subscription_plan_id
    plan = subscription_plans.get(plan_id) if plan_id else None
    if plan_id and (not plan or not plan.is_active):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid subscription plan"
        )

    role_template_ids = list(dict.fromkeys(payload.role_template_ids))
    department_template_ids = list(dict.fromkeys(payload.department_template_ids))
    branch_template_ids = list(dict.fromkeys(payload.branch_template_ids))
    for role_id in role_template_ids:
        source_role = roles.get(role_id)
        if not source_role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Source role not found"
            )
        if source_role.key == "super_admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Super Admin role can only belong to the primary tenant",
            )
    for department_id in department_template_ids:
        if not departments_repo.get(department_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source department not found",
            )

    branch_codes = [branch.code.strip().lower() for branch in payload.branches]
    if len(set(branch_codes)) != len(branch_codes):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Branch codes must be unique",
        )
    selected_branch_codes = set(branch_codes)
    for branch_id in branch_template_ids:
        source_branch = branches_repo.get(branch_id)
        if not source_branch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Source branch not found"
            )
        selected_branch_codes.add(source_branch.code.strip().lower())
    if plan and len(selected_branch_codes) > plan.included_branches:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Branch limit reached for plan {plan.name}. Select fewer branches or upgrade the plan.",
        )

    tenant = Tenant.model_validate(
        payload.tenant,
        update={
            "is_primary": False,
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    tenants.add(tenant)
    session.commit()
    session.refresh(tenant)

    branches: list[Branch] = []
    for branch_payload in payload.branches:
        branch = Branch.model_validate(
            branch_payload,
            update={
                "tenant_id": tenant.id,
                "created_by_user_id": current_user.id,
                "updated_by_user_id": current_user.id,
            },
        )
        branches_repo.add(branch)
        session.commit()
        session.refresh(branch)
        branches.append(branch)

    subscription_id = None
    if plan_id:
        assert plan is not None
        subscription_ends_on = payload.subscription_ends_on
        if subscription_ends_on is None:
            duration_days = plan_duration_days(plan.key)
            if duration_days:
                subscription_ends_on = payload.subscription_starts_on + timedelta(
                    days=duration_days
                )
        starts_today = payload.subscription_starts_on <= date.today()
        for existing in subscriptions.active_for_tenant(tenant.id):
            existing.is_active = False
            existing.status = SubscriptionStatus.EXPIRED
            existing.updated_by_user_id = current_user.id
            existing.updated_at = now_utc()
            subscriptions.add(existing)
        subscription = TenantSubscription(
            tenant_id=tenant.id,
            plan_id=plan.id,
            starts_on=payload.subscription_starts_on,
            ends_on=subscription_ends_on,
            is_trial=plan.key == "free_trial",
            is_active=starts_today,
            status=SubscriptionStatus.ACTIVE
            if starts_today
            else SubscriptionStatus.SCHEDULED,
            billing_amount=plan.price_inr_monthly,
            created_by_user_id=current_user.id,
            updated_by_user_id=current_user.id,
        )
        subscriptions.add(subscription)
        session.commit()
        session.refresh(subscription)
        subscription_id = subscription.id
        subscription_invoices.add(
            SubscriptionInvoice(
                tenant_id=tenant.id,
                subscription_id=subscription.id,
                invoice_number=next_subscription_invoice_number(session),
                description=f"Subscription: {plan.name}",
                amount=subscription.billing_amount,
                taxable_amount=subscription.billing_amount,
                total_amount=subscription.billing_amount,
                balance_amount=subscription.billing_amount,
                due_on=subscription.starts_on,
                created_by_user_id=current_user.id,
                updated_by_user_id=current_user.id,
            )
        )
        session.commit()
    else:
        trial_subscription = create_default_trial_subscription(session, tenant.id)
        subscription_id = trial_subscription.id
        plan_id = trial_subscription.plan_id

    role_count = 0
    if payload.admin_user:
        tenant_admin_role = ensure_tenant_admin_role(session, tenant.id, current_user)
        role_count += 1
        role_template_ids = [
            role_id
            for role_id in role_template_ids
            if (source_role := roles.get(role_id))
            and source_role.key != tenant_admin_role.key
        ]
    for role_id in role_template_ids:
        copy_role_template(session, role_id, tenant.id, current_user)
        role_count += 1

    for department_id in department_template_ids:
        copy_department_template(session, department_id, tenant.id, current_user)
    for branch_id in branch_template_ids:
        branches.append(
            copy_branch_template(session, branch_id, tenant.id, current_user)
        )

    admin_user_id = None
    if payload.admin_user:
        existing_admin = users.get_by_email_for_tenant(
            tenant.id, payload.admin_user.email.strip().lower()
        )
        if existing_admin:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tenant admin user already exists",
            )
        user = User(
            tenant_id=tenant.id,
            branch_id=None,
            user_number=next_document_number(
                session, tenant_id=tenant.id, entity="user"
            ),
            user_type="tenant_admin",
            name=payload.admin_user.name,
            email=payload.admin_user.email.strip().lower(),
            mobile=payload.admin_user.mobile,
            password_hash=hash_password(payload.admin_user.password),
            must_change_password=payload.admin_user.must_change_password,
            created_by_user_id=current_user.id,
            updated_by_user_id=current_user.id,
        )
        users.add(user)
        session.commit()
        session.refresh(user)
        tenant_admin_role = ensure_tenant_admin_role(session, tenant.id, current_user)
        if not user_roles.get(user_id=user.id, role_id=tenant_admin_role.id):
            user_roles.add(
                UserRole(
                    user_id=user.id, role_id=tenant_admin_role.id, tenant_id=tenant.id
                )
            )
            session.commit()
        admin_user_id = user.id

    audit_events.add(
        AuditEvent(
            tenant_id=tenant.id,
            actor_user_id=current_user.id,
            action="tenant.onboarded",
            resource_type="tenant",
            resource_id=tenant.id,
            purpose="platform_tenant_onboarding",
        )
    )
    session.commit()
    session.refresh(tenant)
    return TenantOnboardingRead(
        tenant=TenantRead.model_validate(tenant, from_attributes=True),
        branches=[
            BranchRead.model_validate(branch, from_attributes=True)
            for branch in branches
        ],
        role_count=role_count,
        department_count=len(department_template_ids),
        branch_template_count=len(branch_template_ids),
        subscription_id=subscription_id,
        subscription_plan_id=plan_id,
        admin_user_id=admin_user_id,
    )
