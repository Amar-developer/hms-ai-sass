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
from app.modules.lab.services.catalog_service import (
    create_lab_package_record,
    create_lab_test_record,
    create_result_template_record,
    delete_lab_package_record,
    delete_lab_test_record,
    update_lab_package_record,
    update_lab_test_record,
)
from app.modules.lab.services.catalog_queries import (
    list_available_lab_tests_service,
    list_lab_consultation_referrals_service,
    list_lab_packages_service,
    list_lab_tests_service,
    list_popular_lab_tests_service,
    list_result_templates_service,
)
from app.modules.lab.services.order_service import (
    create_lab_order_from_consultation_record,
    create_lab_order_record,
    update_lab_order_status_record,
)
from app.modules.lab.services.order_queries import (
    get_lab_order_detail,
    list_lab_orders_records,
)
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
    return list_lab_consultation_referrals_service(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        current_user=current_user,
        module_enabled_checker=enforce_module_enabled,
    )


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
    return list_available_lab_tests_service(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        search=search,
        current_user=current_user,
        module_enabled_checker=enforce_module_enabled,
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
    return list_popular_lab_tests_service(
        session,
        tenant_id=tenant_id,
        limit=limit,
        module_enabled_checker=enforce_module_enabled,
    )


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
    return list_lab_tests_service(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        search=search,
        current_user=current_user,
        module_enabled_checker=enforce_module_enabled,
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
    return list_lab_packages_service(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        current_user=current_user,
        module_enabled_checker=enforce_module_enabled,
    )


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
    return list_result_templates_service(
        session,
        tenant_id=tenant_id,
        test_id=test_id,
        module_enabled_checker=enforce_module_enabled,
    )


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
