from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, Query, UploadFile, status
from sqlmodel import Session

from app.core.auth import (
    get_current_user,
    require_any_permission,
    require_permission,
    require_super_admin,
)
from app.core.database import get_session
from app.core.list_filters import ListFilterOption, parse_list_filters, parse_list_sort
from app.core.pagination import Page
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.tenants.models import (
    Branch,
    Department,
    Tenant,
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
from app.modules.tenants.services.helpers import (
    assert_tenant_access as _assert_tenant_access,
)
from app.modules.tenants.services import (
    branch_service,
    department_service,
    tenant_service,
)
from app.modules.tenants.services.onboarding import (
    onboard_tenant as onboard_tenant_service,
)

router = APIRouter(prefix="/tenants")


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
    return tenant_service.create_tenant(
        session, payload=payload, current_user=current_user
    )


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
    return onboard_tenant_service(session, payload, current_user)


@router.get(
    "",
    response_model=list[TenantRead],
    dependencies=[Depends(require_permission(permissions.PLATFORM_TENANTS_MANAGE))],
)
def list_tenants(session: Session = Depends(get_session)) -> list[Tenant]:
    return tenant_service.list_tenants(session)


@router.get("/current/branding", response_model=TenantBrandingRead)
def get_current_tenant_branding(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Tenant:
    # Printable-document letterhead info (name/address/phone/email/logo) for the
    # caller's own tenant. Any authenticated user may read it — it's the same
    # non-sensitive branding already shown on invoices, not gated behind
    # platform.tenants.manage like the full tenant record.
    return tenant_service.get_tenant_or_404(session, current_user.tenant_id)


@router.get(
    "/{tenant_id}",
    response_model=TenantRead,
    dependencies=[Depends(require_permission(permissions.PLATFORM_TENANTS_MANAGE))],
)
def get_tenant(tenant_id: str, session: Session = Depends(get_session)) -> Tenant:
    return tenant_service.get_tenant_or_404(session, tenant_id)


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
    return tenant_service.update_tenant(
        session,
        tenant_id=tenant_id,
        payload=payload,
        current_user=current_user,
    )


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
    return await tenant_service.upload_tenant_logo(
        session,
        tenant_id=tenant_id,
        file=file,
        current_user=current_user,
    )


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
    return tenant_service.delete_tenant(
        session, tenant_id=tenant_id, current_user=current_user
    )


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
    return branch_service.create_branch(
        session, tenant_id=tenant_id, payload=payload, current_user=current_user
    )


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
    return branch_service.list_branches_for_request(
        session,
        tenant_id=tenant_id,
        request_tenant_id=request_tenant_id,
        current_user=current_user,
    )


@router.get("/{tenant_id}/branches/page", response_model=Page[BranchRead])
def list_branch_page(
    tenant_id: str,
    request_tenant_id: str = Depends(require_tenant_id),
    q: str | None = Query(default=None),
    filters: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(
        require_any_permission(
            permissions.SETTINGS_MANAGE,
            permissions.SETTINGS_READ,
            permissions.BRANCHES_MANAGE,
            permissions.BRANCHES_READ,
        )
    ),
    session: Session = Depends(get_session),
) -> Page[BranchRead]:
    return branch_service.list_branch_page_for_request(
        session,
        tenant_id=tenant_id,
        request_tenant_id=request_tenant_id,
        current_user=current_user,
        q=q,
        list_filters=parse_list_filters(filters),
        list_sort=parse_list_sort(sort),
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{tenant_id}/branches/filter-options",
    response_model=dict[str, list[ListFilterOption]],
)
def list_branch_filter_options(
    tenant_id: str,
    request_tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.SETTINGS_MANAGE,
            permissions.SETTINGS_READ,
            permissions.BRANCHES_MANAGE,
            permissions.BRANCHES_READ,
        )
    ),
    session: Session = Depends(get_session),
) -> dict[str, list[ListFilterOption]]:
    return branch_service.list_branch_filter_options_for_request(
        session,
        tenant_id=tenant_id,
        request_tenant_id=request_tenant_id,
        current_user=current_user,
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
    return branch_service.update_branch(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        payload=payload,
        current_user=current_user,
    )


@router.post(
    "/branches/{branch_id}/assign/{target_tenant_id}", response_model=BranchRead
)
def assign_branch_to_tenant(
    branch_id: str,
    target_tenant_id: str,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> Branch:
    return branch_service.assign_branch_to_tenant(
        session,
        branch_id=branch_id,
        target_tenant_id=target_tenant_id,
        current_user=current_user,
    )


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
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    return branch_service.update_branch_status(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        payload=payload,
        current_user=current_user,
    )


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
    return branch_service.delete_branch(
        session, tenant_id=tenant_id, branch_id=branch_id, current_user=current_user
    )


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
    return department_service.create_department(
        session, tenant_id=tenant_id, payload=payload, current_user=current_user
    )


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
    return department_service.assign_department_to_tenant(
        session,
        department_id=department_id,
        target_tenant_id=target_tenant_id,
        current_user=current_user,
    )


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
    return department_service.list_departments(session, tenant_id=tenant_id)


@router.get("/{tenant_id}/departments/page", response_model=Page[DepartmentRead])
def list_department_page(
    tenant_id: str,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    q: str | None = Query(default=None),
    filters: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(
        require_any_permission(
            permissions.SETTINGS_MANAGE,
            permissions.SETTINGS_READ,
            permissions.DEPARTMENTS_MANAGE,
            permissions.DEPARTMENTS_READ,
        )
    ),
    session: Session = Depends(get_session),
) -> Page[DepartmentRead]:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    return department_service.list_department_page(
        session,
        tenant_id=tenant_id,
        q=q,
        list_filters=parse_list_filters(filters),
        list_sort=parse_list_sort(sort),
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{tenant_id}/departments/filter-options",
    response_model=dict[str, list[ListFilterOption]],
)
def list_department_filter_options(
    tenant_id: str,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
    current_user: User = Depends(
        require_any_permission(
            permissions.SETTINGS_MANAGE,
            permissions.SETTINGS_READ,
            permissions.DEPARTMENTS_MANAGE,
            permissions.DEPARTMENTS_READ,
        )
    ),
    session: Session = Depends(get_session),
) -> dict[str, list[ListFilterOption]]:
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    return department_service.list_department_filter_options(
        session,
        tenant_id=tenant_id,
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
    return department_service.get_department(
        session, tenant_id=tenant_id, department_id=department_id
    )


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
    return department_service.update_department(
        session,
        tenant_id=tenant_id,
        department_id=department_id,
        payload=payload,
        current_user=current_user,
    )


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
    _assert_tenant_access(current_user, tenant_id, x_tenant_id)
    return department_service.update_department_status(
        session,
        tenant_id=tenant_id,
        department_id=department_id,
        payload=payload,
        current_user=current_user,
    )


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
    return department_service.delete_department(
        session,
        tenant_id=tenant_id,
        department_id=department_id,
        current_user=current_user,
    )
