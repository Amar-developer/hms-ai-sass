import re

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.identity import permissions
from app.modules.identity.models import Permission, Role, RolePermission, User
from app.modules.identity.repositories import (
    IdentityPermissionRepository,
    IdentityRolePermissionRepository,
    IdentityRoleRepository,
)
from app.modules.tenants.models import Branch, Department, now_utc
from app.modules.tenants.repositories import (
    BranchRepository,
    DepartmentRepository,
    TenantRepository,
)

PRIMARY_TENANT_NAME = "MedizinHub HMS"
TENANT_ADMIN_DEFAULT_PERMISSION_KEYS = [
    permission_key
    for permission_key in permissions.PERMISSION_CATALOG
    if not permission_key.startswith("platform.")
]


def assert_tenant_access(
    user: User, tenant_id: str, request_tenant_id: str | None
) -> None:
    if user.is_super_admin:
        return
    if request_tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-tenant access is not allowed",
        )


def assert_department_editable_by_actor(
    department: Department, current_user: User
) -> None:
    if current_user.is_super_admin:
        return
    if department.is_template_locked or department.source_template_department_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This department is assigned from MedizinHub HMS global template and cannot be changed by tenant admin",
        )


def assert_branch_editable_by_actor(branch: Branch, current_user: User) -> None:
    if current_user.is_super_admin:
        return
    if branch.is_template_locked or branch.source_template_branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This branch is assigned from MedizinHub HMS global template and cannot be changed by tenant admin",
        )


def department_code(
    session: Session,
    tenant_id: str,
    name: str,
    current_department_id: str | None = None,
) -> str:
    base = re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")[:36] or "DEPT"
    code = base
    suffix = 2
    departments = DepartmentRepository(session)
    while True:
        existing = departments.get_by_code_for_tenant(tenant_id, code)
        if not existing or existing.id == current_department_id:
            return code
        code = f"{base[:35]}{suffix}"
        suffix += 1


def normal_key(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).lower()


def assert_unique_tenant_values(
    session: Session,
    *,
    name: str | None,
    email: str | None,
    phone: str | None,
    current_tenant_id: str | None = None,
) -> None:
    payload_name = normal_key(name)
    payload_email = normal_key(email)
    payload_phone = normal_key(phone)
    enforce_name = bool(payload_name and (payload_email or payload_phone))
    tenants = TenantRepository(session).list_all()
    for tenant in tenants:
        if tenant.id == current_tenant_id:
            continue
        if enforce_name and normal_key(tenant.name) == payload_name:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tenant already exists with this name",
            )
        if payload_email and normal_key(tenant.email) == payload_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tenant already exists with this email",
            )
        if payload_phone and normal_key(tenant.phone) == payload_phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tenant already exists with this phone",
            )


def get_department_or_404(
    session: Session, tenant_id: str, department_id: str
) -> Department:
    department = DepartmentRepository(session).get_for_tenant(tenant_id, department_id)
    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Medical department not found"
        )
    return department


def get_branch_or_404(session: Session, tenant_id: str, branch_id: str) -> Branch:
    branch = BranchRepository(session).get_for_tenant(tenant_id, branch_id)
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found"
        )
    return branch


def ensure_permission(session: Session, key: str) -> Permission:
    permissions_repo = IdentityPermissionRepository(session)
    permission = permissions_repo.get_by_key(key)
    if permission:
        return permission
    permission = Permission(key=key, description=key.replace(".", " ").title())
    permissions_repo.add(permission)
    session.commit()
    session.refresh(permission)
    return permission


def replace_role_permissions(
    session: Session, role: Role, permission_keys: list[str]
) -> None:
    role_permissions = IdentityRolePermissionRepository(session)
    for row in role_permissions.list_for_role(role.id):
        role_permissions.delete(row)
    for permission_key in permission_keys:
        permission = ensure_permission(session, permission_key)
        role_permissions.add(
            RolePermission(role_id=role.id, permission_id=permission.id)
        )


def role_permission_keys(session: Session, role: Role) -> list[str]:
    return IdentityRolePermissionRepository(session).permission_keys_for_role(role.id)


def ensure_tenant_admin_role(
    session: Session, tenant_id: str, current_user: User
) -> Role:
    roles = IdentityRoleRepository(session)
    role = roles.get_by_key_for_tenant(tenant_id, "tenant_admin")
    if role:
        return role
    primary_template = roles.get_primary_template_by_key("tenant_admin")
    role = Role(
        tenant_id=tenant_id,
        source_template_role_id=primary_template.id
        if primary_template and primary_template.tenant_id != tenant_id
        else None,
        name=primary_template.name if primary_template else "Tenant Admin",
        key="tenant_admin",
        is_active=True,
        is_template_locked=bool(primary_template),
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    roles.add(role)
    session.commit()
    session.refresh(role)
    replace_role_permissions(
        session,
        role,
        role_permission_keys(session, primary_template)
        if primary_template
        else TENANT_ADMIN_DEFAULT_PERMISSION_KEYS,
    )
    session.commit()
    return role


def copy_role_template(
    session: Session, role_id: str, target_tenant_id: str, current_user: User
) -> Role:
    roles = IdentityRoleRepository(session)
    source_role = roles.get(role_id)
    target_tenant = TenantRepository(session).get(target_tenant_id)
    if not source_role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Source role not found"
        )
    if not target_tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Target tenant not found"
        )
    if source_role.key == "super_admin" and not target_tenant.is_primary:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super Admin role can only belong to the primary tenant",
        )
    permission_keys = role_permission_keys(session, source_role)
    role = roles.get_by_key_for_tenant(target_tenant_id, source_role.key)
    if role:
        role.name = source_role.name
        role.is_active = source_role.is_active
        role.source_template_role_id = source_role.id
        role.is_template_locked = not target_tenant.is_primary
        role.is_global_template = target_tenant.is_primary
    else:
        role = Role(
            tenant_id=target_tenant_id,
            source_template_role_id=source_role.id,
            name=source_role.name,
            key=source_role.key,
            is_active=source_role.is_active,
            is_template_locked=not target_tenant.is_primary,
            is_global_template=target_tenant.is_primary,
            created_by_user_id=current_user.id,
        )
    role.updated_by_user_id = current_user.id
    role.updated_at = now_utc()
    roles.add(role)
    session.commit()
    session.refresh(role)
    replace_role_permissions(session, role, permission_keys)
    session.commit()
    return role


def copy_department_template(
    session: Session, department_id: str, target_tenant_id: str, current_user: User
) -> Department:
    departments = DepartmentRepository(session)
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
    department = departments.get_by_code_for_tenant(
        target_tenant_id, source_department.code
    )
    if not department:
        department = Department(
            tenant_id=target_tenant_id,
            code=source_department.code,
            created_by_user_id=current_user.id,
        )
    department.source_template_department_id = source_department.id
    department.name = source_department.name
    department.description = source_department.description
    department.is_active = source_department.is_active
    department.is_template_locked = not target_tenant.is_primary
    department.is_global_template = target_tenant.is_primary
    department.updated_by_user_id = current_user.id
    department.updated_at = now_utc()
    departments.add(department)
    session.commit()
    session.refresh(department)
    return department


def copy_branch_template(
    session: Session, branch_id: str, target_tenant_id: str, current_user: User
) -> Branch:
    branches = BranchRepository(session)
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
    branch = branches.get_by_code_for_tenant(target_tenant_id, source_branch.code)
    if not branch:
        branch = Branch(
            tenant_id=target_tenant_id,
            code=source_branch.code,
            created_by_user_id=current_user.id,
        )
    branch.source_template_branch_id = source_branch.id
    branch.name = source_branch.name
    branch.area = source_branch.area
    branch.address = source_branch.address
    branch.city = source_branch.city
    branch.state = source_branch.state
    branch.is_active = source_branch.is_active
    branch.is_template_locked = not target_tenant.is_primary
    branch.is_global_template = target_tenant.is_primary
    branch.updated_by_user_id = current_user.id
    branch.updated_at = now_utc()
    branches.add(branch)
    session.commit()
    session.refresh(branch)
    return branch
