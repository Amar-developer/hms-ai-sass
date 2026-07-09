from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.audit.models import AuditEvent
from app.modules.audit.repositories import AuditEventRepository
from app.modules.identity.models import User
from app.modules.subscriptions.service import get_active_subscription
from app.modules.tenants.models import Branch, now_utc
from app.modules.tenants.repositories import BranchRepository, TenantRepository
from app.modules.tenants.schemas import BranchCreate, BranchUpdate
from app.modules.tenants.services.helpers import (
    assert_branch_editable_by_actor,
    get_branch_or_404,
)


def create_branch(
    session: Session,
    *,
    tenant_id: str,
    payload: BranchCreate,
    current_user: User,
) -> Branch:
    tenants = TenantRepository(session)
    branches = BranchRepository(session)
    audit_events = AuditEventRepository(session)
    tenant = tenants.get(tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    if not current_user.is_super_admin:
        _subscription, plan = get_active_subscription(session, tenant_id)
        branch_count = branches.active_count_for_tenant(tenant_id)
        if branch_count >= plan.included_branches:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Branch limit reached for plan {plan.name}. Upgrade the subscription to add more branches.",
            )

    branch = Branch.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "is_global_template": current_user.is_super_admin and tenant.is_primary,
            "is_template_locked": False,
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    branches.add(branch)
    session.commit()
    session.refresh(branch)
    audit_events.add(
        AuditEvent(
            tenant_id=tenant_id,
            branch_id=branch.id,
            actor_user_id=current_user.id,
            action="branch.created",
            resource_type="branch",
            resource_id=branch.id,
            purpose="tenant_setup",
        )
    )
    session.commit()
    return branch


def list_branches_for_request(
    session: Session,
    *,
    tenant_id: str,
    request_tenant_id: str,
    current_user: User,
) -> list[Branch]:
    can_cross_scope = False
    if current_user.is_super_admin and request_tenant_id != tenant_id:
        request_tenant = TenantRepository(session).get(request_tenant_id)
        can_cross_scope = bool(request_tenant and request_tenant.is_primary)
    if request_tenant_id != tenant_id and not can_cross_scope:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-tenant branch access is not allowed",
        )
    return BranchRepository(session).list_for_tenant(tenant_id)


def update_branch(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    payload: BranchUpdate,
    current_user: User,
) -> Branch:
    branches = BranchRepository(session)
    audit_events = AuditEventRepository(session)
    branch = get_branch_or_404(session, tenant_id, branch_id)
    assert_branch_editable_by_actor(branch, current_user)
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(branch, key, value)
    branch.updated_by_user_id = current_user.id
    branch.updated_at = now_utc()
    branches.add(branch)
    audit_events.add(
        AuditEvent(
            tenant_id=tenant_id,
            branch_id=branch.id,
            actor_user_id=current_user.id,
            action="branch.updated",
            resource_type="branch",
            resource_id=branch.id,
            purpose="tenant_branch_management",
        )
    )
    session.commit()
    session.refresh(branch)
    return branch


def assign_branch_to_tenant(
    session: Session,
    *,
    branch_id: str,
    target_tenant_id: str,
    current_user: User,
) -> Branch:
    branches = BranchRepository(session)
    audit_events = AuditEventRepository(session)
    source_branch = branches.get(branch_id)
    target_tenant = TenantRepository(session).get(target_tenant_id)
    if not source_branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Source branch not found"
        )
    if not target_tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Target tenant not found"
        )
    if source_branch.tenant_id == target_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and target tenant are the same",
        )

    branch = branches.get_by_code_for_tenant(target_tenant_id, source_branch.code)
    should_be_global = target_tenant.is_primary
    should_be_locked = not target_tenant.is_primary
    if branch:
        branch.name = source_branch.name
        branch.address = source_branch.address
        branch.city = source_branch.city
        branch.state = source_branch.state
        branch.is_active = source_branch.is_active
        branch.source_template_branch_id = source_branch.id
        branch.is_template_locked = should_be_locked
        branch.is_global_template = should_be_global
    else:
        branch = Branch(
            tenant_id=target_tenant_id,
            source_template_branch_id=source_branch.id,
            name=source_branch.name,
            code=source_branch.code,
            address=source_branch.address,
            city=source_branch.city,
            state=source_branch.state,
            is_active=source_branch.is_active,
            is_template_locked=should_be_locked,
            is_global_template=should_be_global,
            created_by_user_id=current_user.id,
        )
    branch.updated_by_user_id = current_user.id
    branch.updated_at = now_utc()
    branches.add(branch)
    session.commit()
    session.refresh(branch)
    audit_events.add(
        AuditEvent(
            tenant_id=target_tenant_id,
            branch_id=branch.id,
            actor_user_id=current_user.id,
            action="branch.assigned_from_template",
            resource_type="branch",
            resource_id=branch.id,
            purpose=f"source_branch:{source_branch.id}",
        )
    )
    session.commit()
    return branch


def update_branch_status(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    payload: BranchUpdate,
    current_user: User,
) -> Branch:
    if payload.is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="is_active is required"
        )
    branches = BranchRepository(session)
    audit_events = AuditEventRepository(session)
    branch = get_branch_or_404(session, tenant_id, branch_id)
    assert_branch_editable_by_actor(branch, current_user)
    branch.is_active = payload.is_active
    branch.updated_by_user_id = current_user.id
    branch.updated_at = now_utc()
    branches.add(branch)
    audit_events.add(
        AuditEvent(
            tenant_id=tenant_id,
            branch_id=branch.id,
            actor_user_id=current_user.id,
            action="branch.status_changed",
            resource_type="branch",
            resource_id=branch.id,
            purpose="tenant_branch_management",
        )
    )
    session.commit()
    session.refresh(branch)
    return branch


def delete_branch(
    session: Session, *, tenant_id: str, branch_id: str, current_user: User
) -> dict[str, str | bool]:
    branches = BranchRepository(session)
    audit_events = AuditEventRepository(session)
    branch = get_branch_or_404(session, tenant_id, branch_id)
    assert_branch_editable_by_actor(branch, current_user)
    branch.is_active = False
    branch.updated_by_user_id = current_user.id
    branch.updated_at = now_utc()
    branches.add(branch)
    audit_events.add(
        AuditEvent(
            tenant_id=tenant_id,
            branch_id=branch.id,
            actor_user_id=current_user.id,
            action="branch.deleted",
            resource_type="branch",
            resource_id=branch.id,
            purpose="tenant_branch_management_soft_delete",
        )
    )
    session.commit()
    return {"deleted": True, "mode": "deactivated", "branch_id": branch.id}
