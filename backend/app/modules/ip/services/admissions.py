from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_branch_in_tenant, require_user_branch_access
from app.modules.appointments.models import AppointmentStatus
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.ip.models import IPAdmission
from app.modules.ip.repositories import IPReferenceRepository
from app.modules.ip.schemas import IPAdmissionCreate, IPAdmissionUpdate
from app.modules.ip.services.rooms import resolve_room_for_admission
from app.modules.ip.services.validation import (
    assert_ip_enabled,
    ensure_admission_open,
    get_admission,
    validate_aadhaar_number,
)
from app.modules.settings.numbering import next_document_number


def next_admission_number(
    session: Session, tenant_id: str, branch_id: str | None = None
) -> str:
    return next_document_number(
        session, tenant_id=tenant_id, branch_id=branch_id, entity="ip_admission"
    )


def create_admission_record(
    session: Session,
    *,
    tenant_id: str,
    payload: IPAdmissionCreate,
    admission_number: str,
    current_user: User,
) -> IPAdmission:
    reference_repo = IPReferenceRepository(session)
    patient = reference_repo.get_patient(payload.patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    appointment = (
        reference_repo.get_appointment(payload.source_appointment_id)
        if payload.source_appointment_id
        else None
    )
    if appointment and appointment.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Source appointment not found"
        )
    admission_date = payload.admission_date or date.today()
    aadhaar_number = validate_aadhaar_number(payload.aadhaar_number)
    if (
        payload.expected_discharge_date
        and payload.expected_discharge_date < admission_date
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expected discharge date cannot be before admission date",
        )
    room, room_updates = resolve_room_for_admission(
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
            "admission_number": admission_number,
            "admission_date": admission_date,
            "aadhaar_number": aadhaar_number,
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


def create_admission_command(
    session: Session,
    *,
    tenant_id: str,
    payload: IPAdmissionCreate,
    current_user: User,
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


def update_admission_record(
    session: Session,
    *,
    tenant_id: str,
    admission: IPAdmission,
    payload: IPAdmissionUpdate,
    current_user: User,
) -> IPAdmission:
    updates = payload.model_dump(exclude_unset=True)
    if "aadhaar_number" in updates:
        updates["aadhaar_number"] = validate_aadhaar_number(updates["aadhaar_number"])
    next_admission_date = admission.admission_date
    next_expected_discharge_date = updates.get(
        "expected_discharge_date", admission.expected_discharge_date
    )
    if (
        next_expected_discharge_date
        and next_expected_discharge_date < next_admission_date
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expected discharge date cannot be before admission date",
        )
    if "room_id" in updates and updates["room_id"]:
        room, room_updates = resolve_room_for_admission(
            session,
            tenant_id,
            admission.branch_id,
            payload,
            admission_date=next_admission_date,
            expected_discharge_date=next_expected_discharge_date,
            exclude_admission_id=admission.id,
        )
        updates.update(
            {"room_id": room.id if room else updates["room_id"], **room_updates}
        )
    before = {key: getattr(admission, key) for key in updates}
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
        changes=diff_changes(before, updates),
    )
    return admission


def update_admission_by_id(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    payload: IPAdmissionUpdate,
    current_user: User,
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


def convert_appointment_to_admission_record(
    session: Session,
    *,
    tenant_id: str,
    appointment_id: str,
    payload: IPAdmissionCreate,
    current_user: User,
) -> IPAdmission:
    appointment = IPReferenceRepository(session).get_appointment(appointment_id)
    if not appointment or appointment.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
        )
    payload = payload.model_copy(
        update={
            "branch_id": appointment.branch_id,
            "patient_id": appointment.patient_id,
            "department_id": payload.department_id or appointment.department_id,
            "admitting_practitioner_id": payload.admitting_practitioner_id
            or appointment.practitioner_id,
            "source_appointment_id": appointment.id,
        }
    )
    assert_ip_enabled(session, tenant_id)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    admission = create_admission_record(
        session,
        tenant_id=tenant_id,
        payload=payload,
        admission_number=next_admission_number(session, tenant_id, payload.branch_id),
        current_user=current_user,
    )
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
