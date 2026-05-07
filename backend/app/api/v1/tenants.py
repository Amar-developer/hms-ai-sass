import re
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlmodel import Session, select

from app.core.auth import require_any_permission, require_permission, require_super_admin
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.audit.models import AuditEvent
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.subscriptions.service import create_default_trial_subscription, get_active_subscription
from app.modules.tenants.models import Branch, Department, Tenant, TenantStatus, TenantType, now_utc
from app.modules.tenants.schemas import (
    BranchCreate,
    BranchRead,
    BranchUpdate,
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
    TenantCreate,
    TenantRead,
    TenantUpdate,
)

router = APIRouter(prefix="/tenants")
PRIMARY_TENANT_NAME = "MedizinHub HMS"


def _assert_tenant_access(user: User, tenant_id: str, request_tenant_id: str | None) -> None:
    if user.is_super_admin:
        return
    if request_tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-tenant access is not allowed")


def _assert_department_editable_by_actor(department: Department, current_user: User) -> None:
    if current_user.is_super_admin:
        return
    if department.is_template_locked or department.source_template_department_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This department is assigned from MedizinHub HMS global template and cannot be changed by tenant admin",
        )


def _assert_branch_editable_by_actor(branch: Branch, current_user: User) -> None:
    if current_user.is_super_admin:
        return
    if branch.is_template_locked or branch.source_template_branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This branch is assigned from MedizinHub HMS global template and cannot be changed by tenant admin",
        )


def _department_code(session: Session, tenant_id: str, name: str, current_department_id: str | None = None) -> str:
    base = re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")[:36] or "DEPT"
    code = base
    suffix = 2
    while True:
        existing = session.exec(
            select(Department).where(Department.tenant_id == tenant_id, Department.code == code)
        ).first()
        if not existing or existing.id == current_department_id:
            return code
        code = f"{base[:35]}{suffix}"
        suffix += 1


def _get_department_or_404(session: Session, tenant_id: str, department_id: str) -> Department:
    department = session.get(Department, department_id)
    if not department or department.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    return department


def _get_branch_or_404(session: Session, tenant_id: str, branch_id: str) -> Branch:
    branch = session.get(Branch, branch_id)
    if not branch or branch.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    return branch


@router.post(
    "",
    response_model=TenantRead,
    status_code=status.HTTP_201_CREATED,
)
def create_tenant(
    payload: TenantCreate,
    current_user: User = Depends(require_permission(permissions.PLATFORM_TENANTS_MANAGE)),
    session: Session = Depends(get_session),
) -> Tenant:
    if payload.is_primary:
        existing_primary = session.exec(select(Tenant).where(Tenant.is_primary == True)).first()  # noqa: E712
        if existing_primary:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Primary tenant already exists")
    tenant = Tenant.model_validate(
        payload,
        update={"created_by_user_id": current_user.id, "updated_by_user_id": current_user.id},
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    session.add(
        AuditEvent(
            tenant_id=tenant.id,
            actor_user_id=current_user.id,
            action="tenant.created",
            resource_type="tenant",
            resource_id=tenant.id,
            purpose="platform_setup",
        )
    )
    session.commit()
    create_default_trial_subscription(session, tenant.id)
    return tenant


@router.get(
    "",
    response_model=list[TenantRead],
    dependencies=[Depends(require_permission(permissions.PLATFORM_TENANTS_MANAGE))],
)
def list_tenants(session: Session = Depends(get_session)) -> list[Tenant]:
    return list(session.exec(select(Tenant).order_by(Tenant.updated_at.desc(), Tenant.created_at.desc())).all())


@router.get(
    "/{tenant_id}",
    response_model=TenantRead,
    dependencies=[Depends(require_permission(permissions.PLATFORM_TENANTS_MANAGE))],
)
def get_tenant(tenant_id: str, session: Session = Depends(get_session)) -> Tenant:
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant


@router.patch(
    "/{tenant_id}",
    response_model=TenantRead,
)
def update_tenant(
    tenant_id: str,
    payload: TenantUpdate,
    current_user: User = Depends(require_permission(permissions.PLATFORM_TENANTS_MANAGE)),
    session: Session = Depends(get_session),
) -> Tenant:
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    updates = payload.model_dump(exclude_unset=True)
    if tenant.is_primary:
        if updates.get("name") not in (None, PRIMARY_TENANT_NAME):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Primary tenant name is fixed")
        if updates.get("tenant_type") not in (None, TenantType.PRIMARY, TenantType.PRIMARY.value):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Primary tenant type is fixed")
        if updates.get("status") not in (None, TenantStatus.ACTIVE):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Primary tenant must remain active")
    for key, value in updates.items():
        if isinstance(value, TenantType):
            value = value.value
        setattr(tenant, key, value)
    tenant.updated_by_user_id = current_user.id
    tenant.updated_at = now_utc()
    session.add(tenant)
    session.add(
        AuditEvent(
            tenant_id=tenant.id,
            actor_user_id=current_user.id,
            action="tenant.updated",
            resource_type="tenant",
            resource_id=tenant.id,
            purpose="platform_management",
        )
    )
    session.commit()
    session.refresh(tenant)
    return tenant


@router.delete(
    "/{tenant_id}",
    status_code=status.HTTP_200_OK,
)
def delete_tenant(
    tenant_id: str,
    current_user: User = Depends(require_permission(permissions.PLATFORM_TENANTS_MANAGE)),
    session: Session = Depends(get_session),
) -> dict[str, str | bool]:
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    if tenant.is_primary:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Primary tenant cannot be deleted")
    tenant.status = TenantStatus.SUSPENDED
    tenant.updated_by_user_id = current_user.id
    tenant.updated_at = now_utc()
    session.add(tenant)
    session.add(
        AuditEvent(
            tenant_id=tenant.id,
            actor_user_id=current_user.id,
            action="tenant.deleted",
            resource_type="tenant",
            resource_id=tenant.id,
            purpose="platform_management_soft_delete",
        )
    )
    session.commit()
    return {"deleted": True, "mode": "suspended", "tenant_id": tenant.id}


@router.post(
    "/{tenant_id}/branches",
    response_model=BranchRead,
    status_code=status.HTTP_201_CREATED,
)
def create_branch(
    tenant_id: str,
    payload: BranchCreate,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(require_any_permission(permissions.BRANCHES_MANAGE, permissions.BRANCHES_CREATE, permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> Branch:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    if not current_user.is_super_admin:
        _subscription, plan = get_active_subscription(session, tenant_id)
        branch_count = len(
            session.exec(
                select(Branch.id).where(Branch.tenant_id == tenant_id, Branch.is_active == True)  # noqa: E712
            ).all()
        )
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
    session.add(branch)
    session.commit()
    session.refresh(branch)
    session.add(
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


@router.get("/{tenant_id}/branches", response_model=list[BranchRead])
def list_branches(
    tenant_id: str,
    request_tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.SETTINGS_MANAGE,
            permissions.SETTINGS_READ,
            permissions.BRANCHES_MANAGE,
            permissions.BRANCHES_READ,
            permissions.APPOINTMENTS_MANAGE,
            permissions.APPOINTMENTS_CREATE,
            permissions.APPOINTMENTS_READ,
            permissions.SCHEDULING_MANAGE,
            permissions.SCHEDULING_READ,
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_READ,
        )
    ),
    session: Session = Depends(get_session),
) -> list[Branch]:
    can_cross_scope = False
    if current_user.is_super_admin and request_tenant_id != tenant_id:
        request_tenant = session.get(Tenant, request_tenant_id)
        can_cross_scope = bool(request_tenant and request_tenant.is_primary)
    if request_tenant_id != tenant_id and not can_cross_scope:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-tenant branch access is not allowed",
        )
    return list(
        session.exec(
            select(Branch).where(Branch.tenant_id == tenant_id).order_by(Branch.updated_at.desc(), Branch.created_at.desc())
        ).all()
    )


@router.patch("/{tenant_id}/branches/{branch_id}", response_model=BranchRead)
def update_branch(
    tenant_id: str,
    branch_id: str,
    payload: BranchUpdate,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(require_any_permission(permissions.BRANCHES_MANAGE, permissions.BRANCHES_EDIT, permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> Branch:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    branch = _get_branch_or_404(session, tenant_id, branch_id)
    _assert_branch_editable_by_actor(branch, current_user)
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(branch, key, value)
    branch.updated_by_user_id = current_user.id
    branch.updated_at = now_utc()
    session.add(branch)
    session.add(
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


@router.post("/branches/{branch_id}/assign/{target_tenant_id}", response_model=BranchRead)
def assign_branch_to_tenant(
    branch_id: str,
    target_tenant_id: str,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> Branch:
    source_branch = session.get(Branch, branch_id)
    target_tenant = session.get(Tenant, target_tenant_id)
    if not source_branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source branch not found")
    if not target_tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target tenant not found")
    if source_branch.tenant_id == target_tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Source and target tenant are the same")

    branch = session.exec(
        select(Branch).where(Branch.tenant_id == target_tenant_id, Branch.code == source_branch.code)
    ).first()
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
    session.add(branch)
    session.commit()
    session.refresh(branch)
    session.add(
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


@router.post("/{tenant_id}/branches/{branch_id}/status", response_model=BranchRead)
def update_branch_status(
    tenant_id: str,
    branch_id: str,
    payload: BranchUpdate,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(require_any_permission(permissions.BRANCHES_MANAGE, permissions.BRANCHES_EDIT, permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> Branch:
    if payload.is_active is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="is_active is required")
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    branch = _get_branch_or_404(session, tenant_id, branch_id)
    _assert_branch_editable_by_actor(branch, current_user)
    branch.is_active = payload.is_active
    branch.updated_by_user_id = current_user.id
    branch.updated_at = now_utc()
    session.add(branch)
    session.add(
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


@router.delete("/{tenant_id}/branches/{branch_id}", status_code=status.HTTP_200_OK)
def delete_branch(
    tenant_id: str,
    branch_id: str,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(require_any_permission(permissions.BRANCHES_MANAGE, permissions.BRANCHES_DELETE, permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> dict[str, str | bool]:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    branch = _get_branch_or_404(session, tenant_id, branch_id)
    _assert_branch_editable_by_actor(branch, current_user)
    branch.is_active = False
    branch.updated_by_user_id = current_user.id
    branch.updated_at = now_utc()
    session.add(branch)
    session.add(
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


@router.post(
    "/{tenant_id}/departments",
    response_model=DepartmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_department(
    tenant_id: str,
    payload: DepartmentCreate,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(require_any_permission(permissions.DEPARTMENTS_MANAGE, permissions.DEPARTMENTS_CREATE, permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> Department:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    if payload.branch_id:
        branch = session.get(Branch, payload.branch_id)
        if not branch or branch.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Branch is not part of this tenant")

    department = Department(
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        name=payload.name,
        code=payload.code or _department_code(session, tenant_id, payload.name),
        description=payload.description,
        is_active=payload.is_active,
        is_global_template=current_user.is_super_admin and tenant.is_primary,
        is_template_locked=False,
        created_by_user_id=payload.created_by_user_id or current_user.id,
        updated_by_user_id=current_user.id,
        updated_at=now_utc(),
    )
    session.add(department)
    session.commit()
    session.refresh(department)
    session.add(
        AuditEvent(
            tenant_id=tenant_id,
            branch_id=department.branch_id,
            actor_user_id=current_user.id,
            action="department.created",
            resource_type="department",
            resource_id=department.id,
            purpose="tenant_department_management",
        )
    )
    session.commit()
    return department


@router.post("/departments/{department_id}/assign/{target_tenant_id}", response_model=DepartmentRead)
def assign_department_to_tenant(
    department_id: str,
    target_tenant_id: str,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> Department:
    source_department = session.get(Department, department_id)
    target_tenant = session.get(Tenant, target_tenant_id)
    if not source_department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source department not found")
    if not target_tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target tenant not found")
    if source_department.tenant_id == target_tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Source and target tenant are the same")

    department = session.exec(
        select(Department).where(Department.tenant_id == target_tenant_id, Department.code == source_department.code)
    ).first()
    should_be_global = target_tenant.is_primary
    should_be_locked = not target_tenant.is_primary
    if department:
        department.name = source_department.name
        department.description = source_department.description
        department.is_active = source_department.is_active
        department.source_template_department_id = source_department.id
        department.is_template_locked = should_be_locked
        department.is_global_template = should_be_global
    else:
        department = Department(
            tenant_id=target_tenant_id,
            branch_id=None,
            source_template_department_id=source_department.id,
            name=source_department.name,
            code=source_department.code,
            description=source_department.description,
            is_active=source_department.is_active,
            is_template_locked=should_be_locked,
            is_global_template=should_be_global,
            created_by_user_id=current_user.id,
        )
    department.updated_by_user_id = current_user.id
    department.updated_at = now_utc()
    session.add(department)
    session.commit()
    session.refresh(department)
    session.add(
        AuditEvent(
            tenant_id=target_tenant_id,
            actor_user_id=current_user.id,
            action="department.assigned_from_template",
            resource_type="department",
            resource_id=department.id,
            purpose=f"source_department:{source_department.id}",
        )
    )
    session.commit()
    return department


@router.get("/{tenant_id}/departments", response_model=list[DepartmentRead])
def list_departments(
    tenant_id: str,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(
        require_any_permission(
            permissions.SETTINGS_MANAGE,
            permissions.SETTINGS_READ,
            permissions.DEPARTMENTS_MANAGE,
            permissions.DEPARTMENTS_READ,
            permissions.APPOINTMENTS_MANAGE,
            permissions.APPOINTMENTS_CREATE,
            permissions.APPOINTMENTS_READ,
            permissions.SCHEDULING_MANAGE,
            permissions.SCHEDULING_READ,
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_READ,
        )
    ),
    session: Session = Depends(get_session),
) -> list[Department]:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    return list(
        session.exec(
            select(Department).where(Department.tenant_id == tenant_id).order_by(Department.created_at)
        ).all()
    )


@router.get("/{tenant_id}/departments/{department_id}", response_model=DepartmentRead)
def get_department(
    tenant_id: str,
    department_id: str,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(require_any_permission(permissions.DEPARTMENTS_MANAGE, permissions.DEPARTMENTS_READ, permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> Department:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    return _get_department_or_404(session, tenant_id, department_id)


@router.patch("/{tenant_id}/departments/{department_id}", response_model=DepartmentRead)
def update_department(
    tenant_id: str,
    department_id: str,
    payload: DepartmentUpdate,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(require_any_permission(permissions.DEPARTMENTS_MANAGE, permissions.DEPARTMENTS_EDIT, permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> Department:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    department = _get_department_or_404(session, tenant_id, department_id)
    _assert_department_editable_by_actor(department, current_user)
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("branch_id"):
        branch = session.get(Branch, updates["branch_id"])
        if not branch or branch.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Branch is not part of this tenant")
    if "name" in updates and "code" not in updates:
        department.code = _department_code(session, tenant_id, updates["name"], department.id)
    for key, value in updates.items():
        setattr(department, key, value)
    department.updated_by_user_id = current_user.id
    department.updated_at = now_utc()
    session.add(department)
    session.add(
        AuditEvent(
            tenant_id=tenant_id,
            branch_id=department.branch_id,
            actor_user_id=current_user.id,
            action="department.updated",
            resource_type="department",
            resource_id=department.id,
            purpose="tenant_department_management",
        )
    )
    session.commit()
    session.refresh(department)
    return department


@router.post("/{tenant_id}/departments/{department_id}/status", response_model=DepartmentRead)
def update_department_status(
    tenant_id: str,
    department_id: str,
    payload: DepartmentUpdate,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(require_any_permission(permissions.DEPARTMENTS_MANAGE, permissions.DEPARTMENTS_EDIT, permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> Department:
    if payload.is_active is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="is_active is required")
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    department = _get_department_or_404(session, tenant_id, department_id)
    _assert_department_editable_by_actor(department, current_user)
    department.is_active = payload.is_active
    department.updated_by_user_id = current_user.id
    department.updated_at = now_utc()
    session.add(department)
    session.add(
        AuditEvent(
            tenant_id=tenant_id,
            branch_id=department.branch_id,
            actor_user_id=current_user.id,
            action="department.status_changed",
            resource_type="department",
            resource_id=department.id,
            purpose="tenant_department_management",
        )
    )
    session.commit()
    session.refresh(department)
    return department


@router.delete("/{tenant_id}/departments/{department_id}", status_code=status.HTTP_200_OK)
def delete_department(
    tenant_id: str,
    department_id: str,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(require_any_permission(permissions.DEPARTMENTS_MANAGE, permissions.DEPARTMENTS_DELETE, permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> dict[str, str | bool]:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    department = _get_department_or_404(session, tenant_id, department_id)
    _assert_department_editable_by_actor(department, current_user)
    department.is_active = False
    department.updated_by_user_id = current_user.id
    department.updated_at = now_utc()
    session.add(department)
    session.add(
        AuditEvent(
            tenant_id=tenant_id,
            branch_id=department.branch_id,
            actor_user_id=current_user.id,
            action="department.deleted",
            resource_type="department",
            resource_id=department.id,
            purpose="tenant_department_management_soft_delete",
        )
    )
    session.commit()
    return {"deleted": True, "mode": "deactivated", "department_id": department.id}
