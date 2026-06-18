import hashlib
import json
from datetime import date, time
from time import monotonic

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.core.access_control import (
    current_doctor_practitioner_id,
    enforce_entitlement,
    require_branch_in_tenant,
    require_doctor_practitioner_access,
    require_user_branch_access,
    scoped_branch_id,
)
from app.core.auth import require_any_permission, require_super_admin
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.appointments.models import (
    Appointment,
    AppointmentStatus,
    AppointmentType,
)
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
from app.modules.practitioners.service import (
    check_practitioner_availability,
    check_practitioner_date_availability,
    generate_practitioner_calendar,
    practitioner_is_eligible,
)
from app.modules.consultations.models import Consultation
from app.modules.queue.models import QueueEntry
from app.modules.queue.service import create_queue_entry_for_appointment
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.tenants.models import Branch, Department, Tenant

router = APIRouter(prefix="/appointments")
IDEMPOTENCY_TTL_SECONDS = 300
_appointment_idempotency_cache: dict[tuple[str, str, str], dict] = {}

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


def _appointment_payload_hash(payload: AppointmentCreate) -> str:
    encoded = json.dumps(
        payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def _cleanup_appointment_idempotency_cache() -> None:
    now = monotonic()
    expired = [
        key
        for key, value in _appointment_idempotency_cache.items()
        if value["expires_at"] <= now
    ]
    for key in expired:
        _appointment_idempotency_cache.pop(key, None)


def _normalize_department_lookup(value: str | None) -> str:
    return "".join(char for char in str(value or "").lower() if char.isalnum())


def _resolve_department_id(
    session: Session, tenant_id: str, department_id: str | None
) -> str | None:
    if not department_id:
        return None
    department = session.get(Department, department_id)
    if department and department.tenant_id == tenant_id:
        return department.id
    requested = _normalize_department_lookup(department_id)
    departments = session.exec(
        select(Department).where(Department.tenant_id == tenant_id)
    ).all()
    for department in departments:
        department_keys = {
            _normalize_department_lookup(department.id),
            _normalize_department_lookup(department.code),
            _normalize_department_lookup(department.name),
        }
        if requested in department_keys:
            return department.id
        if requested == "general" and _normalize_department_lookup(
            department.name
        ).startswith("general"):
            return department.id
    return department_id


def _appointment_grid_row(row) -> AppointmentGridRead:
    (
        appointment,
        tenant,
        branch,
        patient,
        department,
        practitioner,
        queue_entry,
        consultation,
    ) = row
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
        practitioner_id=practitioner.id
        if practitioner
        else appointment.practitioner_id,
        practitioner_name=practitioner.full_name
        if practitioner
        else appointment.practitioner_id,
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
        select(
            Appointment,
            Tenant,
            Branch,
            Patient,
            Department,
            Practitioner,
            QueueEntry,
            Consultation,
        )
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


def _enforce_duplicate_booking_rules(
    session: Session, tenant_id: str, payload: AppointmentCreate
) -> None:
    if payload.appointment_type == AppointmentType.EMERGENCY:
        return
    existing_rows = session.exec(
        select(Appointment).where(
            Appointment.tenant_id == tenant_id,
            Appointment.patient_id == payload.patient_id,
            Appointment.appointment_date == payload.appointment_date,
        )
    ).all()
    active_rows = [
        row for row in existing_rows if row.status in ACTIVE_APPOINTMENT_STATUSES
    ]
    if not active_rows:
        return

    if payload.practitioner_id and payload.appointment_time:
        for row in active_rows:
            if (
                row.practitioner_id == payload.practitioner_id
                and row.appointment_time == payload.appointment_time
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Patient already has an active appointment at this time",
                )

    if payload.appointment_time and any(
        row.appointment_time == payload.appointment_time for row in active_rows
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Patient already has an active appointment at this time",
        )

    if payload.practitioner_id:
        requested_session = _slot_session(payload.appointment_time)
        for row in active_rows:
            if (
                row.practitioner_id == payload.practitioner_id
                and _slot_session(row.appointment_time) == requested_session
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Patient already has an active appointment with this doctor in the selected timing session",
                )


def _enforce_practitioner_slot_conflict(
    session: Session,
    tenant_id: str,
    payload: AppointmentCreate,
) -> None:
    if (
        payload.appointment_type == AppointmentType.EMERGENCY
        or not payload.practitioner_id
        or not payload.appointment_time
    ):
        return
    existing_rows = session.exec(
        select(Appointment).where(
            Appointment.tenant_id == tenant_id,
            Appointment.practitioner_id == payload.practitioner_id,
            Appointment.appointment_date == payload.appointment_date,
            Appointment.appointment_time == payload.appointment_time,
        )
    ).all()
    if any(row.status in ACTIVE_APPOINTMENT_STATUSES for row in existing_rows):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Doctor already has an active appointment at this time",
        )


def _first_available_practitioner_slot(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    branch_id: str,
    department_id: str | None,
    appointment_date: date,
) -> time:
    calendar = generate_practitioner_calendar(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        department_id=department_id,
        start_date=appointment_date,
        end_date=appointment_date,
    )
    day = calendar.days[0] if calendar.days else None
    if not day or not day.slots:
        availability = check_practitioner_date_availability(
            session,
            tenant_id=tenant_id,
            practitioner_id=practitioner_id,
            branch_id=branch_id,
            department_id=department_id,
            appointment_date=appointment_date,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=availability.reason
            or "No consultation timing available for this doctor/date",
        )
    first_available_slot = next((slot for slot in day.slots if slot.available), None)
    if not first_available_slot:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No available consultation slot for this doctor/date",
        )
    return first_available_slot.start_time


def _review_billing_defaults(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    payload: AppointmentCreate,
) -> tuple[bool, str | None]:
    if payload.is_billable is not None:
        return payload.is_billable, payload.billing_note
    if payload.appointment_type not in {
        AppointmentType.FOLLOW_UP,
        AppointmentType.DOCTOR_REVIEW,
    }:
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
    if (
        valid_days >= 0
        and 0 <= (payload.appointment_date - source.appointment_date).days <= valid_days
    ):
        return (
            False,
            payload.billing_note or f"Auto free review within {valid_days} days",
        )
    return True, payload.billing_note


@router.post(
    "",
    response_model=AppointmentBookingRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(
            require_any_permission(
                permissions.APPOINTMENTS_MANAGE,
                permissions.APPOINTMENTS_CREATE,
            )
        )
    ],
)
def book_appointment(
    payload: AppointmentCreate,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.APPOINTMENTS_MANAGE,
            permissions.APPOINTMENTS_CREATE,
        )
    ),
    session: Session = Depends(get_session),
) -> AppointmentBookingRead:
    _cleanup_appointment_idempotency_cache()
    cache_key: tuple[str, str, str] | None = None

    enforce_entitlement(session, tenant_id, "appointments")
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    resolved_department_id = _resolve_department_id(
        session, tenant_id, payload.department_id
    )
    if resolved_department_id != payload.department_id:
        payload = payload.model_copy(update={"department_id": resolved_department_id})
    request_hash = _appointment_payload_hash(payload)
    if idempotency_key:
        cache_key = (tenant_id, current_user.id, idempotency_key)
        cached = _appointment_idempotency_cache.get(cache_key)
        if cached:
            if cached["request_hash"] != request_hash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Idempotency key was reused with a different appointment request",
                )
            response.headers["X-Idempotency-Replayed"] = "true"
            return cached["booking"]

    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    doctor_practitioner_id = current_doctor_practitioner_id(
        session, tenant_id, current_user
    )
    if doctor_practitioner_id and payload.practitioner_id != doctor_practitioner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access denied"
        )
    patient = session.get(Patient, payload.patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid patient"
        )
    if payload.source_appointment_id:
        source_appointment = session.get(Appointment, payload.source_appointment_id)
        if (
            not source_appointment
            or source_appointment.tenant_id != tenant_id
            or source_appointment.patient_id != patient.id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid source appointment",
            )
    practitioner_requires_schedule = False
    if payload.practitioner_id:
        practitioner = session.get(Practitioner, payload.practitioner_id)
        if practitioner:
            practitioner_requires_schedule = (
                payload.appointment_type.value != "emergency"
            )
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
            if payload.appointment_type.value != "emergency":
                if not payload.appointment_time:
                    appointment_time = _first_available_practitioner_slot(
                        session,
                        tenant_id=tenant_id,
                        practitioner_id=payload.practitioner_id,
                        branch_id=payload.branch_id,
                        department_id=payload.department_id,
                        appointment_date=payload.appointment_date,
                    )
                    payload = payload.model_copy(
                        update={"appointment_time": appointment_time}
                    )
    _enforce_duplicate_booking_rules(session, tenant_id, payload)
    _enforce_practitioner_slot_conflict(session, tenant_id, payload)
    if practitioner_requires_schedule and payload.appointment_time:
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
                detail=availability.reason
                or "Practitioner is not available at this time",
            )

    is_billable, billing_note = _review_billing_defaults(
        session,
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        payload=payload,
    )
    # Custom price applies only to chargeable, non-OP visits. OP uses the fee
    # rule; free visits carry no price.
    custom_fee_amount = (
        payload.custom_fee_amount
        if is_billable and payload.appointment_type != AppointmentType.OP
        else None
    )
    appointment = Appointment.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "is_billable": is_billable,
            "billing_note": billing_note,
            "custom_fee_amount": custom_fee_amount,
        },
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
    if appointment.appointment_type in {
        AppointmentType.DOCTOR_REVIEW,
        AppointmentType.FITNESS_CERTIFICATE,
    }:
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
    booking = AppointmentBookingRead(
        appointment=AppointmentRead.model_validate(appointment, from_attributes=True),
        queue_entry=QueueEntryRead.model_validate(queue_entry, from_attributes=True),
    )
    if cache_key:
        _appointment_idempotency_cache[cache_key] = {
            "request_hash": request_hash,
            "booking": booking,
            "expires_at": monotonic() + IDEMPOTENCY_TTL_SECONDS,
        }
    return booking


@router.post(
    "/{appointment_id}/follow-up",
    response_model=AppointmentBookingRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(
            require_any_permission(
                permissions.APPOINTMENTS_MANAGE,
                permissions.APPOINTMENTS_CREATE,
            )
        )
    ],
)
def book_follow_up_appointment(
    appointment_id: str,
    payload: FollowUpAppointmentCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.APPOINTMENTS_MANAGE,
            permissions.APPOINTMENTS_CREATE,
        )
    ),
    session: Session = Depends(get_session),
) -> AppointmentBookingRead:
    enforce_entitlement(session, tenant_id, "appointments")
    source = session.get(Appointment, appointment_id)
    if not source or source.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
        )
    require_user_branch_access(current_user, source.branch_id)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, source.practitioner_id
    )
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
    appointment = Appointment.model_validate(
        follow_up_payload, update={"tenant_id": tenant_id}
    )
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
    dependencies=[
        Depends(
            require_any_permission(
                permissions.APPOINTMENTS_MANAGE,
                permissions.APPOINTMENTS_READ,
            )
        )
    ],
)
def list_appointments(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    department_id: str | None = None,
    practitioner_id: str | None = None,
    appointment_date: date | None = None,
    q: str | None = Query(default=None, max_length=120),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(
        require_any_permission(
            permissions.APPOINTMENTS_MANAGE,
            permissions.APPOINTMENTS_READ,
        )
    ),
    session: Session = Depends(get_session),
) -> list[Appointment]:
    enforce_entitlement(session, tenant_id, "appointments")
    branch_id = scoped_branch_id(current_user, branch_id)
    require_branch_in_tenant(session, tenant_id, branch_id)
    doctor_practitioner_id = current_doctor_practitioner_id(
        session, tenant_id, current_user
    )
    statement = select(Appointment).where(Appointment.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(Appointment.branch_id == branch_id)
    if department_id:
        statement = statement.where(Appointment.department_id == department_id)
    if doctor_practitioner_id:
        statement = statement.where(
            Appointment.practitioner_id == doctor_practitioner_id
        )
    elif practitioner_id:
        statement = statement.where(Appointment.practitioner_id == practitioner_id)
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
    return list(
        session.exec(
            statement.order_by(
                Appointment.appointment_date.desc(), Appointment.created_at.desc()
            )
            .offset(skip)
            .limit(limit)
        ).all()
    )


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
        statement.order_by(
            Appointment.appointment_date.desc(), Appointment.created_at.desc()
        )
        .offset(skip)
        .limit(limit)
    ).all()
    return [_appointment_grid_row(row) for row in rows]


@router.get(
    "/{appointment_id}",
    response_model=AppointmentRead,
    dependencies=[
        Depends(
            require_any_permission(
                permissions.APPOINTMENTS_MANAGE,
                permissions.APPOINTMENTS_READ,
            )
        )
    ],
)
def get_appointment(
    appointment_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.APPOINTMENTS_MANAGE,
            permissions.APPOINTMENTS_READ,
        )
    ),
    session: Session = Depends(get_session),
) -> Appointment:
    enforce_entitlement(session, tenant_id, "appointments")
    appointment = session.get(Appointment, appointment_id)
    if not appointment or appointment.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
        )
    require_user_branch_access(current_user, appointment.branch_id)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, appointment.practitioner_id
    )
    return appointment
