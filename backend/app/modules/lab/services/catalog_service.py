import json

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access, scoped_branch_id
from app.core.list_filters import ListFilter, ListFilterOption, ListSort
from app.core.pagination import Page
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.item_catalog_validation import validate_unique_item_name
from app.modules.lab.models import LabResultTemplate, LabTestCatalog, LabTestPackage
from app.modules.lab.repositories import LabCatalogRepository
from app.modules.lab.schemas import (
    LabResultTemplateCreate,
    LabResultTemplateRead,
    LabTestCatalogCreate,
    LabTestCatalogRead,
    LabTestCatalogUpdate,
    LabTestPackageCreate,
    LabTestPackageRead,
    LabTestPackageUpdate,
)
from app.modules.lab.services.read_models import package_read, template_read
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


def create_lab_test_record(
    session: Session,
    *,
    tenant_id: str,
    payload: LabTestCatalogCreate,
    current_user: User | None = None,
) -> LabTestCatalog:
    enforce_module_enabled(session, tenant_id, "lab")
    data = payload.model_dump()
    data["branch_id"] = None
    data["name"] = validate_unique_item_name(
        session, tenant_id=tenant_id, name=payload.name
    )
    actor_user_id = payload.created_by_user_id or getattr(current_user, "id", None)
    test = LabTestCatalog.model_validate(
        data,
        update={
            "tenant_id": tenant_id,
            "created_by_user_id": actor_user_id,
            "updated_by_user_id": actor_user_id,
        },
    )
    session.add(test)
    session.commit()
    session.refresh(test)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=test.branch_id,
        actor_user_id=actor_user_id,
        action="lab_test.created",
        resource_type="lab_test_catalog",
        resource_id=test.id,
        purpose="diagnostics",
    )
    return test


def update_lab_test_record(
    session: Session,
    *,
    tenant_id: str,
    test_id: str,
    payload: LabTestCatalogUpdate,
    current_user: User,
) -> LabTestCatalog:
    enforce_module_enabled(session, tenant_id, "lab")
    test = LabCatalogRepository(session).get_test_for_tenant(
        tenant_id=tenant_id,
        test_id=test_id,
    )
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lab test not found"
        )
    require_user_branch_access(current_user, test.branch_id)
    data = payload.model_dump(exclude_unset=True)
    if "branch_id" in data:
        data["branch_id"] = None
    if data.get("name"):
        data["name"] = validate_unique_item_name(
            session,
            tenant_id=tenant_id,
            name=data["name"],
            exclude_model=LabTestCatalog,
            exclude_id=test.id,
        )
    before = {key: getattr(test, key) for key in data}
    for key, value in data.items():
        setattr(test, key, value)
    test.updated_at = now_utc()
    actor_user_id = payload.updated_by_user_id or current_user.id
    test.updated_by_user_id = actor_user_id
    session.add(test)
    session.commit()
    session.refresh(test)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=test.branch_id,
        actor_user_id=actor_user_id,
        action="lab_test.updated",
        resource_type="lab_test_catalog",
        resource_id=test.id,
        purpose="diagnostics",
        changes=diff_changes(before, data),
    )
    return test


def list_lab_test_page(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    include_inactive: bool,
    q: str | None,
    list_filters: list[ListFilter],
    list_sort: ListSort | None,
    limit: int,
    offset: int,
    current_user: User,
) -> Page[LabTestCatalogRead]:
    enforce_module_enabled(session, tenant_id, "lab")
    branch_id = scoped_branch_id(current_user, branch_id)
    repository = LabCatalogRepository(session)
    rows = repository.list_test_page(
        tenant_id=tenant_id,
        branch_id=branch_id,
        include_inactive=include_inactive,
        q=q,
        list_filters=list_filters,
        list_sort=list_sort,
        limit=limit,
        offset=offset,
    )
    total = repository.count_test_page(
        tenant_id=tenant_id,
        branch_id=branch_id,
        include_inactive=include_inactive,
        q=q,
        list_filters=list_filters,
    )
    return Page(
        items=[
            LabTestCatalogRead.model_validate(row, from_attributes=True) for row in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


def list_lab_test_filter_options(
    session: Session,
    *,
    tenant_id: str,
) -> dict[str, list[ListFilterOption]]:
    enforce_module_enabled(session, tenant_id, "lab")
    return LabCatalogRepository(session).catalog_filter_options(
        tenant_id=tenant_id,
        catalog="tests",
    )


def delete_lab_test_record(
    session: Session, *, tenant_id: str, test_id: str, current_user: User
) -> LabTestCatalog:
    enforce_module_enabled(session, tenant_id, "lab")
    test = LabCatalogRepository(session).get_test_for_tenant(
        tenant_id=tenant_id,
        test_id=test_id,
    )
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lab test not found"
        )
    require_user_branch_access(current_user, test.branch_id)
    test.is_active = False
    test.updated_at = now_utc()
    test.updated_by_user_id = current_user.id
    session.add(test)
    session.commit()
    session.refresh(test)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=test.branch_id,
        actor_user_id=current_user.id,
        action="lab_test.deleted",
        resource_type="lab_test_catalog",
        resource_id=test.id,
        purpose="diagnostics",
    )
    return test


def create_lab_package_record(
    session: Session,
    *,
    tenant_id: str,
    payload: LabTestPackageCreate,
    current_user: User | None = None,
) -> LabTestPackageRead:
    enforce_module_enabled(session, tenant_id, "lab")
    catalog_repo = LabCatalogRepository(session)
    data = payload.model_dump(exclude={"test_ids"})
    data["branch_id"] = None
    data["name"] = validate_unique_item_name(
        session, tenant_id=tenant_id, name=payload.name
    )
    actor_user_id = payload.created_by_user_id or getattr(current_user, "id", None)
    package = LabTestPackage.model_validate(
        data,
        update={
            "tenant_id": tenant_id,
            "created_by_user_id": actor_user_id,
            "updated_by_user_id": actor_user_id,
        },
    )
    session.add(package)
    session.commit()
    session.refresh(package)
    for test_id in payload.test_ids:
        test = catalog_repo.get_test_for_tenant(
            tenant_id=tenant_id,
            test_id=test_id,
        )
        if not test:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid package test"
            )
        catalog_repo.add_package_item(
            tenant_id=tenant_id,
            package_id=package.id,
            test_id=test.id,
        )
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=package.branch_id,
        actor_user_id=actor_user_id,
        action="lab_package.created",
        resource_type="lab_test_package",
        resource_id=package.id,
        purpose="diagnostics",
    )
    return package_read(session, package)


def update_lab_package_record(
    session: Session,
    *,
    tenant_id: str,
    package_id: str,
    payload: LabTestPackageUpdate,
    current_user: User,
) -> LabTestPackageRead:
    enforce_module_enabled(session, tenant_id, "lab")
    catalog_repo = LabCatalogRepository(session)
    package = catalog_repo.get_package_for_tenant(
        tenant_id=tenant_id,
        package_id=package_id,
    )
    if not package:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lab package not found"
        )
    require_user_branch_access(current_user, package.branch_id)
    data = payload.model_dump(exclude_unset=True, exclude={"test_ids"})
    if "branch_id" in data:
        data["branch_id"] = None
    if data.get("name"):
        data["name"] = validate_unique_item_name(
            session,
            tenant_id=tenant_id,
            name=data["name"],
            exclude_model=LabTestPackage,
            exclude_id=package.id,
        )
    before = {key: getattr(package, key) for key in data}
    for key, value in data.items():
        setattr(package, key, value)
    package.updated_at = now_utc()
    actor_user_id = payload.updated_by_user_id or current_user.id
    package.updated_by_user_id = actor_user_id
    if payload.test_ids is not None:
        valid_test_ids: list[str] = []
        for test_id in payload.test_ids:
            test = catalog_repo.get_test_for_tenant(
                tenant_id=tenant_id,
                test_id=test_id,
            )
            if not test:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid package test",
                )
            valid_test_ids.append(test.id)
        catalog_repo.replace_package_items(
            tenant_id=tenant_id,
            package_id=package.id,
            test_ids=valid_test_ids,
        )
    session.add(package)
    session.commit()
    session.refresh(package)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=package.branch_id,
        actor_user_id=actor_user_id,
        action="lab_package.updated",
        resource_type="lab_test_package",
        resource_id=package.id,
        purpose="diagnostics",
        changes=diff_changes(before, data),
    )
    return package_read(session, package)


def list_lab_package_page(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    include_inactive: bool,
    q: str | None,
    list_filters: list[ListFilter],
    list_sort: ListSort | None,
    limit: int,
    offset: int,
    current_user: User,
) -> Page[LabTestPackageRead]:
    enforce_module_enabled(session, tenant_id, "lab")
    branch_id = scoped_branch_id(current_user, branch_id)
    repository = LabCatalogRepository(session)
    rows = repository.list_package_page(
        tenant_id=tenant_id,
        branch_id=branch_id,
        include_inactive=include_inactive,
        q=q,
        list_filters=list_filters,
        list_sort=list_sort,
        limit=limit,
        offset=offset,
    )
    total = repository.count_package_page(
        tenant_id=tenant_id,
        branch_id=branch_id,
        include_inactive=include_inactive,
        q=q,
        list_filters=list_filters,
    )
    return Page(
        items=[package_read(session, row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


def list_lab_package_filter_options(
    session: Session,
    *,
    tenant_id: str,
) -> dict[str, list[ListFilterOption]]:
    enforce_module_enabled(session, tenant_id, "lab")
    return LabCatalogRepository(session).catalog_filter_options(
        tenant_id=tenant_id,
        catalog="packages",
    )


def delete_lab_package_record(
    session: Session, *, tenant_id: str, package_id: str, current_user: User
) -> LabTestPackageRead:
    enforce_module_enabled(session, tenant_id, "lab")
    package = LabCatalogRepository(session).get_package_for_tenant(
        tenant_id=tenant_id,
        package_id=package_id,
    )
    if not package:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lab package not found"
        )
    require_user_branch_access(current_user, package.branch_id)
    package.is_active = False
    package.updated_at = now_utc()
    package.updated_by_user_id = current_user.id
    session.add(package)
    session.commit()
    session.refresh(package)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=package.branch_id,
        actor_user_id=current_user.id,
        action="lab_package.deleted",
        resource_type="lab_test_package",
        resource_id=package.id,
        purpose="diagnostics",
    )
    return package_read(session, package)


def create_result_template_record(
    session: Session, *, tenant_id: str, payload: LabResultTemplateCreate
) -> LabResultTemplateRead:
    enforce_module_enabled(session, tenant_id, "lab")
    if payload.test_id:
        test = LabCatalogRepository(session).get_test_for_tenant(
            tenant_id=tenant_id,
            test_id=payload.test_id,
        )
        if not test:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lab test"
            )
    template = LabResultTemplate(
        tenant_id=tenant_id,
        test_id=payload.test_id,
        name=payload.name,
        content_json=json.dumps(payload.content),
        created_by_user_id=payload.created_by_user_id,
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return template_read(template)
