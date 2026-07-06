import re
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.core.uploads import save_upload
from app.core.auth import (
    get_current_user,
    require_any_permission,
    require_permission,
    require_super_admin,
)
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.audit.models import AuditEvent
from app.modules.files.service import record_file_document
from app.modules.identity import permissions
from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole
from app.modules.identity.security import hash_password
from app.modules.settings.numbering import next_document_number
from app.modules.settings.models import SettingKey, SettingScope
from app.modules.settings.service import upsert_setting
from app.modules.subscriptions.models import (
    SubscriptionInvoice,
    SubscriptionPlan,
    SubscriptionStatus,
    TenantSubscription,
)
from app.modules.subscriptions.service import (
    create_default_trial_subscription,
    get_active_subscription,
    next_subscription_invoice_number,
    plan_duration_days,
)
from app.modules.tenants.models import (
    Branch,
    Department,
    Tenant,
    TenantStatus,
    TenantType,
    now_utc,
)
from app.modules.tenants.schemas import (
    BranchCreate,
    BranchRead,
    BranchUpdate,
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
    TenantBrandingRead,
    TenantCreate,
    TenantOnboardingCreate,
    TenantOnboardingRead,
    TenantRead,
    TenantUpdate,
)

router = APIRouter(prefix="/tenants")
PRIMARY_TENANT_NAME = "MedizinHub HMS"
TENANT_ADMIN_DEFAULT_PERMISSION_KEYS = [
    permission_key
    for permission_key in permissions.PERMISSION_CATALOG
    if not permission_key.startswith("platform.")
]


def _assert_tenant_access(
    user: User, tenant_id: str, request_tenant_id: str | None
) -> None:
    if user.is_super_admin:
        return
    if request_tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-tenant access is not allowed",
        )


def _assert_department_editable_by_actor(
    department: Department, current_user: User
) -> None:
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


def _department_code(
    session: Session,
    tenant_id: str,
    name: str,
    current_department_id: str | None = None,
) -> str:
    base = re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")[:36] or "DEPT"
    code = base
    suffix = 2
    while True:
        existing = session.exec(
            select(Department).where(
                Department.tenant_id == tenant_id, Department.code == code
            )
        ).first()
        if not existing or existing.id == current_department_id:
            return code
        code = f"{base[:35]}{suffix}"
        suffix += 1


def _normal_key(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).lower()


def _assert_unique_tenant_values(
    session: Session,
    *,
    name: str | None,
    email: str | None,
    phone: str | None,
    current_tenant_id: str | None = None,
) -> None:
    payload_name = _normal_key(name)
    payload_email = _normal_key(email)
    payload_phone = _normal_key(phone)
    enforce_name = bool(payload_name and (payload_email or payload_phone))
    tenants = session.exec(select(Tenant)).all()
    for tenant in tenants:
        if tenant.id == current_tenant_id:
            continue
        if enforce_name and _normal_key(tenant.name) == payload_name:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tenant already exists with this name",
            )
        if payload_email and _normal_key(tenant.email) == payload_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tenant already exists with this email",
            )
        if payload_phone and _normal_key(tenant.phone) == payload_phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tenant already exists with this phone",
            )


def _get_department_or_404(
    session: Session, tenant_id: str, department_id: str
) -> Department:
    department = session.get(Department, department_id)
    if not department or department.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Medical department not found"
        )
    return department


def _get_branch_or_404(session: Session, tenant_id: str, branch_id: str) -> Branch:
    branch = session.get(Branch, branch_id)
    if not branch or branch.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found"
        )
    return branch


def _ensure_permission(session: Session, key: str) -> Permission:
    permission = session.exec(select(Permission).where(Permission.key == key)).first()
    if permission:
        return permission
    permission = Permission(key=key, description=key.replace(".", " ").title())
    session.add(permission)
    session.commit()
    session.refresh(permission)
    return permission


def _replace_role_permissions(
    session: Session, role: Role, permission_keys: list[str]
) -> None:
    for row in list(
        session.exec(
            select(RolePermission).where(RolePermission.role_id == role.id)
        ).all()
    ):
        session.delete(row)
    for permission_key in permission_keys:
        permission = _ensure_permission(session, permission_key)
        session.add(RolePermission(role_id=role.id, permission_id=permission.id))


def _role_permission_keys(session: Session, role: Role) -> list[str]:
    return list(
        session.exec(
            select(Permission.key)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role.id)
        ).all()
    )


def _ensure_tenant_admin_role(
    session: Session, tenant_id: str, current_user: User
) -> Role:
    role = session.exec(
        select(Role).where(Role.tenant_id == tenant_id, Role.key == "tenant_admin")
    ).first()
    if role:
        return role
    primary_template = session.exec(
        select(Role)
        .join(Tenant, Tenant.id == Role.tenant_id)
        .where(Tenant.is_primary == True, Role.key == "tenant_admin")  # noqa: E712
    ).first()
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
    session.add(role)
    session.commit()
    session.refresh(role)
    _replace_role_permissions(
        session,
        role,
        _role_permission_keys(session, primary_template)
        if primary_template
        else TENANT_ADMIN_DEFAULT_PERMISSION_KEYS,
    )
    session.commit()
    return role


def _copy_role_template(
    session: Session, role_id: str, target_tenant_id: str, current_user: User
) -> Role:
    source_role = session.get(Role, role_id)
    target_tenant = session.get(Tenant, target_tenant_id)
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
    permission_keys = _role_permission_keys(session, source_role)
    role = session.exec(
        select(Role).where(
            Role.tenant_id == target_tenant_id, Role.key == source_role.key
        )
    ).first()
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
    session.add(role)
    session.commit()
    session.refresh(role)
    _replace_role_permissions(session, role, permission_keys)
    session.commit()
    return role


def _copy_department_template(
    session: Session, department_id: str, target_tenant_id: str, current_user: User
) -> Department:
    source_department = session.get(Department, department_id)
    target_tenant = session.get(Tenant, target_tenant_id)
    if not source_department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Source department not found"
        )
    if not target_tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Target tenant not found"
        )
    department = session.exec(
        select(Department).where(
            Department.tenant_id == target_tenant_id,
            Department.code == source_department.code,
        )
    ).first()
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
    session.add(department)
    session.commit()
    session.refresh(department)
    return department


def _copy_branch_template(
    session: Session, branch_id: str, target_tenant_id: str, current_user: User
) -> Branch:
    source_branch = session.get(Branch, branch_id)
    target_tenant = session.get(Tenant, target_tenant_id)
    if not source_branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Source branch not found"
        )
    if not target_tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Target tenant not found"
        )
    branch = session.exec(
        select(Branch).where(
            Branch.tenant_id == target_tenant_id, Branch.code == source_branch.code
        )
    ).first()
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
    session.add(branch)
    session.commit()
    session.refresh(branch)
    return branch


@router.post(
    "",
    response_model=TenantRead,
    status_code=status.HTTP_201_CREATED,
)
def create_tenant(
    payload: TenantCreate,
    current_user: User = Depends(
        require_permission(permissions.PLATFORM_TENANTS_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> Tenant:
    if payload.is_primary:
        existing_primary = session.exec(
            select(Tenant).where(Tenant.is_primary == True)  # noqa: E712
        ).first()  # noqa: E712
        if existing_primary:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Primary tenant already exists",
            )
    _assert_unique_tenant_values(
        session, name=payload.name, email=payload.email, phone=payload.phone
    )
    tenant = Tenant.model_validate(
        payload,
        update={
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
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


@router.post(
    "/onboard",
    response_model=TenantOnboardingRead,
    status_code=status.HTTP_201_CREATED,
)
def onboard_tenant(
    payload: TenantOnboardingCreate,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> TenantOnboardingRead:
    _assert_unique_tenant_values(
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
    plan = session.get(SubscriptionPlan, plan_id) if plan_id else None
    if plan_id and (not plan or not plan.is_active):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid subscription plan"
        )

    role_template_ids = list(dict.fromkeys(payload.role_template_ids))
    department_template_ids = list(dict.fromkeys(payload.department_template_ids))
    branch_template_ids = list(dict.fromkeys(payload.branch_template_ids))
    for role_id in role_template_ids:
        source_role = session.get(Role, role_id)
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
        if not session.get(Department, department_id):
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
        source_branch = session.get(Branch, branch_id)
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
    session.add(tenant)
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
        session.add(branch)
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
        for existing in session.exec(
            select(TenantSubscription).where(
                TenantSubscription.tenant_id == tenant.id,
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
            )
        ).all():
            existing.is_active = False
            existing.status = SubscriptionStatus.EXPIRED
            existing.updated_by_user_id = current_user.id
            existing.updated_at = now_utc()
            session.add(existing)
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
        session.add(subscription)
        session.commit()
        session.refresh(subscription)
        subscription_id = subscription.id
        session.add(
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
        tenant_admin_role = _ensure_tenant_admin_role(session, tenant.id, current_user)
        role_count += 1
        role_template_ids = [
            role_id
            for role_id in role_template_ids
            if (source_role := session.get(Role, role_id))
            and source_role.key != tenant_admin_role.key
        ]
    for role_id in role_template_ids:
        _copy_role_template(session, role_id, tenant.id, current_user)
        role_count += 1

    for department_id in department_template_ids:
        _copy_department_template(session, department_id, tenant.id, current_user)
    for branch_id in branch_template_ids:
        branches.append(
            _copy_branch_template(session, branch_id, tenant.id, current_user)
        )

    admin_user_id = None
    if payload.admin_user:
        existing_admin = session.exec(
            select(User).where(
                User.tenant_id == tenant.id,
                User.email == payload.admin_user.email.strip().lower(),
            )
        ).first()
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
        session.add(user)
        session.commit()
        session.refresh(user)
        tenant_admin_role = _ensure_tenant_admin_role(session, tenant.id, current_user)
        if not session.exec(
            select(UserRole).where(
                UserRole.user_id == user.id, UserRole.role_id == tenant_admin_role.id
            )
        ).first():
            session.add(
                UserRole(
                    user_id=user.id, role_id=tenant_admin_role.id, tenant_id=tenant.id
                )
            )
            session.commit()
        admin_user_id = user.id

    session.add(
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


@router.get(
    "",
    response_model=list[TenantRead],
    dependencies=[Depends(require_permission(permissions.PLATFORM_TENANTS_MANAGE))],
)
def list_tenants(session: Session = Depends(get_session)) -> list[Tenant]:
    return list(
        session.exec(
            select(Tenant).order_by(Tenant.updated_at.desc(), Tenant.created_at.desc())
        ).all()
    )


@router.get("/current/branding", response_model=TenantBrandingRead)
def get_current_tenant_branding(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Tenant:
    # Printable-document letterhead info (name/address/phone/email/logo) for the
    # caller's own tenant. Any authenticated user may read it — it's the same
    # non-sensitive branding already shown on invoices, not gated behind
    # platform.tenants.manage like the full tenant record.
    tenant = session.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    return tenant


@router.get(
    "/{tenant_id}",
    response_model=TenantRead,
    dependencies=[Depends(require_permission(permissions.PLATFORM_TENANTS_MANAGE))],
)
def get_tenant(tenant_id: str, session: Session = Depends(get_session)) -> Tenant:
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    return tenant


@router.patch(
    "/{tenant_id}",
    response_model=TenantRead,
)
def update_tenant(
    tenant_id: str,
    payload: TenantUpdate,
    current_user: User = Depends(
        require_permission(permissions.PLATFORM_TENANTS_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> Tenant:
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    updates = payload.model_dump(exclude_unset=True)
    for required_key in ("name", "tenant_type", "status", "country"):
        if updates.get(required_key) is None:
            updates.pop(required_key, None)
    if tenant.is_primary:
        if updates.get("name") not in (None, PRIMARY_TENANT_NAME):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Primary tenant name is fixed",
            )
        if updates.get("tenant_type") not in (
            None,
            TenantType.PRIMARY,
            TenantType.PRIMARY.value,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Primary tenant type is fixed",
            )
        if updates.get("status") not in (None, TenantStatus.ACTIVE):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Primary tenant must remain active",
            )
    changed_name = (
        updates.get("name")
        if "name" in updates
        and _normal_key(updates.get("name")) != _normal_key(tenant.name)
        else None
    )
    changed_email = (
        updates.get("email")
        if "email" in updates
        and _normal_key(updates.get("email")) != _normal_key(tenant.email)
        else None
    )
    changed_phone = (
        updates.get("phone")
        if "phone" in updates
        and _normal_key(updates.get("phone")) != _normal_key(tenant.phone)
        else None
    )
    _assert_unique_tenant_values(
        session,
        name=changed_name,
        email=changed_email,
        phone=changed_phone,
        current_tenant_id=tenant.id,
    )
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


@router.post(
    "/{tenant_id}/logo",
    response_model=TenantRead,
)
async def upload_tenant_logo(
    tenant_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(
        require_permission(permissions.PLATFORM_TENANTS_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> Tenant:
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Upload an image logo"
        )
    _filename, url_path, _ct = await save_upload(file, f"tenant_logo_{tenant.id}")
    tenant.logo_url = url_path
    tenant.updated_by_user_id = current_user.id
    tenant.updated_at = now_utc()
    session.add(tenant)
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.TENANT,
        scope_id=tenant.id,
        module="invoice",
        key=SettingKey.INVOICE_LOGO_URL,
        value=url_path,
        actor_user_id=current_user.id,
    )
    record_file_document(
        session,
        tenant_id=tenant.id,
        file_name=file.filename or _filename,
        file_url=url_path,
        content_type=file.content_type,
        category="logo",
        source_module="tenants",
        attached_to_doctype="Tenant",
        attached_to_name=tenant.id,
        attached_to_field="logo_url",
        attached_to_label="Tenant Logo",
        uploaded_by_user_id=current_user.id,
    )
    session.add(
        AuditEvent(
            tenant_id=tenant.id,
            actor_user_id=current_user.id,
            action="tenant.logo_uploaded",
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
    current_user: User = Depends(
        require_permission(permissions.PLATFORM_TENANTS_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> dict[str, str | bool]:
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    if tenant.is_primary:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Primary tenant cannot be deleted",
        )
    tenant.status = TenantStatus.SUSPENDED
    tenant.updated_by_user_id = current_user.id
    tenant.updated_at = now_utc()
    session.add(tenant)
    session.add(
        AuditEvent(
            tenant_id=tenant.id,
            actor_user_id=current_user.id,
            action="tenant.deactivated",
            resource_type="tenant",
            resource_id=tenant.id,
            purpose="platform_management_soft_delete",
        )
    )
    session.commit()
    return {
        "deleted": False,
        "deactivated": True,
        "mode": "deactivated",
        "tenant_id": tenant.id,
    }


@router.post(
    "/{tenant_id}/branches",
    response_model=BranchRead,
    status_code=status.HTTP_201_CREATED,
)
def create_branch(
    tenant_id: str,
    payload: BranchCreate,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(
        require_any_permission(
            permissions.BRANCHES_MANAGE,
            permissions.BRANCHES_CREATE,
            permissions.SETTINGS_MANAGE,
        )
    ),
    session: Session = Depends(get_session),
) -> Branch:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    if not current_user.is_super_admin:
        _subscription, plan = get_active_subscription(session, tenant_id)
        branch_count = len(
            session.exec(
                select(Branch.id).where(
                    Branch.tenant_id == tenant_id,
                    Branch.is_active == True,  # noqa: E712
                )  # noqa: E712
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
            select(Branch)
            .where(Branch.tenant_id == tenant_id)
            .order_by(Branch.created_at.desc(), Branch.name.asc())
        ).all()
    )


@router.patch("/{tenant_id}/branches/{branch_id}", response_model=BranchRead)
def update_branch(
    tenant_id: str,
    branch_id: str,
    payload: BranchUpdate,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(
        require_any_permission(
            permissions.BRANCHES_MANAGE,
            permissions.BRANCHES_EDIT,
            permissions.SETTINGS_MANAGE,
        )
    ),
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


@router.post(
    "/branches/{branch_id}/assign/{target_tenant_id}", response_model=BranchRead
)
def assign_branch_to_tenant(
    branch_id: str,
    target_tenant_id: str,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> Branch:
    source_branch = session.get(Branch, branch_id)
    target_tenant = session.get(Tenant, target_tenant_id)
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

    branch = session.exec(
        select(Branch).where(
            Branch.tenant_id == target_tenant_id, Branch.code == source_branch.code
        )
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
    current_user: User = Depends(
        require_any_permission(
            permissions.BRANCHES_MANAGE,
            permissions.BRANCHES_EDIT,
            permissions.SETTINGS_MANAGE,
        )
    ),
    session: Session = Depends(get_session),
) -> Branch:
    if payload.is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="is_active is required"
        )
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
    current_user: User = Depends(
        require_any_permission(
            permissions.BRANCHES_MANAGE,
            permissions.BRANCHES_DELETE,
            permissions.SETTINGS_MANAGE,
        )
    ),
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
    current_user: User = Depends(
        require_any_permission(
            permissions.DEPARTMENTS_MANAGE,
            permissions.DEPARTMENTS_CREATE,
            permissions.SETTINGS_MANAGE,
        )
    ),
    session: Session = Depends(get_session),
) -> Department:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    if payload.branch_id:
        branch = session.get(Branch, payload.branch_id)
        if not branch or branch.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch is not part of this tenant",
            )

    existing_departments = session.exec(
        select(Department).where(Department.tenant_id == tenant_id)
    ).all()
    normalized_name = _normal_key(payload.name)
    conflicting_scope = next(
        (
            department
            for department in existing_departments
            if _normal_key(department.name) == normalized_name
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
            and _normal_key(department.name) == normalized_name
        ),
        None,
    )
    if existing:
        _assert_department_editable_by_actor(existing, current_user)
        existing.description = (
            payload.description
            if payload.description is not None
            else existing.description
        )
        existing.is_active = payload.is_active
        existing.updated_by_user_id = current_user.id
        existing.updated_at = now_utc()
        session.add(existing)
        session.add(
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


@router.post(
    "/departments/{department_id}/assign/{target_tenant_id}",
    response_model=DepartmentRead,
)
def assign_department_to_tenant(
    department_id: str,
    target_tenant_id: str,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> Department:
    source_department = session.get(Department, department_id)
    target_tenant = session.get(Tenant, target_tenant_id)
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

    department = session.exec(
        select(Department).where(
            Department.tenant_id == target_tenant_id,
            Department.code == source_department.code,
        )
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
            select(Department)
            .where(Department.tenant_id == tenant_id)
            .order_by(Department.created_at)
        ).all()
    )


@router.get("/{tenant_id}/departments/{department_id}", response_model=DepartmentRead)
def get_department(
    tenant_id: str,
    department_id: str,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(
        require_any_permission(
            permissions.DEPARTMENTS_MANAGE,
            permissions.DEPARTMENTS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
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
    current_user: User = Depends(
        require_any_permission(
            permissions.DEPARTMENTS_MANAGE,
            permissions.DEPARTMENTS_EDIT,
            permissions.SETTINGS_MANAGE,
        )
    ),
    session: Session = Depends(get_session),
) -> Department:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    department = _get_department_or_404(session, tenant_id, department_id)
    _assert_department_editable_by_actor(department, current_user)
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("branch_id"):
        branch = session.get(Branch, updates["branch_id"])
        if not branch or branch.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch is not part of this tenant",
            )
    next_name = updates.get("name", department.name)
    next_branch_id = updates.get("branch_id", department.branch_id)
    conflict = session.exec(
        select(Department).where(
            Department.tenant_id == tenant_id,
            Department.id != department.id,
            Department.is_active.is_(True),
        )
    ).all()
    conflict = next(
        (
            row
            for row in conflict
            if _normal_key(row.name) == _normal_key(next_name)
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
        department.code = _department_code(
            session, tenant_id, updates["name"], department.id
        )
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


@router.post(
    "/{tenant_id}/departments/{department_id}/status", response_model=DepartmentRead
)
def update_department_status(
    tenant_id: str,
    department_id: str,
    payload: DepartmentUpdate,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(
        require_any_permission(
            permissions.DEPARTMENTS_MANAGE,
            permissions.DEPARTMENTS_EDIT,
            permissions.SETTINGS_MANAGE,
        )
    ),
    session: Session = Depends(get_session),
) -> Department:
    if payload.is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="is_active is required"
        )
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


@router.delete(
    "/{tenant_id}/departments/{department_id}", status_code=status.HTTP_200_OK
)
def delete_department(
    tenant_id: str,
    department_id: str,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(
        require_any_permission(
            permissions.DEPARTMENTS_MANAGE,
            permissions.DEPARTMENTS_DELETE,
            permissions.SETTINGS_MANAGE,
        )
    ),
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
