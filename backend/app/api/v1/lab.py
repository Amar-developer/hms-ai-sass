from datetime import date
from io import BytesIO

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlmodel import Session

from app.core.auth import require_any_permission
from app.core.database import get_session
from app.core.list_filters import ListFilterOption, parse_list_filters, parse_list_sort
from app.core.pagination import DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, Page
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.files.models import FileDocument
from app.modules.files.schemas import FileDocumentRead
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
    list_lab_package_filter_options,
    list_lab_package_page,
    list_lab_test_filter_options,
    list_lab_test_page,
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
    list_lab_order_filter_options,
    list_lab_order_page,
    list_lab_orders_records,
)
from app.modules.lab.services.file_service import (
    list_lab_order_files,
    prepare_lab_order_file_download,
    upload_lab_order_files,
)
from app.modules.lab.services.report_service import render_lab_report_pdf
from app.modules.lab.services.delivery_service import queue_lab_report_delivery
from app.modules.notifications.schemas import (
    DocumentDeliveryRead,
    DocumentDeliveryRequest,
)
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


@router.post(
    "/orders/{order_id}/send-report",
    response_model=DocumentDeliveryRead,
    summary="Queue an exact lab report artifact for WhatsApp or email delivery",
)
def send_lab_report(
    order_id: str,
    payload: DocumentDeliveryRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.LAB_MANAGE,
            permissions.LAB_RESULTS_MANAGE,
        )
    ),
):
    return queue_lab_report_delivery(
        session,
        tenant_id=tenant_id,
        order_id=order_id,
        payload=payload,
        actor=current_user,
    )


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
            permissions.LAB_CREATE,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> LabTestCatalog:
    return create_lab_test_record(
        session,
        tenant_id=tenant_id,
        payload=payload,
        current_user=current_user,
    )


@router.get("/catalog/tests", response_model=list[LabTestCatalogRead])
def list_lab_tests(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    search: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
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


@router.get("/catalog/tests/page", response_model=Page[LabTestCatalogRead])
def list_lab_test_page_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    include_inactive: bool = False,
    q: str | None = Query(default=None),
    filters: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SERVICE_ITEMS_MANAGE,
            permissions.SERVICE_ITEMS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> Page[LabTestCatalogRead]:
    return list_lab_test_page(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        include_inactive=include_inactive,
        q=q,
        list_filters=parse_list_filters(filters),
        list_sort=parse_list_sort(sort),
        limit=limit,
        offset=offset,
        current_user=current_user,
    )


@router.get(
    "/catalog/tests/filter-options",
    response_model=dict[str, list[ListFilterOption]],
)
def list_lab_test_filter_options_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.SERVICE_ITEMS_MANAGE,
            permissions.SERVICE_ITEMS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> dict[str, list[ListFilterOption]]:
    return list_lab_test_filter_options(session, tenant_id=tenant_id)


@router.patch("/catalog/tests/{test_id}", response_model=LabTestCatalogRead)
def update_lab_test(
    test_id: str,
    payload: LabTestCatalogUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_EDIT)
    ),
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
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_DELETE)
    ),
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
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_CREATE)
    ),
) -> LabTestPackageRead:
    return create_lab_package_record(
        session,
        tenant_id=tenant_id,
        payload=payload,
        current_user=current_user,
    )


@router.get("/catalog/packages", response_model=list[LabTestPackageRead])
def list_lab_packages(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_READ)
    ),
) -> list[LabTestPackageRead]:
    return list_lab_packages_service(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        current_user=current_user,
        module_enabled_checker=enforce_module_enabled,
    )


@router.get("/catalog/packages/page", response_model=Page[LabTestPackageRead])
def list_lab_package_page_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    include_inactive: bool = False,
    q: str | None = Query(default=None),
    filters: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SERVICE_ITEMS_MANAGE,
            permissions.SERVICE_ITEMS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> Page[LabTestPackageRead]:
    return list_lab_package_page(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        include_inactive=include_inactive,
        q=q,
        list_filters=parse_list_filters(filters),
        list_sort=parse_list_sort(sort),
        limit=limit,
        offset=offset,
        current_user=current_user,
    )


@router.get(
    "/catalog/packages/filter-options",
    response_model=dict[str, list[ListFilterOption]],
)
def list_lab_package_filter_options_endpoint(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.SERVICE_ITEMS_MANAGE,
            permissions.SERVICE_ITEMS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> dict[str, list[ListFilterOption]]:
    return list_lab_package_filter_options(session, tenant_id=tenant_id)


@router.patch("/catalog/packages/{package_id}", response_model=LabTestPackageRead)
def update_lab_package(
    package_id: str,
    payload: LabTestPackageUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_EDIT)
    ),
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
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_DELETE)
    ),
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
    _current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_RESULTS_MANAGE)
    ),
) -> LabResultTemplateRead:
    return create_result_template_record(session, tenant_id=tenant_id, payload=payload)


@router.get("/result-templates", response_model=list[LabResultTemplateRead])
def list_result_templates(
    tenant_id: str = Depends(require_tenant_id),
    test_id: str | None = None,
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.LAB_RESULTS_MANAGE,
        )
    ),
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
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_CREATE)
    ),
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
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_CREATE)
    ),
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
    limit: int = Query(default=DEFAULT_LIST_LIMIT, ge=1, le=MAX_LIST_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_READ)
    ),
) -> list[LabOrderRead]:
    branch_id = scoped_branch_id(current_user, branch_id)
    return list_lab_orders_records(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )


@router.get("/orders/page", response_model=Page[LabOrderRead])
def list_lab_orders_page(
    tenant_id: str = Depends(require_tenant_id),
    patient_id: str | None = None,
    status_filter: LabOrderStatus | None = None,
    branch_id: str | None = None,
    q: str | None = Query(default=None, max_length=120),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    filters: str | None = Query(default=None, max_length=8000),
    sort: str | None = Query(default=None, max_length=1000),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_READ)
    ),
) -> Page[LabOrderRead]:
    branch_id = scoped_branch_id(current_user, branch_id)
    return list_lab_order_page(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        status_filter=status_filter,
        q=q,
        from_date=from_date,
        to_date=to_date,
        list_filters=parse_list_filters(filters),
        list_sort=parse_list_sort(sort),
        limit=limit,
        offset=offset,
    )


@router.get("/orders/filter-options", response_model=dict[str, list[ListFilterOption]])
def list_lab_orders_filter_options(
    tenant_id: str = Depends(require_tenant_id),
    patient_id: str | None = None,
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_READ)
    ),
) -> dict[str, list[ListFilterOption]]:
    branch_id = scoped_branch_id(current_user, branch_id)
    return list_lab_order_filter_options(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
    )


@router.get("/orders/{order_id}", response_model=LabOrderDetailRead)
def get_lab_order(
    order_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_READ)
    ),
) -> LabOrderDetailRead:
    return get_lab_order_detail(
        session, tenant_id=tenant_id, order_id=order_id, current_user=current_user
    )


@router.get("/orders/{order_id}/files", response_model=list[FileDocumentRead])
def list_lab_order_attachments(
    order_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_READ)
    ),
) -> list[FileDocument]:
    return list_lab_order_files(
        session,
        tenant_id=tenant_id,
        order_id=order_id,
        current_user=current_user,
    )


@router.post(
    "/orders/{order_id}/files",
    response_model=list[FileDocumentRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_lab_order_attachments(
    order_id: str,
    files: list[UploadFile] = File(..., min_length=1),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.LAB_MANAGE,
            permissions.LAB_EDIT,
            permissions.LAB_RESULTS_MANAGE,
        )
    ),
) -> list[FileDocument]:
    return await upload_lab_order_files(
        session,
        tenant_id=tenant_id,
        order_id=order_id,
        files=files,
        current_user=current_user,
    )


@router.get("/orders/{order_id}/files/{file_id}/download")
def download_lab_order_attachment(
    order_id: str,
    file_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.LAB_RESULTS_MANAGE,
        )
    ),
) -> Response:
    row, content = prepare_lab_order_file_download(
        session,
        tenant_id=tenant_id,
        order_id=order_id,
        file_id=file_id,
        current_user=current_user,
    )
    if isinstance(content, bytes):
        safe_name = (
            (row.file_name or "lab-report")
            .replace('"', "")
            .replace("\r", "")
            .replace("\n", "")
        )
        return StreamingResponse(
            BytesIO(content),
            media_type=row.content_type or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
        )
    return FileResponse(
        path=str(content),
        media_type=row.content_type or "application/octet-stream",
        filename=row.file_name or content.name,
        content_disposition_type="attachment",
    )


@router.patch("/orders/{order_id}/status", response_model=LabOrderRead)
def update_lab_order_status(
    order_id: str,
    payload: LabOrderStatusUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_EDIT)
    ),
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
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_EDIT)
    ),
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
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_RESULTS_MANAGE)
    ),
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
    current_user: User = Depends(
        require_any_permission(permissions.LAB_MANAGE, permissions.LAB_READ)
    ),
) -> Response:
    pdf = render_lab_report_pdf(
        session, tenant_id=tenant_id, order_id=order_id, current_user=current_user
    )
    return Response(content=pdf, media_type="application/pdf")
