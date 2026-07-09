from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session

from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.lab.models import (
    LabOrder,
    LabOrderStatus,
    LabTestCatalog,
)
from app.modules.lab.repositories import (
    LabCatalogRepository,
    LabReferenceRepository,
)
from app.modules.lab.services.catalog import (
    _normalize_local_lab_package,
    _normalize_local_lab_test,
)
from app.modules.lab.services.catalog_service import (
    create_lab_package_record,
    create_lab_test_record,
    create_result_template_record,
    delete_lab_package_record,
    delete_lab_test_record,
    update_lab_package_record,
    update_lab_test_record,
)
from app.modules.lab.services.order_service import (
    create_lab_order_from_consultation_record,
    create_lab_order_record,
    get_lab_order_detail,
    list_lab_orders_records,
    update_lab_order_status_record,
)
from app.modules.lab.services.read_models import _package_read, _template_read
from app.modules.lab.services.referrals import build_lab_consultation_referral_reads
from app.modules.lab.services.report_service import render_lab_report_pdf
from app.modules.lab.services.result_service import add_lab_result_record
from app.modules.lab.services.sample_service import collect_lab_sample_record
from app.modules.lab.schemas import (
    LabConsultationReferralRead,
    LabOrderCreate,
    LabOrderDetailRead,
    LabOrderFromConsultation,
    LabOrderRead,
    LabOrderStatusUpdate,
    LabResultCreate,
    LabResultTemplateCreate,
    LabResultTemplateRead,
    LabSampleCreate,
    LabTestCatalogCreate,
    LabTestCatalogRead,
    LabTestCatalogUpdate,
    LabTestPackageCreate,
    LabTestPackageRead,
    LabTestPackageUpdate,
)
from app.modules.lab.repositories import LabResultTemplateRepository
from app.core.access_control import scoped_branch_id
from app.modules.subscriptions.service import enforce_module_enabled

router = APIRouter(prefix="/lab")


@router.get(
    "/consultation-referrals",
    response_model=list[LabConsultationReferralRead],
)
def list_lab_consultation_referrals(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.LAB_CREATE,
            permissions.LAB_EDIT,
        )
    ),
) -> list[LabConsultationReferralRead]:
    enforce_module_enabled(session, tenant_id, "lab")
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


@router.get("/catalog/available-tests")
def list_available_lab_tests(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    search: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_READ,
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_SIGN,
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> list[dict[str, object]]:
    enforce_module_enabled(session, tenant_id, "lab")
    scoped_branch_id(current_user, branch_id)
    catalog_repo = LabCatalogRepository(session)
    rows = [
        _normalize_local_lab_test(row)
        for row in catalog_repo.list_active_tests(tenant_id=tenant_id, search=search)
    ]
    rows.extend(
        _normalize_local_lab_package(row)
        for row in catalog_repo.list_active_packages(tenant_id=tenant_id, search=search)
    )
    return sorted(
        rows, key=lambda row: str(row.get("item_name") or row.get("name") or "")
    )


@router.get("/catalog/popular-tests")
def list_popular_lab_tests(
    tenant_id: str = Depends(require_tenant_id),
    limit: int = 8,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_READ,
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_SIGN,
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> list[dict[str, object]]:
    """Most frequently referred lab tests for this tenant.

    Counts come from referral history (ConsultationReferral with type "lab"),
    so the ranking covers both external (ERPNext) and local catalog items.
    """
    enforce_module_enabled(session, tenant_id, "lab")
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


@router.post(
    "/catalog/tests",
    response_model=LabTestCatalogRead,
    status_code=status.HTTP_201_CREATED,
)
def create_lab_test(
    payload: LabTestCatalogCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.LAB_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> LabTestCatalog:
    return create_lab_test_record(session, tenant_id=tenant_id, payload=payload)


@router.get("/catalog/tests", response_model=list[LabTestCatalogRead])
def list_lab_tests(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    search: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.LAB_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> list[LabTestCatalog]:
    enforce_module_enabled(session, tenant_id, "lab")
    scoped_branch_id(current_user, branch_id)
    return LabCatalogRepository(session).list_active_tests(
        tenant_id=tenant_id,
        search=search,
    )


@router.patch("/catalog/tests/{test_id}", response_model=LabTestCatalogRead)
def update_lab_test(
    test_id: str,
    payload: LabTestCatalogUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabTestCatalog:
    return update_lab_test_record(
        session,
        tenant_id=tenant_id,
        test_id=test_id,
        payload=payload,
        current_user=current_user,
    )


@router.delete("/catalog/tests/{test_id}", response_model=LabTestCatalogRead)
def delete_lab_test(
    test_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabTestCatalog:
    return delete_lab_test_record(
        session, tenant_id=tenant_id, test_id=test_id, current_user=current_user
    )


@router.post(
    "/catalog/packages",
    response_model=LabTestPackageRead,
    status_code=status.HTTP_201_CREATED,
)
def create_lab_package(
    payload: LabTestPackageCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabTestPackageRead:
    return create_lab_package_record(session, tenant_id=tenant_id, payload=payload)


@router.get("/catalog/packages", response_model=list[LabTestPackageRead])
def list_lab_packages(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> list[LabTestPackageRead]:
    enforce_module_enabled(session, tenant_id, "lab")
    scoped_branch_id(current_user, branch_id)
    packages = LabCatalogRepository(session).list_active_packages(tenant_id=tenant_id)
    return [_package_read(session, package) for package in packages]


@router.patch("/catalog/packages/{package_id}", response_model=LabTestPackageRead)
def update_lab_package(
    package_id: str,
    payload: LabTestPackageUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabTestPackageRead:
    return update_lab_package_record(
        session,
        tenant_id=tenant_id,
        package_id=package_id,
        payload=payload,
        current_user=current_user,
    )


@router.delete("/catalog/packages/{package_id}", response_model=LabTestPackageRead)
def delete_lab_package(
    package_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabTestPackageRead:
    return delete_lab_package_record(
        session, tenant_id=tenant_id, package_id=package_id, current_user=current_user
    )


@router.post(
    "/result-templates",
    response_model=LabResultTemplateRead,
    status_code=status.HTTP_201_CREATED,
)
def create_result_template(
    payload: LabResultTemplateCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabResultTemplateRead:
    return create_result_template_record(session, tenant_id=tenant_id, payload=payload)


@router.get("/result-templates", response_model=list[LabResultTemplateRead])
def list_result_templates(
    tenant_id: str = Depends(require_tenant_id),
    test_id: str | None = None,
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> list[LabResultTemplateRead]:
    enforce_module_enabled(session, tenant_id, "lab")
    rows = LabResultTemplateRepository(session).list_active(
        tenant_id=tenant_id,
        test_id=test_id,
    )
    return [_template_read(row) for row in rows]


@router.post(
    "/orders",
    response_model=LabOrderRead,
    status_code=status.HTTP_201_CREATED,
)
def create_lab_order(
    payload: LabOrderCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabOrder:
    return create_lab_order_record(
        session, tenant_id=tenant_id, payload=payload, current_user=current_user
    )


@router.post(
    "/orders/from-consultation/{consultation_id}",
    response_model=LabOrderRead,
    status_code=status.HTTP_201_CREATED,
)
def create_lab_order_from_consultation(
    consultation_id: str,
    payload: LabOrderFromConsultation,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabOrder:
    return create_lab_order_from_consultation_record(
        session,
        tenant_id=tenant_id,
        consultation_id=consultation_id,
        payload=payload,
        current_user=current_user,
    )


@router.get("/orders", response_model=list[LabOrderRead])
def list_lab_orders(
    tenant_id: str = Depends(require_tenant_id),
    patient_id: str | None = None,
    status_filter: LabOrderStatus | None = None,
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> list[LabOrder]:
    branch_id = scoped_branch_id(current_user, branch_id)
    return list_lab_orders_records(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        status_filter=status_filter,
    )


@router.get("/orders/{order_id}", response_model=LabOrderDetailRead)
def get_lab_order(
    order_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabOrderDetailRead:
    return get_lab_order_detail(
        session, tenant_id=tenant_id, order_id=order_id, current_user=current_user
    )


@router.patch("/orders/{order_id}/status", response_model=LabOrderRead)
def update_lab_order_status(
    order_id: str,
    payload: LabOrderStatusUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabOrder:
    return update_lab_order_status_record(
        session,
        tenant_id=tenant_id,
        order_id=order_id,
        payload=payload,
        current_user=current_user,
    )


@router.post(
    "/orders/{order_id}/samples",
    response_model=LabOrderDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def collect_lab_sample(
    order_id: str,
    payload: LabSampleCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabOrderDetailRead:
    return collect_lab_sample_record(
        session,
        tenant_id=tenant_id,
        order_id=order_id,
        payload=payload,
        current_user=current_user,
    )


@router.post(
    "/orders/{order_id}/results",
    response_model=LabOrderDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def add_lab_result(
    order_id: str,
    payload: LabResultCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabOrderDetailRead:
    return add_lab_result_record(
        session,
        tenant_id=tenant_id,
        order_id=order_id,
        payload=payload,
        current_user=current_user,
    )


@router.get("/orders/{order_id}/report.pdf")
def lab_report_pdf(
    order_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> Response:
    pdf = render_lab_report_pdf(
        session, tenant_id=tenant_id, order_id=order_id, current_user=current_user
    )
    return Response(content=pdf, media_type="application/pdf")
