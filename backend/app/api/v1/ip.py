from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlmodel import Session, delete, select

from app.core.access_control import require_branch_in_tenant, require_user_branch_access, scoped_branch_id
from app.core.auth import require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import Invoice, InvoiceItem, InvoiceStatus
from app.modules.billing.schemas import InvoiceDetailRead, InvoiceItemRead, InvoiceRead
from app.modules.billing.service import next_invoice_number
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.ip.models import (
    IPAdmission,
    IPBillingItem,
    IPCharge,
    IPConsentForm,
    IPConsultation,
    IPDischargeSummary,
    IPMedicationAdministration,
    IPMedicationOrder,
    IPRoom,
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
from app.modules.patients.models import Patient
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc

router = APIRouter(prefix="/ip")


def _simple_pdf(lines: list[str]) -> bytes:
    text = "\\n".join(lines).replace("(", "[").replace(")", "]")
    stream = f"BT /F1 12 Tf 50 760 Td ({text}) Tj ET"
    return (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >> endobj\n"
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        + f"5 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream endobj\n".encode()
        + b"xref\n0 6\n0000000000 65535 f \ntrailer << /Root 1 0 R /Size 6 >>\nstartxref\n0\n%%EOF"
    )


def _assert_ip_enabled(session: Session, tenant_id: str) -> None:
    enforce_module_enabled(session, tenant_id, "ip")


def _next_admission_number(session: Session, tenant_id: str) -> str:
    count = session.exec(select(func.count()).select_from(IPAdmission).where(IPAdmission.tenant_id == tenant_id)).one()
    return f"IP-{count + 1:06d}"


def _get_admission(session: Session, tenant_id: str, admission_id: str, current_user: User) -> IPAdmission:
    admission = session.get(IPAdmission, admission_id)
    if not admission or admission.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP admission not found")
    require_user_branch_access(current_user, admission.branch_id)
    return admission


def _ensure_admission_open(admission: IPAdmission) -> None:
    if admission.status in {"discharged", "cancelled"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="IP admission is closed; no more clinical or billing changes are allowed")


def _active_admission_statuses() -> set[str]:
    return {"admitted", "under_treatment", "discharge_initiated"}


def _chargeable_days(start_date: date, end_date: date) -> int:
    if end_date < start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Discharge date cannot be before admission date")
    return max((end_date - start_date).days + 1, 1)


def _latest_discharge_date(session: Session, admission: IPAdmission) -> date | None:
    summary = session.exec(
        select(IPDischargeSummary)
        .where(IPDischargeSummary.tenant_id == admission.tenant_id, IPDischargeSummary.admission_id == admission.id)
        .order_by(IPDischargeSummary.updated_at.desc(), IPDischargeSummary.created_at.desc())
    ).first()
    return summary.discharge_date if summary else None


def _admission_end_date(session: Session, admission: IPAdmission) -> date:
    return _latest_discharge_date(session, admission) or admission.expected_discharge_date or date.today()


def _ranges_overlap(start: date, end: date, other_start: date, other_end: date) -> bool:
    return start <= other_end and other_start <= end


def _room_occupant(
    session: Session,
    *,
    tenant_id: str,
    room_id: str,
    start_date: date,
    end_date: date,
    exclude_admission_id: str | None = None,
) -> IPAdmission | None:
    rows = session.exec(
        select(IPAdmission).where(
            IPAdmission.tenant_id == tenant_id,
            IPAdmission.room_id == room_id,
            IPAdmission.status.in_(_active_admission_statuses()),
        )
    ).all()
    for row in rows:
        if exclude_admission_id and row.id == exclude_admission_id:
            continue
        row_end = _admission_end_date(session, row)
        if _ranges_overlap(start_date, end_date, row.admission_date, row_end):
            return row
    return None


def _room_read(
    session: Session,
    room: IPRoom,
    *,
    available_from: date | None = None,
    available_to: date | None = None,
) -> IPRoomRead:
    start_date = available_from or date.today()
    end_date = available_to or start_date
    occupant = _room_occupant(
        session,
        tenant_id=room.tenant_id,
        room_id=room.id,
        start_date=start_date,
        end_date=end_date,
    )
    data = IPRoomRead.model_validate(room, from_attributes=True).model_dump()
    data["available"] = room.is_active and occupant is None
    data["occupied_admission_id"] = occupant.id if occupant else None
    return IPRoomRead(**data)


def _resolve_room_for_admission(
    session: Session,
    tenant_id: str,
    branch_id: str,
    payload: IPAdmissionCreate | IPAdmissionUpdate,
    *,
    admission_date: date,
    expected_discharge_date: date | None,
    exclude_admission_id: str | None = None,
) -> tuple[IPRoom | None, dict[str, str | None]]:
    if not payload.room_id:
        return None, {}
    room = session.get(IPRoom, payload.room_id)
    if not room or room.tenant_id != tenant_id or room.branch_id != branch_id or not room.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or inactive IP room")
    end_date = expected_discharge_date or admission_date
    occupant = _room_occupant(
        session,
        tenant_id=tenant_id,
        room_id=room.id,
        start_date=admission_date,
        end_date=end_date,
        exclude_admission_id=exclude_admission_id,
    )
    if occupant:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Selected room/bed is not available for this date range")
    return room, {"ward": room.ward_name, "room": room.room_number, "bed": room.bed_number}


def _invoice_detail(session: Session, invoice: Invoice) -> InvoiceDetailRead:
    items = list(
        session.exec(
            select(InvoiceItem)
            .where(InvoiceItem.tenant_id == invoice.tenant_id, InvoiceItem.invoice_id == invoice.id)
            .order_by(InvoiceItem.created_at)
        ).all()
    )
    return InvoiceDetailRead(
        invoice=InvoiceRead.model_validate(invoice, from_attributes=True),
        items=[InvoiceItemRead.model_validate(item, from_attributes=True) for item in items],
        payments=[],
    )


def _create_billing_item(
    session: Session,
    admission: IPAdmission,
    *,
    source_type: str,
    source_id: str | None,
    description: str,
    quantity: int,
    unit_amount: int,
    created_by_user_id: str | None,
) -> IPBillingItem:
    if source_id:
        existing = session.exec(
            select(IPBillingItem).where(
                IPBillingItem.tenant_id == admission.tenant_id,
                IPBillingItem.admission_id == admission.id,
                IPBillingItem.source_type == source_type,
                IPBillingItem.source_id == source_id,
            )
        ).first()
        if existing:
            return existing
    item = IPBillingItem(
        tenant_id=admission.tenant_id,
        branch_id=admission.branch_id,
        admission_id=admission.id,
        source_type=source_type,
        source_id=source_id,
        description=description,
        quantity=quantity,
        unit_amount=unit_amount,
        total_amount=quantity * unit_amount,
        created_by_user_id=created_by_user_id,
    )
    session.add(item)
    return item


@router.post("/rooms", response_model=IPRoomRead, status_code=status.HTTP_201_CREATED)
def create_room(
    payload: IPRoomCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_CREATE)),
) -> IPRoomRead:
    _assert_ip_enabled(session, tenant_id)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    duplicate = session.exec(
        select(IPRoom).where(
            IPRoom.tenant_id == tenant_id,
            IPRoom.branch_id == payload.branch_id,
            IPRoom.room_number == payload.room_number,
            IPRoom.bed_number == payload.bed_number,
        )
    ).first()
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Room and bed already exists")
    room = IPRoom.model_validate(
        payload,
        update={"tenant_id": tenant_id, "created_by_user_id": current_user.id, "updated_by_user_id": current_user.id},
    )
    session.add(room)
    session.commit()
    session.refresh(room)
    record_audit_event(session, tenant_id=tenant_id, branch_id=room.branch_id, actor_user_id=current_user.id, action="ip_room.created", resource_type="ip_room", resource_id=room.id, purpose="ip_room_master")
    return _room_read(session, room)


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
    current_user: User = Depends(require_permission(permissions.IP_READ)),
) -> list[IPRoomRead]:
    _assert_ip_enabled(session, tenant_id)
    branch_scope = scoped_branch_id(current_user, branch_id)
    statement = select(IPRoom).where(IPRoom.tenant_id == tenant_id)
    if branch_scope:
        statement = statement.where(IPRoom.branch_id == branch_scope)
    if ward_type:
        statement = statement.where(IPRoom.ward_type == ward_type)
    if room_type:
        statement = statement.where(IPRoom.room_type == room_type)
    rows = session.exec(statement.order_by(IPRoom.ward_name, IPRoom.room_number, IPRoom.bed_number)).all()
    read_rows = [_room_read(session, row, available_from=available_from, available_to=available_to) for row in rows]
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
    _assert_ip_enabled(session, tenant_id)
    room = session.get(IPRoom, room_id)
    if not room or room.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP room not found")
    require_user_branch_access(current_user, room.branch_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(room, key, value)
    room.updated_by_user_id = current_user.id
    room.updated_at = now_utc()
    session.add(room)
    session.commit()
    session.refresh(room)
    return _room_read(session, room)


@router.get("/admissions", response_model=list[IPAdmissionRead])
def list_admissions(
    branch_id: str | None = None,
    patient_id: str | None = None,
    status_filter: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_READ)),
) -> list[IPAdmission]:
    _assert_ip_enabled(session, tenant_id)
    branch_scope = scoped_branch_id(current_user, branch_id)
    statement = select(IPAdmission).where(IPAdmission.tenant_id == tenant_id)
    if branch_scope:
        statement = statement.where(IPAdmission.branch_id == branch_scope)
    if patient_id:
        statement = statement.where(IPAdmission.patient_id == patient_id)
    if status_filter:
        statement = statement.where(IPAdmission.status == status_filter)
    return list(session.exec(statement.order_by(IPAdmission.updated_at.desc(), IPAdmission.created_at.desc())).all())


@router.post("/admissions", response_model=IPAdmissionRead, status_code=status.HTTP_201_CREATED)
def create_admission(
    payload: IPAdmissionCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_CREATE)),
) -> IPAdmission:
    _assert_ip_enabled(session, tenant_id)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    patient = session.get(Patient, payload.patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    appointment = session.get(Appointment, payload.source_appointment_id) if payload.source_appointment_id else None
    if appointment and appointment.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source appointment not found")
    admission_date = payload.admission_date or date.today()
    if payload.expected_discharge_date and payload.expected_discharge_date < admission_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expected discharge date cannot be before admission date")
    room, room_updates = _resolve_room_for_admission(
        session,
        tenant_id,
        payload.branch_id,
        payload,
        admission_date=admission_date,
        expected_discharge_date=payload.expected_discharge_date,
    )
    admission = IPAdmission.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "admission_number": _next_admission_number(session, tenant_id),
            "admission_date": admission_date,
            "room_id": room.id if room else payload.room_id,
            **room_updates,
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(admission)
    session.commit()
    session.refresh(admission)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_admission.created",
        resource_type="ip_admission",
        resource_id=admission.id,
        purpose="ip_management",
        metadata_json=f'{{"source_appointment_id":"{admission.source_appointment_id or ""}"}}',
    )
    return admission


@router.post("/admissions/from-appointment/{appointment_id}", response_model=IPAdmissionRead, status_code=status.HTTP_201_CREATED)
def convert_op_to_ip(
    appointment_id: str,
    payload: IPAdmissionCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_CREATE)),
) -> IPAdmission:
    appointment = session.get(Appointment, appointment_id)
    if not appointment or appointment.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    payload = payload.model_copy(
        update={
            "branch_id": appointment.branch_id,
            "patient_id": appointment.patient_id,
            "department_id": payload.department_id or appointment.department_id,
            "admitting_practitioner_id": payload.admitting_practitioner_id or appointment.practitioner_id,
            "source_appointment_id": appointment.id,
        }
    )
    admission = create_admission(payload, tenant_id, session, current_user)
    appointment.status = AppointmentStatus.CONSULTATION_COMPLETED
    session.add(appointment)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=appointment.branch_id,
        actor_user_id=current_user.id,
        action="appointment.converted_to_ip",
        resource_type="appointment",
        resource_id=appointment.id,
        purpose="ip_conversion",
        metadata_json=f'{{"ip_admission_id":"{admission.id}"}}',
    )
    return admission


@router.patch("/admissions/{admission_id}", response_model=IPAdmissionRead)
def update_admission(
    admission_id: str,
    payload: IPAdmissionUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPAdmission:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    _ensure_admission_open(admission)
    updates = payload.model_dump(exclude_unset=True)
    next_admission_date = admission.admission_date
    next_expected_discharge_date = updates.get("expected_discharge_date", admission.expected_discharge_date)
    if next_expected_discharge_date and next_expected_discharge_date < next_admission_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expected discharge date cannot be before admission date")
    if "room_id" in updates and updates["room_id"]:
        room, room_updates = _resolve_room_for_admission(
            session,
            tenant_id,
            admission.branch_id,
            payload,
            admission_date=next_admission_date,
            expected_discharge_date=next_expected_discharge_date,
            exclude_admission_id=admission.id,
        )
        updates.update({"room_id": room.id if room else updates["room_id"], **room_updates})
    for key, value in updates.items():
        setattr(admission, key, value)
    admission.updated_by_user_id = current_user.id
    session.add(admission)
    session.commit()
    session.refresh(admission)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_admission.updated",
        resource_type="ip_admission",
        resource_id=admission.id,
        purpose="ip_management",
    )
    return admission


@router.post("/admissions/{admission_id}/treatments", response_model=IPTreatmentRead, status_code=status.HTTP_201_CREATED)
def add_treatment(
    admission_id: str,
    payload: IPTreatmentCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPTreatment:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    _ensure_admission_open(admission)
    treatment = IPTreatment.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "treatment_date": payload.treatment_date or date.today(),
            "created_by_user_id": current_user.id,
        },
    )
    admission.status = "under_treatment"
    session.add(treatment)
    session.add(admission)
    session.commit()
    session.refresh(treatment)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_treatment.created", resource_type="ip_treatment", resource_id=treatment.id, purpose="ip_treatment")
    return treatment


@router.get("/admissions/{admission_id}/treatments", response_model=list[IPTreatmentRead])
def list_treatments(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_READ)),
) -> list[IPTreatment]:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    return list(session.exec(select(IPTreatment).where(IPTreatment.tenant_id == tenant_id, IPTreatment.admission_id == admission.id).order_by(IPTreatment.created_at.desc())).all())


@router.post("/admissions/{admission_id}/consultations", response_model=IPConsultationRead, status_code=status.HTTP_201_CREATED)
def create_ip_consultation(
    admission_id: str,
    payload: IPConsultationCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPConsultation:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    _ensure_admission_open(admission)
    consultation = IPConsultation.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "consultation_date": payload.consultation_date or date.today(),
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(consultation)
    session.commit()
    session.refresh(consultation)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_consultation.created", resource_type="ip_consultation", resource_id=consultation.id, purpose="ip_consultation")
    return consultation


@router.post("/consultations/{consultation_id}/sign", response_model=IPConsultationRead)
def sign_ip_consultation(
    consultation_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPConsultation:
    consultation = session.get(IPConsultation, consultation_id)
    if not consultation or consultation.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP consultation not found")
    admission = _get_admission(session, tenant_id, consultation.admission_id, current_user)
    _ensure_admission_open(admission)
    consultation.status = "signed"
    signed_at = now_utc()
    consultation.signed_at = signed_at
    consultation.updated_at = signed_at
    consultation.updated_by_user_id = current_user.id
    if consultation.fee_amount > 0 and not consultation.billing_item_id:
        billing_item = _create_billing_item(
            session,
            admission,
            source_type="doctor_consultation",
            source_id=consultation.id,
            description=f"IP doctor consultation - {consultation.consultation_type.replace('_', ' ')}",
            quantity=1,
            unit_amount=consultation.fee_amount,
            created_by_user_id=current_user.id,
        )
        session.flush()
        consultation.billing_item_id = billing_item.id
    session.add(consultation)
    session.commit()
    session.refresh(consultation)
    record_audit_event(session, tenant_id=tenant_id, branch_id=consultation.branch_id, actor_user_id=current_user.id, action="ip_consultation.signed", resource_type="ip_consultation", resource_id=consultation.id, purpose="ip_consultation")
    return consultation


@router.post("/admissions/{admission_id}/consents", response_model=IPConsentFormRead, status_code=status.HTTP_201_CREATED)
def create_consent(
    admission_id: str,
    payload: IPConsentFormCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPConsentForm:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    _ensure_admission_open(admission)
    consent = IPConsentForm.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(consent)
    session.commit()
    session.refresh(consent)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_consent.created", resource_type="ip_consent", resource_id=consent.id, purpose="patient_consent")
    return consent


@router.post("/consents/{consent_id}/sign", response_model=IPConsentFormRead)
def sign_consent(
    consent_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPConsentForm:
    consent = session.get(IPConsentForm, consent_id)
    if not consent or consent.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consent not found")
    admission = _get_admission(session, tenant_id, consent.admission_id, current_user)
    _ensure_admission_open(admission)
    consent.status = "signed"
    signed_at = now_utc()
    consent.signed_at = signed_at
    consent.updated_at = signed_at
    consent.updated_by_user_id = current_user.id
    session.add(consent)
    session.commit()
    session.refresh(consent)
    record_audit_event(session, tenant_id=tenant_id, branch_id=consent.branch_id, actor_user_id=current_user.id, action="ip_consent.signed", resource_type="ip_consent", resource_id=consent.id, purpose="patient_consent")
    return consent


@router.post("/admissions/{admission_id}/discharge-summary", response_model=IPDischargeSummaryRead, status_code=status.HTTP_201_CREATED)
def create_discharge_summary(
    admission_id: str,
    payload: IPDischargeSummaryCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPDischargeSummary:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    _ensure_admission_open(admission)
    discharge_date = payload.discharge_date or date.today()
    _chargeable_days(admission.admission_date, discharge_date)
    summary = IPDischargeSummary.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "discharge_date": discharge_date,
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    admission.status = "discharge_initiated"
    session.add(summary)
    session.add(admission)
    session.commit()
    session.refresh(summary)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_discharge_summary.created", resource_type="ip_discharge_summary", resource_id=summary.id, purpose="ip_discharge")
    return summary


@router.post("/discharge-summaries/{summary_id}/finalize", response_model=IPDischargeSummaryRead)
def finalize_discharge_summary(
    summary_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPDischargeSummary:
    summary = session.get(IPDischargeSummary, summary_id)
    if not summary or summary.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discharge summary not found")
    admission = _get_admission(session, tenant_id, summary.admission_id, current_user)
    _ensure_admission_open(admission)
    invoice = session.exec(select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.ip_admission_id == admission.id)).first()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Generate IP invoice before finalizing discharge")
    summary.status = "finalized"
    finalized_at = now_utc()
    summary.finalized_at = finalized_at
    summary.updated_at = finalized_at
    summary.updated_by_user_id = current_user.id
    admission.status = "discharged"
    admission.updated_by_user_id = current_user.id
    session.add(summary)
    session.add(admission)
    session.commit()
    session.refresh(summary)
    record_audit_event(session, tenant_id=tenant_id, branch_id=summary.branch_id, actor_user_id=current_user.id, action="ip_discharge_summary.finalized", resource_type="ip_discharge_summary", resource_id=summary.id, purpose="ip_discharge")
    return summary


@router.post("/admissions/{admission_id}/charges", response_model=IPChargeRead, status_code=status.HTTP_201_CREATED)
def add_charge(
    admission_id: str,
    payload: IPChargeCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPCharge:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    _ensure_admission_open(admission)
    charge = IPCharge.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "total_amount": payload.quantity * payload.unit_amount,
            "created_by_user_id": current_user.id,
        },
    )
    session.add(charge)
    session.commit()
    session.refresh(charge)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_charge.created", resource_type="ip_charge", resource_id=charge.id, purpose="ip_billing")
    return charge


@router.get("/admissions/{admission_id}/charges", response_model=list[IPChargeRead])
def list_charges(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_READ)),
) -> list[IPCharge]:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    return list(session.exec(select(IPCharge).where(IPCharge.tenant_id == tenant_id, IPCharge.admission_id == admission.id).order_by(IPCharge.created_at)).all())


@router.post("/admissions/{admission_id}/billing-items", response_model=IPBillingItemRead, status_code=status.HTTP_201_CREATED)
def add_billing_item(
    admission_id: str,
    payload: IPBillingItemCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPBillingItem:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    _ensure_admission_open(admission)
    item = _create_billing_item(
        session,
        admission,
        source_type=payload.source_type,
        source_id=payload.source_id,
        description=payload.description,
        quantity=payload.quantity,
        unit_amount=payload.unit_amount,
        created_by_user_id=current_user.id,
    )
    item.status = payload.status
    session.add(item)
    session.commit()
    session.refresh(item)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_billing_item.created", resource_type="ip_billing_item", resource_id=item.id, purpose="ip_billing")
    return item


@router.get("/admissions/{admission_id}/billing-items", response_model=list[IPBillingItemRead])
def list_billing_items(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_READ)),
) -> list[IPBillingItem]:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    return list(
        session.exec(
            select(IPBillingItem)
            .where(IPBillingItem.tenant_id == tenant_id, IPBillingItem.admission_id == admission.id)
            .order_by(IPBillingItem.created_at)
        ).all()
    )


@router.post("/admissions/{admission_id}/medication-orders", response_model=IPMedicationOrderRead, status_code=status.HTTP_201_CREATED)
def create_medication_order(
    admission_id: str,
    payload: IPMedicationOrderCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPMedicationOrder:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    _ensure_admission_open(admission)
    order = IPMedicationOrder.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "start_date": payload.start_date or date.today(),
            "created_by_user_id": current_user.id,
        },
    )
    session.add(order)
    session.commit()
    session.refresh(order)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_medication_order.created", resource_type="ip_medication_order", resource_id=order.id, purpose="ip_medication")
    return order


@router.get("/admissions/{admission_id}/medication-orders", response_model=list[IPMedicationOrderRead])
def list_medication_orders(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_READ)),
) -> list[IPMedicationOrder]:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    return list(
        session.exec(
            select(IPMedicationOrder)
            .where(IPMedicationOrder.tenant_id == tenant_id, IPMedicationOrder.admission_id == admission.id)
            .order_by(IPMedicationOrder.created_at.desc())
        ).all()
    )


@router.post("/admissions/{admission_id}/medication-orders/{order_id}/administrations", response_model=IPMedicationAdministrationRead, status_code=status.HTTP_201_CREATED)
def administer_medication(
    admission_id: str,
    order_id: str,
    payload: IPMedicationAdministrationCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPMedicationAdministration:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    _ensure_admission_open(admission)
    order = session.get(IPMedicationOrder, order_id)
    if not order or order.tenant_id != tenant_id or order.admission_id != admission.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medication order not found")
    administration = IPMedicationAdministration.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "medication_order_id": order.id,
            "administered_at": payload.administered_at or now_utc(),
            "administered_by_user_id": current_user.id,
        },
    )
    if administration.status == "given" and order.unit_amount > 0:
        billing_item = _create_billing_item(
            session,
            admission,
            source_type="medication_administration",
            source_id=administration.id,
            description=f"Medicine given - {order.medicine_name}{f' {order.dosage}' if order.dosage else ''}",
            quantity=administration.quantity,
            unit_amount=order.unit_amount,
            created_by_user_id=current_user.id,
        )
        session.flush()
        administration.billing_item_id = billing_item.id
    session.add(administration)
    session.commit()
    session.refresh(administration)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_medication_administration.created", resource_type="ip_medication_administration", resource_id=administration.id, purpose="ip_medication")
    return administration


@router.get("/admissions/{admission_id}/medication-administrations", response_model=list[IPMedicationAdministrationRead])
def list_medication_administrations(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_READ)),
) -> list[IPMedicationAdministration]:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    return list(
        session.exec(
            select(IPMedicationAdministration)
            .where(IPMedicationAdministration.tenant_id == tenant_id, IPMedicationAdministration.admission_id == admission.id)
            .order_by(IPMedicationAdministration.administered_at.desc())
        ).all()
    )


@router.post("/admissions/{admission_id}/invoice", response_model=InvoiceDetailRead, status_code=status.HTTP_201_CREATED)
def generate_ip_invoice(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    _ensure_admission_open(admission)
    charges = list(session.exec(select(IPCharge).where(IPCharge.tenant_id == tenant_id, IPCharge.admission_id == admission.id)).all())
    billing_items = list(
        session.exec(
            select(IPBillingItem).where(
                IPBillingItem.tenant_id == tenant_id,
                IPBillingItem.admission_id == admission.id,
                IPBillingItem.status == "billable",
            )
        ).all()
    )
    existing = session.exec(select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.ip_admission_id == admission.id)).first()
    room_charge: tuple[str, int, int, int] | None = None
    if admission.room_id:
        room = session.get(IPRoom, admission.room_id)
        if room and room.tenant_id == tenant_id:
            bill_until = _admission_end_date(session, admission)
            days = _chargeable_days(admission.admission_date, bill_until)
            room_charge = (
                f"{room.ward_name} {room.room_number} Bed {room.bed_number} ({admission.admission_date} to {bill_until})",
                days,
                room.daily_rate,
                days * room.daily_rate,
            )
    subtotal = sum(charge.total_amount for charge in charges) + sum(item.total_amount for item in billing_items) + (room_charge[3] if room_charge else 0)
    if subtotal <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Add at least one IP charge, billable clinical event, or assign a chargeable room before generating invoice")
    if existing:
        invoice = existing
        invoice.subtotal_amount = subtotal
        invoice.taxable_amount = subtotal
        invoice.total_amount = subtotal
        invoice.clinic_share_amount = subtotal
        invoice.balance_amount = max(subtotal - invoice.paid_amount, 0)
        if invoice.paid_amount >= subtotal and subtotal > 0:
            invoice.status = InvoiceStatus.PAID
        elif invoice.paid_amount > 0:
            invoice.status = InvoiceStatus.PARTIALLY_PAID
        else:
            invoice.status = InvoiceStatus.ISSUED
        invoice.updated_at = now_utc()
        session.exec(delete(InvoiceItem).where(InvoiceItem.tenant_id == tenant_id, InvoiceItem.invoice_id == invoice.id))
    else:
        invoice_prefix, _scope, _scope_id = resolve_setting(
            session,
            tenant_id=tenant_id,
            module="invoice",
            key=SettingKey.INVOICE_PREFIX,
            branch_id=admission.branch_id,
        )
        invoice = Invoice(
            tenant_id=tenant_id,
            branch_id=admission.branch_id,
            patient_id=admission.patient_id,
            appointment_id=admission.source_appointment_id,
            ip_admission_id=admission.id,
            invoice_number=next_invoice_number(session, tenant_id, str(invoice_prefix or "INV")),
            subtotal_amount=subtotal,
            taxable_amount=subtotal,
            total_amount=subtotal,
            balance_amount=subtotal,
            clinic_share_amount=subtotal,
            created_by_user_id=current_user.id,
        )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    if room_charge:
        description, quantity, unit_amount, total_amount = room_charge
        session.add(
            InvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                item_type="ip_room",
                description=description,
                quantity=quantity,
                unit_amount=unit_amount,
                total_amount=total_amount,
            )
        )
    for charge in charges:
        session.add(
            InvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                item_type=f"ip_{charge.charge_type}",
                description=charge.description,
                quantity=charge.quantity,
                unit_amount=charge.unit_amount,
                total_amount=charge.total_amount,
            )
        )
    for item in billing_items:
        session.add(
            InvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                item_type=f"ip_{item.source_type}",
                description=item.description,
                quantity=item.quantity,
                unit_amount=item.unit_amount,
                total_amount=item.total_amount,
            )
        )
    session.commit()
    session.refresh(invoice)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_invoice.generated" if not existing else "ip_invoice.refreshed", resource_type="invoice", resource_id=invoice.id, purpose="ip_billing", metadata_json=f'{{"ip_admission_id":"{admission.id}","total_amount":{invoice.total_amount}}}')
    return _invoice_detail(session, invoice)


@router.get("/discharge-summaries/{summary_id}/pdf")
def discharge_summary_pdf(
    summary_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_READ)),
) -> Response:
    summary = session.get(IPDischargeSummary, summary_id)
    if not summary or summary.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discharge summary not found")
    admission = _get_admission(session, tenant_id, summary.admission_id, current_user)
    patient = session.get(Patient, admission.patient_id)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_discharge_summary.exported", resource_type="ip_discharge_summary", resource_id=summary.id, purpose="discharge_pdf")
    pdf = _simple_pdf(
        [
            "MedizinHub HMS - Discharge Summary",
            f"Admission: {admission.admission_number}",
            f"Patient: {patient.full_name if patient else admission.patient_id}",
            f"Discharge Date: {summary.discharge_date}",
            f"Diagnosis: {summary.final_diagnosis}",
            f"Course: {summary.course_in_hospital or ''}",
            f"Advice: {summary.follow_up_advice or ''}",
        ]
    )
    return Response(content=pdf, media_type="application/pdf")
