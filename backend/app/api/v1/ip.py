from datetime import date

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlmodel import Session

from app.core.access_control import (
    require_branch_in_tenant,
    require_user_branch_access,
    scoped_branch_id,
)
from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.schema_repair import ensure_upload_schema
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
from app.modules.ip.repositories import (
    IPAdmissionRepository,
    IPBillingRepository,
    IPClinicalRepository,
    IPRoomRepository,
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
    create_admission_record,
    next_admission_number,
    update_admission_record,
)
from app.modules.ip.services.billing import (
    create_billing_item_record,
    create_charge_record,
    generate_ip_invoice_with_audit,
    invoice_detail,
)
from app.modules.ip.services.clinical import (
    create_consent_record,
    create_discharge_summary_record,
    create_ip_consultation_record,
    create_treatment_record,
    finalize_discharge_summary_record,
    sign_consent_record,
    sign_ip_consultation_record,
)
from app.modules.ip.services.documents import (
    list_admission_documents_safe,
    render_discharge_summary_pdf,
    upload_admission_document_file,
    upload_admission_document_rows,
)
from app.modules.ip.services.medication import (
    administer_medication_record,
    create_medication_order_record,
)
from app.modules.ip.services.rooms import (
    create_room_record,
    room_read,
    update_room_record,
)
from app.modules.ip.services.validation import (
    assert_ip_enabled,
    ensure_admission_open,
    get_admission,
)
from app.modules.audit.service import record_audit_event

router = APIRouter(prefix="/ip")


@router.post("/rooms", response_model=IPRoomRead, status_code=status.HTTP_201_CREATED)
def create_room(
    payload: IPRoomCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_CREATE)),
) -> IPRoomRead:
    assert_ip_enabled(session, tenant_id)
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
    assert_ip_enabled(session, tenant_id)
    branch_scope = scoped_branch_id(current_user, branch_id)
    rows = IPRoomRepository(session).list_rooms(
        tenant_id=tenant_id,
        branch_id=branch_scope,
        ward_type=ward_type,
        room_type=room_type,
    )
    read_rows = [
        room_read(
            session, row, available_from=available_from, available_to=available_to
        )
        for row in rows
    ]
    if not include_occupied:
        read_rows = [row for row in read_rows if row.available]
    return read_rows


@router.patch("/rooms/{room_id}", response_model=IPRoomRead)
def update_room(
    room_id: str,
    payload: IPRoomUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPRoomRead:
    assert_ip_enabled(session, tenant_id)
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
    assert_ip_enabled(session, tenant_id)
    branch_scope = scoped_branch_id(current_user, branch_id)
    return IPAdmissionRepository(session).list_admissions(
        tenant_id=tenant_id,
        branch_id=branch_scope,
        patient_id=patient_id,
        status_filter=status_filter,
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
    assert_ip_enabled(session, tenant_id)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    return create_admission_record(
        session,
        tenant_id=tenant_id,
        payload=payload,
        admission_number=next_admission_number(session, tenant_id, payload.branch_id),
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return update_admission_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    admission = await upload_admission_document_file(
        session,
        admission=admission,
        admission_id=admission_id,
        file=file,
        current_user=current_user,
    )
    session.commit()
    session.refresh(admission)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_admission.document_uploaded",
        resource_type="ip_admission",
        resource_id=admission.id,
        purpose="ip_management",
    )
    return admission


@router.get("/admissions/{admission_id}/documents", response_model=list[IPDocumentRead])
def list_admission_documents(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.IP_MANAGE, permissions.IP_READ)
    ),
) -> list[IPDocument]:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    return list_admission_documents_safe(
        session, tenant_id=tenant_id, admission_id=admission.id
    )


@router.post(
    "/admissions/{admission_id}/documents",
    response_model=list[IPDocumentRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_admission_documents(
    admission_id: str,
    document_type: str = Form(default="admission"),
    files: list[UploadFile] = File(...),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> list[IPDocument]:
    assert_ip_enabled(session, tenant_id)
    ensure_upload_schema(session)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    rows = await upload_admission_document_rows(
        session,
        admission=admission,
        admission_id=admission_id,
        document_type=document_type,
        files=files,
        current_user=current_user,
    )
    session.commit()
    for row in rows:
        session.refresh(row)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_document.uploaded",
        resource_type="ip_admission",
        resource_id=admission.id,
        purpose="ip_management",
    )
    return rows


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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_treatment_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    return IPClinicalRepository(session).list_treatments(
        tenant_id=tenant_id,
        admission_id=admission.id,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_ip_consultation_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
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
    consultation = IPClinicalRepository(session).get_consultation(
        tenant_id=tenant_id,
        consultation_id=consultation_id,
    )
    if not consultation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="IP consultation not found"
        )
    admission = get_admission(
        session, tenant_id, consultation.admission_id, current_user
    )
    ensure_admission_open(admission)
    return sign_ip_consultation_record(
        session,
        tenant_id=tenant_id,
        consultation=consultation,
        admission=admission,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_consent_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
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
    consent = IPClinicalRepository(session).get_consent(
        tenant_id=tenant_id,
        consent_id=consent_id,
    )
    if not consent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Consent not found"
        )
    admission = get_admission(session, tenant_id, consent.admission_id, current_user)
    ensure_admission_open(admission)
    return sign_consent_record(
        session,
        consent=consent,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_discharge_summary_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_charge_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    return IPBillingRepository(session).list_charges(
        tenant_id=tenant_id,
        admission_id=admission.id,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_billing_item_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    return IPBillingRepository(session).list_billing_items(
        tenant_id=tenant_id,
        admission_id=admission.id,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_medication_order_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    return IPClinicalRepository(session).list_medication_orders(
        tenant_id=tenant_id,
        admission_id=admission.id,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return administer_medication_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
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
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    return IPClinicalRepository(session).list_medication_administrations(
        tenant_id=tenant_id,
        admission_id=admission.id,
    )


@router.get(
    "/admissions/{admission_id}/invoice", response_model=InvoiceDetailRead | None
)
def get_ip_invoice(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead | None:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    invoice = IPBillingRepository(session).get_invoice_for_admission(
        tenant_id=tenant_id,
        admission_id=admission.id,
    )
    if not invoice:
        return None
    return invoice_detail(session, invoice)


@router.post(
    "/admissions/{admission_id}/invoice",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def generate_ip_invoice(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return generate_ip_invoice_with_audit(
        session, tenant_id=tenant_id, admission=admission, current_user=current_user
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
