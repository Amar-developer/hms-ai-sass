from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.core.access_control import enforce_entitlement, require_branch_in_tenant, require_user_branch_access, scoped_branch_id
from app.core.auth import require_permission, require_super_admin
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.appointments.models import Appointment, AppointmentStatus, AppointmentType
from app.modules.appointments.schemas import (
    AppointmentBookingRead,
    AppointmentCreate,
    FollowUpAppointmentCreate,
    AppointmentGridRead,
    AppointmentRead,
    QueueEntryRead,
)
from app.modules.audit.service import record_audit_event
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import queue_notification_if_allowed
from app.modules.patients.models import Patient
from app.modules.practitioners.models import Practitioner
from app.modules.practitioners.service import check_practitioner_availability, practitioner_is_eligible
from app.modules.consultations.models import Consultation
from app.modules.queue.models import QueueEntry
from app.modules.queue.service import create_queue_entry_for_appointment
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.tenants.models import Branch, Department, Tenant

router = APIRouter(prefix="/appointments")

ACTIVE_APPOINTMENT_STATUSES = {
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.WAITING,
    AppointmentStatus.CALLED,
    AppointmentStatus.PATIENT_NOT_AVAILABLE,
    AppointmentStatus.REQUEUED,
    AppointmentStatus.IN_CONSULTATION,
}


def _appointment_grid_row(row) -> AppointmentGridRead:
    appointment, tenant, branch, patient, department, practitioner, queue_entry, consultation = row
    return AppointmentGridRead(
        id=appointment.id,
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        branch_id=branch.id,
        branch_name=branch.name,
        patient_id=patient.id,
        patient_name=patient.full_name,
        patient_mobile=patient.mobile,
        department_id=department.id if department else appointment.department_id,
        department_name=department.name if department else appointment.department_id,
        practitioner_id=practitioner.id if practitioner else appointment.practitioner_id,
        practitioner_name=practitioner.full_name if practitioner else appointment.practitioner_id,
        token_number=queue_entry.token_number if queue_entry else None,
        appointment_type=appointment.appointment_type,
        visit_purpose=appointment.visit_purpose,
        is_billable=appointment.is_billable,
        appointment_date=appointment.appointment_date,
        appointment_time=appointment.appointment_time,
        status=appointment.status,
        consultation_status=consultation.status.value if consultation else None,
        created_at=appointment.created_at,
    )


def _appointment_grid_statement():
    return (
        select(Appointment, Tenant, Branch, Patient, Department, Practitioner, QueueEntry, Consultation)
        .join(Tenant, Tenant.id == Appointment.tenant_id)
        .join(Branch, Branch.id == Appointment.branch_id)
        .join(Patient, Patient.id == Appointment.patient_id)
        .outerjoin(Department, Department.id == Appointment.department_id)
        .outerjoin(Practitioner, Practitioner.id == Appointment.practitioner_id)
        .outerjoin(QueueEntry, QueueEntry.appointment_id == Appointment.id)
        .outerjoin(Consultation, Consultation.appointment_id == Appointment.id)
    )


def _slot_session(appointment_time: time | None) -> str:
    if appointment_time is None:
        return "unscheduled"
    if appointment_time < time(13, 0):
        return "morning"
    if appointment_time < time(18, 0):
        return "afternoon"
    return "evening"


def _enforce_duplicate_booking_rules(session: Session, tenant_id: str, payload: AppointmentCreate) -> None:
    if payload.appointment_type == AppointmentType.EMERGENCY:
        return
    existing_rows = session.exec(
        select(Appointment).where(
            Appointment.tenant_id == tenant_id,
            Appointment.patient_id == payload.patient_id,
            Appointment.appointment_date == payload.appointment_date,
        )
    ).all()
    active_rows = [row for row in existing_rows if row.status in ACTIVE_APPOINTMENT_STATUSES]
    if not active_rows:
        return

    if payload.practitioner_id and payload.appointment_time:
        for row in active_rows:
            if row.practitioner_id == payload.practitioner_id and row.appointment_time == payload.appointment_time:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Patient already has an active appointment at this time",
                )

    if payload.appointment_time and any(row.appointment_time == payload.appointment_time for row in active_rows):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Patient already has an active appointment at this time",
        )

    if payload.practitioner_id:
        requested_session = _slot_session(payload.appointment_time)
        for row in active_rows:
            if row.practitioner_id == payload.practitioner_id and _slot_session(row.appointment_time) == requested_session:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Patient already has an active appointment with this doctor in the selected timing session",
                )


def _review_billing_defaults(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    payload: AppointmentCreate,
) -> tuple[bool, str | None]:
    if payload.is_billable is not None:
        return payload.is_billable, payload.billing_note
    if payload.appointment_type not in {AppointmentType.FOLLOW_UP, AppointmentType.DOCTOR_REVIEW}:
        return True, payload.billing_note
    if not payload.source_appointment_id:
        return True, payload.billing_note
    source = session.get(Appointment, payload.source_appointment_id)
    if not source or source.tenant_id != tenant_id:
        return True, payload.billing_note
    validity_days, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="follow_up",
        key=SettingKey.FOLLOW_UP_VALIDITY_DAYS,
        branch_id=branch_id,
    )
    try:
        valid_days = int(validity_days or 0)
    except (TypeError, ValueError):
        valid_days = 0
    if valid_days >= 0 and 0 <= (payload.appointment_date - source.appointment_date).days <= valid_days:
        return False, payload.billing_note or f"Auto free review within {valid_days} days"
    return True, payload.billing_note


def _slot_intervals_enabled(session: Session, *, tenant_id: str, branch_id: str) -> bool:
    value, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="appointments",
        key=SettingKey.APPOINTMENT_SLOT_INTERVALS_ENABLED,
        branch_id=branch_id,
    )
    return bool(value)


@router.post(
    "",
    response_model=AppointmentBookingRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(permissions.APPOINTMENTS_MANAGE))],
)
def book_appointment(
    payload: AppointmentCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.APPOINTMENTS_MANAGE)),
    session: Session = Depends(get_session),
) -> AppointmentBookingRead:
    enforce_entitlement(session, tenant_id, "appointments")
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    patient = session.get(Patient, payload.patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid patient")
    if payload.source_appointment_id:
        source_appointment = session.get(Appointment, payload.source_appointment_id)
        if not source_appointment or source_appointment.tenant_id != tenant_id or source_appointment.patient_id != patient.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid source appointment")
    _enforce_duplicate_booking_rules(session, tenant_id, payload)
    if payload.practitioner_id:
        practitioner = session.get(Practitioner, payload.practitioner_id)
        if practitioner:
            if not practitioner_is_eligible(
                session,
                tenant_id=tenant_id,
                practitioner_id=payload.practitioner_id,
                branch_id=payload.branch_id,
                department_id=payload.department_id,
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Practitioner is not assigned to this branch and department",
                )
            if (
                payload.appointment_time
                and payload.appointment_type.value != "emergency"
                and _slot_intervals_enabled(session, tenant_id=tenant_id, branch_id=payload.branch_id)
            ):
                availability = check_practitioner_availability(
                    session,
                    tenant_id=tenant_id,
                    practitioner_id=payload.practitioner_id,
                    branch_id=payload.branch_id,
                    department_id=payload.department_id,
                    appointment_date=payload.appointment_date,
                    appointment_time=payload.appointment_time,
                )
                if not availability.available:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=availability.reason or "Practitioner is not available at this time",
                    )

    is_billable, billing_note = _review_billing_defaults(
        session,
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        payload=payload,
    )
    appointment = Appointment.model_validate(
        payload,
        update={"tenant_id": tenant_id, "is_billable": is_billable, "billing_note": billing_note},
    )
    session.add(appointment)
    session.commit()
    session.refresh(appointment)
    if appointment.appointment_type == AppointmentType.EMERGENCY:
        record_audit_event(
            session,
            tenant_id=tenant_id,
            branch_id=appointment.branch_id,
            actor_user_id=payload.created_by_user_id or current_user.id,
            action="appointment.emergency_override",
            resource_type="appointment",
            resource_id=appointment.id,
            purpose="emergency_queue_override",
            metadata_json=f'{{"emergency_reason": "{appointment.emergency_reason or appointment.reason or "Emergency"}"}}',
            commit=False,
        )
    if appointment.appointment_type in {AppointmentType.DOCTOR_REVIEW, AppointmentType.FITNESS_CERTIFICATE}:
        record_audit_event(
            session,
            tenant_id=tenant_id,
            branch_id=appointment.branch_id,
            actor_user_id=payload.created_by_user_id or current_user.id,
            action=f"appointment.{appointment.appointment_type.value}_booked",
            resource_type="appointment",
            resource_id=appointment.id,
            purpose="visit_purpose_tracking",
            metadata_json=(
                f'{{"visit_purpose": "{appointment.visit_purpose or appointment.appointment_type.value}", '
                f'"is_billable": {str(appointment.is_billable).lower()}, '
                f'"source_appointment_id": "{appointment.source_appointment_id or ""}"}}'
            ),
            commit=False,
        )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=appointment.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="appointment.booked",
        resource_type="appointment",
        resource_id=appointment.id,
        purpose="appointment_booking",
        commit=False,
    )
    queue_entry = create_queue_entry_for_appointment(session, appointment)
    for provider in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
        queue_notification_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=appointment.branch_id,
            provider=provider,
            event_type=NotificationEventType.APPOINTMENT_REMINDER,
            recipient=patient.mobile,
            subject="Appointment booked",
            message=f"Your appointment token is {queue_entry.token_number}.",
            resource_type="appointment",
            resource_id=appointment.id,
            queued_by_user_id=payload.created_by_user_id,
        )
    return AppointmentBookingRead(
        appointment=AppointmentRead.model_validate(appointment, from_attributes=True),
        queue_entry=QueueEntryRead.model_validate(queue_entry, from_attributes=True),
    )


@router.post(
    "/{appointment_id}/follow-up",
    response_model=AppointmentBookingRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(permissions.APPOINTMENTS_MANAGE))],
)
def book_follow_up_appointment(
    appointment_id: str,
    payload: FollowUpAppointmentCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.APPOINTMENTS_MANAGE)),
    session: Session = Depends(get_session),
) -> AppointmentBookingRead:
    enforce_entitlement(session, tenant_id, "appointments")
    source = session.get(Appointment, appointment_id)
    if not source or source.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    require_user_branch_access(current_user, source.branch_id)
    follow_up_payload = AppointmentCreate(
        branch_id=source.branch_id,
        patient_id=source.patient_id,
        department_id=source.department_id,
        practitioner_id=source.practitioner_id,
        appointment_type=AppointmentType.FOLLOW_UP,
        appointment_date=payload.appointment_date,
        appointment_time=payload.appointment_time,
        reason=payload.reason or f"Follow-up for appointment {source.id}",
        visit_purpose="doctor_review",
        source_appointment_id=source.id,
        is_billable=payload.is_billable,
        billing_note=payload.billing_note,
        created_by_user_id=payload.created_by_user_id or current_user.id,
    )
    _enforce_duplicate_booking_rules(session, tenant_id, follow_up_payload)
    appointment = Appointment.model_validate(follow_up_payload, update={"tenant_id": tenant_id})
    session.add(appointment)
    session.commit()
    session.refresh(appointment)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=appointment.branch_id,
        actor_user_id=follow_up_payload.created_by_user_id,
        action="appointment.follow_up_booked",
        resource_type="appointment",
        resource_id=appointment.id,
        purpose="follow_up_booking",
        metadata_json=f'{{"source_appointment_id": "{source.id}"}}',
        commit=False,
    )
    queue_entry = create_queue_entry_for_appointment(session, appointment)
    return AppointmentBookingRead(
        appointment=AppointmentRead.model_validate(appointment, from_attributes=True),
        queue_entry=QueueEntryRead.model_validate(queue_entry, from_attributes=True),
    )


@router.get(
    "",
    response_model=list[AppointmentRead],
    dependencies=[Depends(require_permission(permissions.APPOINTMENTS_MANAGE))],
)
def list_appointments(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    department_id: str | None = None,
    appointment_date: date | None = None,
    q: str | None = Query(default=None, max_length=120),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(require_permission(permissions.APPOINTMENTS_MANAGE)),
    session: Session = Depends(get_session),
) -> list[Appointment]:
    enforce_entitlement(session, tenant_id, "appointments")
    branch_id = scoped_branch_id(current_user, branch_id)
    require_branch_in_tenant(session, tenant_id, branch_id)
    statement = select(Appointment).where(Appointment.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(Appointment.branch_id == branch_id)
    if department_id:
        statement = statement.where(Appointment.department_id == department_id)
    if appointment_date:
        statement = statement.where(Appointment.appointment_date == appointment_date)
    if q:
        pattern = f"%{q.strip().lower()}%"
        statement = statement.join(Patient, Patient.id == Appointment.patient_id).where(
            or_(
                func.lower(Patient.patient_number).like(pattern),
                func.lower(Patient.full_name).like(pattern),
                func.lower(Patient.mobile).like(pattern),
                func.lower(Patient.guardian_mobile).like(pattern),
            )
        )
    return list(session.exec(statement.order_by(Appointment.appointment_date.desc(), Appointment.created_at.desc()).offset(skip).limit(limit)).all())


@router.get(
    "/platform/all",
    response_model=list[AppointmentGridRead],
    dependencies=[Depends(require_super_admin)],
)
def list_platform_appointments(
    tenant_id: str | None = None,
    branch_id: str | None = None,
    department_id: str | None = None,
    appointment_date: date | None = None,
    q: str | None = Query(default=None, max_length=120),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
) -> list[AppointmentGridRead]:
    statement = _appointment_grid_statement()
    if tenant_id:
        statement = statement.where(Appointment.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(Appointment.branch_id == branch_id)
    if department_id:
        statement = statement.where(Appointment.department_id == department_id)
    if appointment_date:
        statement = statement.where(Appointment.appointment_date == appointment_date)
    if q:
        pattern = f"%{q.strip().lower()}%"
        statement = statement.where(
            or_(
                func.lower(Tenant.name).like(pattern),
                func.lower(Branch.name).like(pattern),
                func.lower(Patient.patient_number).like(pattern),
                func.lower(Patient.full_name).like(pattern),
                func.lower(Patient.mobile).like(pattern),
                func.lower(Patient.guardian_mobile).like(pattern),
                func.lower(Department.name).like(pattern),
                func.lower(Practitioner.full_name).like(pattern),
                func.lower(QueueEntry.token_number).like(pattern),
            )
        )
    rows = session.exec(
        statement.order_by(Appointment.appointment_date.desc(), Appointment.created_at.desc()).offset(skip).limit(limit)
    ).all()
    return [_appointment_grid_row(row) for row in rows]


@router.get(
    "/{appointment_id}",
    response_model=AppointmentRead,
    dependencies=[Depends(require_permission(permissions.APPOINTMENTS_MANAGE))],
)
def get_appointment(
    appointment_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.APPOINTMENTS_MANAGE)),
    session: Session = Depends(get_session),
) -> Appointment:
    enforce_entitlement(session, tenant_id, "appointments")
    appointment = session.get(Appointment, appointment_id)
    if not appointment or appointment.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    require_user_branch_access(current_user, appointment.branch_id)
    return appointment
