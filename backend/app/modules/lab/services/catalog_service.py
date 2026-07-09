import json

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.lab.models import LabResultTemplate, LabTestCatalog, LabTestPackage
from app.modules.lab.repositories import LabCatalogRepository
from app.modules.lab.schemas import (
    LabResultTemplateCreate,
    LabResultTemplateRead,
    LabTestCatalogCreate,
    LabTestCatalogUpdate,
    LabTestPackageCreate,
    LabTestPackageRead,
    LabTestPackageUpdate,
)
from app.modules.lab.services.read_models import package_read, template_read
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


def create_lab_test_record(
    session: Session, *, tenant_id: str, payload: LabTestCatalogCreate
) -> LabTestCatalog:
    enforce_module_enabled(session, tenant_id, "lab")
    data = payload.model_dump()
    data["branch_id"] = None
    test = LabTestCatalog.model_validate(data, update={"tenant_id": tenant_id})
    session.add(test)
    session.commit()
    session.refresh(test)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=test.branch_id,
        actor_user_id=payload.created_by_user_id,
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
    before = {key: getattr(test, key) for key in data}
    for key, value in data.items():
        setattr(test, key, value)
    test.updated_at = now_utc()
    session.add(test)
    session.commit()
    session.refresh(test)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=test.branch_id,
        actor_user_id=payload.updated_by_user_id,
        action="lab_test.updated",
        resource_type="lab_test_catalog",
        resource_id=test.id,
        purpose="diagnostics",
        changes=diff_changes(before, data),
    )
    return test


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
    session: Session, *, tenant_id: str, payload: LabTestPackageCreate
) -> LabTestPackageRead:
    enforce_module_enabled(session, tenant_id, "lab")
    catalog_repo = LabCatalogRepository(session)
    data = payload.model_dump(exclude={"test_ids"})
    data["branch_id"] = None
    package = LabTestPackage.model_validate(data, update={"tenant_id": tenant_id})
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
        actor_user_id=payload.created_by_user_id,
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
    before = {key: getattr(package, key) for key in data}
    for key, value in data.items():
        setattr(package, key, value)
    package.updated_at = now_utc()
    if payload.updated_by_user_id:
        package.updated_by_user_id = payload.updated_by_user_id
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
        actor_user_id=payload.updated_by_user_id,
        action="lab_package.updated",
        resource_type="lab_test_package",
        resource_id=package.id,
        purpose="diagnostics",
        changes=diff_changes(before, data),
    )
    return package_read(session, package)


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
