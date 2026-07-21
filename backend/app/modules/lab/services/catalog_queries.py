from sqlmodel import Session
from typing import Callable

from app.core.access_control import scoped_branch_id
from app.modules.identity.models import User
from app.modules.lab.models import LabTestCatalog
from app.modules.lab.repositories import (
    LabCatalogRepository,
    LabReferenceRepository,
    LabResultTemplateRepository,
)
from app.modules.lab.schemas import (
    LabConsultationReferralRead,
    LabResultTemplateRead,
    LabTestPackageRead,
)
from app.modules.lab.services.catalog import (
    normalize_local_lab_package,
    normalize_local_lab_test,
)
from app.modules.lab.services.read_models import package_read, template_read
from app.modules.lab.services.referrals import build_lab_consultation_referral_reads
from app.modules.subscriptions.service import enforce_module_enabled


def list_lab_consultation_referrals_service(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    current_user: User,
    module_enabled_checker: Callable[..., None] = enforce_module_enabled,
) -> list[LabConsultationReferralRead]:
    module_enabled_checker(session, tenant_id, "lab")
    branch_id = scoped_branch_id(current_user, branch_id)
    reference_repo = LabReferenceRepository(session)
    rows = reference_repo.list_consultation_referrals(
        tenant_id=tenant_id, branch_id=branch_id
    )
    consultation_ids = [consultation.id for consultation, *_rest in rows]
    referral_rows = reference_repo.list_structured_referrals(
        tenant_id=tenant_id, consultation_ids=consultation_ids
    )
    return build_lab_consultation_referral_reads(rows, referral_rows)


def list_available_lab_tests_service(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    search: str | None,
    current_user: User,
    module_enabled_checker: Callable[..., None] = enforce_module_enabled,
) -> list[dict[str, object]]:
    module_enabled_checker(session, tenant_id, "lab")
    scoped_branch_id(current_user, branch_id)
    catalog_repo = LabCatalogRepository(session)
    rows = [
        normalize_local_lab_test(row)
        for row in catalog_repo.list_active_tests(tenant_id=tenant_id, search=search)
    ]
    rows.extend(
        normalize_local_lab_package(row)
        for row in catalog_repo.list_active_packages(tenant_id=tenant_id, search=search)
    )
    return sorted(
        rows, key=lambda row: str(row.get("item_name") or row.get("name") or "")
    )


def list_popular_lab_tests_service(
    session: Session,
    *,
    tenant_id: str,
    limit: int,
    module_enabled_checker: Callable[..., None] = enforce_module_enabled,
) -> list[dict[str, object]]:
    module_enabled_checker(session, tenant_id, "lab")
    limit = max(1, min(limit, 20))
    rows = LabReferenceRepository(session).list_popular_referral_names(
        tenant_id=tenant_id, limit=limit
    )
    return [
        {
            "id": name,
            "name": name,
            "item_name": name,
            "usage_count": int(count),
            "source": "history",
        }
        for name, count in rows
    ]


def list_lab_tests_service(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    search: str | None,
    current_user: User,
    module_enabled_checker: Callable[..., None] = enforce_module_enabled,
) -> list[LabTestCatalog]:
    module_enabled_checker(session, tenant_id, "lab")
    scoped_branch_id(current_user, branch_id)
    return LabCatalogRepository(session).list_active_tests(
        tenant_id=tenant_id,
        search=search,
    )


def list_lab_packages_service(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    current_user: User,
    module_enabled_checker: Callable[..., None] = enforce_module_enabled,
) -> list[LabTestPackageRead]:
    module_enabled_checker(session, tenant_id, "lab")
    scoped_branch_id(current_user, branch_id)
    packages = LabCatalogRepository(session).list_active_packages(tenant_id=tenant_id)
    return [package_read(session, package) for package in packages]


def list_result_templates_service(
    session: Session,
    *,
    tenant_id: str,
    test_id: str | None,
    module_enabled_checker: Callable[..., None] = enforce_module_enabled,
) -> list[LabResultTemplateRead]:
    module_enabled_checker(session, tenant_id, "lab")
    rows = LabResultTemplateRepository(session).list_active(
        tenant_id=tenant_id,
        test_id=test_id,
    )
    return [template_read(row) for row in rows]
