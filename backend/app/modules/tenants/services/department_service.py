from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.list_filters import ListFilter, ListFilterOption, ListSort
from app.core.pagination import Page
from app.modules.audit.models import AuditEvent
from app.modules.audit.repositories import AuditEventRepository
from app.modules.identity.models import User
from app.modules.tenants.models import Department, now_utc
from app.modules.tenants.repositories import (
    BranchRepository,
    DepartmentRepository,
    TenantRepository,
)
from app.modules.tenants.schemas import (
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
)
from app.modules.tenants.services.helpers import (
    assert_department_editable_by_actor,
    department_code,
    get_department_or_404,
    normal_key,
)


def create_department(
    session: Session,
    *,
    tenant_id: str,
    payload: DepartmentCreate,
    current_user: User,
) -> Department:
    tenants = TenantRepository(session)
    branches = BranchRepository(session)
    departments = DepartmentRepository(session)
    audit_events = AuditEventRepository(session)
    tenant = tenants.get(tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    if payload.branch_id:
        branch = branches.get(payload.branch_id)
        if not branch or branch.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch is not part of this tenant",
            )

    existing_departments = departments.list_for_tenant(tenant_id)
    normalized_name = normal_key(payload.name)
    conflicting_scope = next(
        (
            department
            for department in existing_departments
            if normal_key(department.name) == normalized_name
            and department.branch_id != payload.branch_id
            and (department.branch_id is None or payload.branch_id is None)
            and department.is_active
        ),
        None,
    )
    if conflicting_scope:
        if payload.branch_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This department already exists for all branches. Edit that department or choose a different name before creating a branch-specific mapping.",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This department already exists for one or more branches. Remove those branch-specific mappings before creating an all-branches department.",
        )
    existing = next(
        (
            department
            for department in existing_departments
            if department.branch_id == payload.branch_id
            and normal_key(department.name) == normalized_name
        ),
        None,
    )
    if existing:
        assert_department_editable_by_actor(existing, current_user)
        existing.description = (
            payload.description
            if payload.description is not None
            else existing.description
        )
        existing.is_active = payload.is_active
        existing.updated_by_user_id = current_user.id
        existing.updated_at = now_utc()
        departments.add(existing)
        audit_events.add(
            AuditEvent(
                tenant_id=tenant_id,
                branch_id=existing.branch_id,
                actor_user_id=current_user.id,
                action="department.reused_existing_mapping",
                resource_type="department",
                resource_id=existing.id,
                purpose="tenant_department_management",
            )
        )
        session.commit()
        session.refresh(existing)
        return existing

    department = Department(
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        name=payload.name,
        code=payload.code or department_code(session, tenant_id, payload.name),
        description=payload.description,
        is_active=payload.is_active,
        is_global_template=current_user.is_super_admin and tenant.is_primary,
        is_template_locked=False,
        created_by_user_id=payload.created_by_user_id or current_user.id,
        updated_by_user_id=current_user.id,
        updated_at=now_utc(),
    )
    departments.add(department)
    session.commit()
    session.refresh(department)
    audit_events.add(
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


def assign_department_to_tenant(
    session: Session,
    *,
    department_id: str,
    target_tenant_id: str,
    current_user: User,
) -> Department:
    departments = DepartmentRepository(session)
    audit_events = AuditEventRepository(session)
    source_department = departments.get(department_id)
    target_tenant = TenantRepository(session).get(target_tenant_id)
    if not source_department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Source department not found"
        )
    if not target_tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Target tenant not found"
        )
    if source_department.tenant_id == target_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and target tenant are the same",
        )

    department = departments.get_by_code_for_tenant(
        target_tenant_id, source_department.code
    )
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
    departments.add(department)
    session.commit()
    session.refresh(department)
    audit_events.add(
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


def list_departments(session: Session, *, tenant_id: str) -> list[Department]:
    return DepartmentRepository(session).list_for_tenant(tenant_id)


def list_department_page(
    session: Session,
    *,
    tenant_id: str,
    q: str | None,
    list_filters: list[ListFilter],
    list_sort: ListSort | None,
    limit: int,
    offset: int,
) -> Page[DepartmentRead]:
    repository = DepartmentRepository(session)
    rows = repository.list_page(
        tenant_id=tenant_id,
        q=q,
        list_filters=list_filters,
        list_sort=list_sort,
        limit=limit,
        offset=offset,
    )
    total = repository.count_page(
        tenant_id=tenant_id,
        q=q,
        list_filters=list_filters,
    )
    return Page(
        items=[
            DepartmentRead.model_validate(row, from_attributes=True) for row in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


def list_department_filter_options(
    session: Session,
    *,
    tenant_id: str,
) -> dict[str, list[ListFilterOption]]:
    return DepartmentRepository(session).filter_options(tenant_id=tenant_id)


def get_department(
    session: Session, *, tenant_id: str, department_id: str
) -> Department:
    return get_department_or_404(session, tenant_id, department_id)


def update_department(
    session: Session,
    *,
    tenant_id: str,
    department_id: str,
    payload: DepartmentUpdate,
    current_user: User,
) -> Department:
    branches = BranchRepository(session)
    departments = DepartmentRepository(session)
    audit_events = AuditEventRepository(session)
    department = get_department_or_404(session, tenant_id, department_id)
    assert_department_editable_by_actor(department, current_user)
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("branch_id"):
        branch = branches.get(updates["branch_id"])
        if not branch or branch.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch is not part of this tenant",
            )
    next_name = updates.get("name", department.name)
    next_branch_id = updates.get("branch_id", department.branch_id)
    conflict = departments.list_active_for_tenant_except(tenant_id, department.id)
    conflict = next(
        (
            row
            for row in conflict
            if normal_key(row.name) == normal_key(next_name)
            and (
                row.branch_id == next_branch_id
                or row.branch_id is None
                or next_branch_id is None
            )
        ),
        None,
    )
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active department with this name already exists for the selected branch scope.",
        )
    if "name" in updates and "code" not in updates:
        department.code = department_code(
            session, tenant_id, updates["name"], department.id
        )
    for key, value in updates.items():
        setattr(department, key, value)
    department.updated_by_user_id = current_user.id
    department.updated_at = now_utc()
    departments.add(department)
    audit_events.add(
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


def update_department_status(
    session: Session,
    *,
    tenant_id: str,
    department_id: str,
    payload: DepartmentUpdate,
    current_user: User,
) -> Department:
    if payload.is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="is_active is required"
        )
    departments = DepartmentRepository(session)
    audit_events = AuditEventRepository(session)
    department = get_department_or_404(session, tenant_id, department_id)
    assert_department_editable_by_actor(department, current_user)
    department.is_active = payload.is_active
    department.updated_by_user_id = current_user.id
    department.updated_at = now_utc()
    departments.add(department)
    audit_events.add(
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


def delete_department(
    session: Session,
    *,
    tenant_id: str,
    department_id: str,
    current_user: User,
) -> dict[str, str | bool]:
    departments = DepartmentRepository(session)
    audit_events = AuditEventRepository(session)
    department = get_department_or_404(session, tenant_id, department_id)
    assert_department_editable_by_actor(department, current_user)
    department.is_active = False
    department.updated_by_user_id = current_user.id
    department.updated_at = now_utc()
    departments.add(department)
    audit_events.add(
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
