from datetime import date

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Response,
    UploadFile,
    status,
)
from sqlmodel import Session

from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.billing.schemas import InvoiceDetailRead
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.ip.models import (
    IPAdmission,
    IPBillingItem,
    IPCharge,
    IPConsentForm,
    IPConsultation,
    IPDischargeSummary,
    IPDocument,
    IPMedicationAdministration,
    IPMedicationOrder,
    IPTreatment,
)
from app.modules.ip.schemas import (
    IPAdmissionCreate,
    IPAdmissionRead,
    IPAdmissionUpdate,
    IPBillingItemCreate,
    IPBillingItemRead,
    IPChargeCreate,
    IPChargeRead,
    IPConsentFormCreate,
    IPConsentFormRead,
    IPConsultationCreate,
    IPConsultationRead,
    IPDischargeSummaryCreate,
    IPDischargeSummaryRead,
    IPDocumentRead,
    IPMedicationAdministrationCreate,
    IPMedicationAdministrationRead,
    IPMedicationOrderCreate,
    IPMedicationOrderRead,
    IPRoomCreate,
    IPRoomRead,
    IPRoomUpdate,
    IPTreatmentCreate,
    IPTreatmentRead,
)
from app.modules.ip.services.admissions import (
    convert_appointment_to_admission_record,
    create_admission_command,
    update_admission_by_id,
)
from app.modules.ip.services.admission_queries import list_ip_admissions
from app.modules.ip.services.billing import (
    create_billing_item_by_admission_id,
    create_charge_by_admission_id,
    generate_ip_invoice_by_admission_id,
)
from app.modules.ip.services.billing_queries import (
    get_ip_invoice_detail,
    list_ip_billing_items,
    list_ip_charges,
)
from app.modules.ip.services.clinical import (
    create_consent_by_admission_id,
    create_discharge_summary_by_admission_id,
    create_ip_consultation_by_admission_id,
    create_treatment_by_admission_id,
    finalize_discharge_summary_record,
    sign_consent_by_id,
    sign_ip_consultation_by_id,
)
from app.modules.ip.services.clinical_queries import (
    list_ip_medication_administrations,
    list_ip_medication_orders,
    list_ip_treatments,
)
from app.modules.ip.services.documents import (
    render_discharge_summary_pdf,
    upload_admission_document_file_by_id,
    upload_admission_document_rows_by_id,
)
from app.modules.ip.services.document_queries import list_ip_admission_documents
from app.modules.ip.services.medication import (
    administer_medication_by_admission_id,
    create_medication_order_by_admission_id,
)
from app.modules.ip.services.rooms import (
    create_room_record,
    update_room_record,
)
from app.modules.ip.services.room_queries import list_ip_rooms

router = APIRouter(prefix="/ip")


@router.post("/rooms", response_model=IPRoomRead, status_code=status.HTTP_201_CREATED)
def create_room(
    payload: IPRoomCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_CREATE)),
) -> IPRoomRead:
    return create_room_record(
        session, tenant_id=tenant_id, payload=payload, current_user=current_user
    )


@router.get("/rooms", response_model=list[IPRoomRead])
def list_rooms(
    branch_id: str | None = None,
    ward_type: str | None = None,
    room_type: str | None = None,
    available_from: date | None = None,
    available_to: date | None = None,
    include_occupied: bool = True,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.IP_MANAGE, permissions.IP_READ)
    ),
) -> list[IPRoomRead]:
    return list_ip_rooms(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        ward_type=ward_type,
        room_type=room_type,
        available_from=available_from,
        available_to=available_to,
        include_occupied=include_occupied,
        current_user=current_user,
    )


@router.patch("/rooms/{room_id}", response_model=IPRoomRead)
def update_room(
    room_id: str,
    payload: IPRoomUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPRoomRead:
    return update_room_record(
        session,
        tenant_id=tenant_id,
        room_id=room_id,
        payload=payload,
        current_user=current_user,
    )


@router.get("/admissions", response_model=list[IPAdmissionRead])
def list_admissions(
    branch_id: str | None = None,
    patient_id: str | None = None,
    status_filter: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.IP_MANAGE, permissions.IP_READ)
    ),
) -> list[IPAdmission]:
    return list_ip_admissions(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        status_filter=status_filter,
        current_user=current_user,
    )


@router.post(
    "/admissions", response_model=IPAdmissionRead, status_code=status.HTTP_201_CREATED
)
def create_admission(
    payload: IPAdmissionCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_CREATE)),
) -> IPAdmission:
    return create_admission_command(
        session,
        tenant_id=tenant_id,
        payload=payload,
        current_user=current_user,
    )


@router.post(
    "/admissions/from-appointment/{appointment_id}",
    response_model=IPAdmissionRead,
    status_code=status.HTTP_201_CREATED,
)
def convert_op_to_ip(
    appointment_id: str,
    payload: IPAdmissionCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_CREATE)),
) -> IPAdmission:
    return convert_appointment_to_admission_record(
        session,
        tenant_id=tenant_id,
        appointment_id=appointment_id,
        payload=payload,
        current_user=current_user,
    )


@router.patch("/admissions/{admission_id}", response_model=IPAdmissionRead)
def update_admission(
    admission_id: str,
    payload: IPAdmissionUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPAdmission:
    return update_admission_by_id(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        payload=payload,
        current_user=current_user,
    )


@router.post("/admissions/{admission_id}/document", response_model=IPAdmissionRead)
async def upload_admission_document(
    admission_id: str,
    file: UploadFile = File(...),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPAdmission:
    return await upload_admission_document_file_by_id(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        file=file,
        current_user=current_user,
    )


@router.get("/admissions/{admission_id}/documents", response_model=list[IPDocumentRead])
def list_admission_documents(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.IP_MANAGE, permissions.IP_READ)
    ),
) -> list[IPDocument]:
    return list_ip_admission_documents(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        current_user=current_user,
    )


@router.post(
    "/admissions/{admission_id}/documents",
    response_model=list[IPDocumentRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_admission_documents(
    admission_id: str,
    document_type: str = Form(default="admission"),
    files: list[UploadFile] = File(..., min_length=1),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> list[IPDocument]:
    return await upload_admission_document_rows_by_id(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        document_type=document_type,
        files=files,
        current_user=current_user,
    )


@router.post(
    "/admissions/{admission_id}/treatments",
    response_model=IPTreatmentRead,
    status_code=status.HTTP_201_CREATED,
)
def add_treatment(
    admission_id: str,
    payload: IPTreatmentCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPTreatment:
    return create_treatment_by_admission_id(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        payload=payload,
        current_user=current_user,
    )


@router.get(
    "/admissions/{admission_id}/treatments", response_model=list[IPTreatmentRead]
)
def list_treatments(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.IP_MANAGE, permissions.IP_READ)
    ),
) -> list[IPTreatment]:
    return list_ip_treatments(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        current_user=current_user,
    )


@router.post(
    "/admissions/{admission_id}/consultations",
    response_model=IPConsultationRead,
    status_code=status.HTTP_201_CREATED,
)
def create_ip_consultation(
    admission_id: str,
    payload: IPConsultationCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPConsultation:
    return create_ip_consultation_by_admission_id(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        payload=payload,
        current_user=current_user,
    )


@router.post("/consultations/{consultation_id}/sign", response_model=IPConsultationRead)
def sign_ip_consultation(
    consultation_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPConsultation:
    return sign_ip_consultation_by_id(
        session,
        tenant_id=tenant_id,
        consultation_id=consultation_id,
        current_user=current_user,
    )


@router.post(
    "/admissions/{admission_id}/consents",
    response_model=IPConsentFormRead,
    status_code=status.HTTP_201_CREATED,
)
def create_consent(
    admission_id: str,
    payload: IPConsentFormCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPConsentForm:
    return create_consent_by_admission_id(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        payload=payload,
        current_user=current_user,
    )


@router.post("/consents/{consent_id}/sign", response_model=IPConsentFormRead)
def sign_consent(
    consent_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPConsentForm:
    return sign_consent_by_id(
        session,
        tenant_id=tenant_id,
        consent_id=consent_id,
        current_user=current_user,
    )


@router.post(
    "/admissions/{admission_id}/discharge-summary",
    response_model=IPDischargeSummaryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_discharge_summary(
    admission_id: str,
    payload: IPDischargeSummaryCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPDischargeSummary:
    return create_discharge_summary_by_admission_id(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        payload=payload,
        current_user=current_user,
    )


@router.post(
    "/discharge-summaries/{summary_id}/finalize", response_model=IPDischargeSummaryRead
)
def finalize_discharge_summary(
    summary_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPDischargeSummary:
    return finalize_discharge_summary_record(
        session,
        tenant_id=tenant_id,
        summary_id=summary_id,
        current_user=current_user,
    )


@router.post(
    "/admissions/{admission_id}/charges",
    response_model=IPChargeRead,
    status_code=status.HTTP_201_CREATED,
)
def add_charge(
    admission_id: str,
    payload: IPChargeCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPCharge:
    return create_charge_by_admission_id(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        payload=payload,
        current_user=current_user,
    )


@router.get("/admissions/{admission_id}/charges", response_model=list[IPChargeRead])
def list_charges(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.IP_MANAGE, permissions.IP_READ)
    ),
) -> list[IPCharge]:
    return list_ip_charges(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        current_user=current_user,
    )


@router.post(
    "/admissions/{admission_id}/billing-items",
    response_model=IPBillingItemRead,
    status_code=status.HTTP_201_CREATED,
)
def add_billing_item(
    admission_id: str,
    payload: IPBillingItemCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPBillingItem:
    return create_billing_item_by_admission_id(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        payload=payload,
        current_user=current_user,
    )


@router.get(
    "/admissions/{admission_id}/billing-items", response_model=list[IPBillingItemRead]
)
def list_billing_items(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.IP_MANAGE, permissions.IP_READ)
    ),
) -> list[IPBillingItem]:
    return list_ip_billing_items(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        current_user=current_user,
    )


@router.post(
    "/admissions/{admission_id}/medication-orders",
    response_model=IPMedicationOrderRead,
    status_code=status.HTTP_201_CREATED,
)
def create_medication_order(
    admission_id: str,
    payload: IPMedicationOrderCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPMedicationOrder:
    return create_medication_order_by_admission_id(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        payload=payload,
        current_user=current_user,
    )


@router.get(
    "/admissions/{admission_id}/medication-orders",
    response_model=list[IPMedicationOrderRead],
)
def list_medication_orders(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.IP_MANAGE, permissions.IP_READ)
    ),
) -> list[IPMedicationOrder]:
    return list_ip_medication_orders(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        current_user=current_user,
    )


@router.post(
    "/admissions/{admission_id}/medication-orders/{order_id}/administrations",
    response_model=IPMedicationAdministrationRead,
    status_code=status.HTTP_201_CREATED,
)
def administer_medication(
    admission_id: str,
    order_id: str,
    payload: IPMedicationAdministrationCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPMedicationAdministration:
    return administer_medication_by_admission_id(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        order_id=order_id,
        payload=payload,
        current_user=current_user,
    )


@router.get(
    "/admissions/{admission_id}/medication-administrations",
    response_model=list[IPMedicationAdministrationRead],
)
def list_medication_administrations(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.IP_MANAGE, permissions.IP_READ)
    ),
) -> list[IPMedicationAdministration]:
    return list_ip_medication_administrations(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        current_user=current_user,
    )


@router.get(
    "/admissions/{admission_id}/invoice", response_model=InvoiceDetailRead | None
)
def get_ip_invoice(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_READ,
            permissions.INVOICES_READ,
        )
    ),
) -> InvoiceDetailRead | None:
    return get_ip_invoice_detail(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        current_user=current_user,
    )


@router.post(
    "/admissions/{admission_id}/invoice",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def generate_ip_invoice(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_CREATE,
            permissions.INVOICES_CREATE,
        )
    ),
) -> InvoiceDetailRead:
    return generate_ip_invoice_by_admission_id(
        session,
        tenant_id=tenant_id,
        admission_id=admission_id,
        current_user=current_user,
    )


@router.get("/discharge-summaries/{summary_id}/pdf")
def discharge_summary_pdf(
    summary_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.IP_MANAGE, permissions.IP_READ)
    ),
) -> Response:
    pdf = render_discharge_summary_pdf(
        session, tenant_id=tenant_id, summary_id=summary_id, current_user=current_user
    )
    return Response(content=pdf, media_type="application/pdf")
