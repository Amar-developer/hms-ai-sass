import hashlib
import json
from datetime import date, time

from fastapi import HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.core.access_control import (
    current_doctor_practitioner_id,
    enforce_entitlement,
    require_branch_in_tenant,
    require_doctor_practitioner_access,
    require_user_branch_access,
)
from app.modules.appointments.models import (
    Appointment,
    AppointmentIdempotencyKey,
    AppointmentStatus,
    AppointmentType,
)
from app.modules.appointments.repositories import (
    AppointmentIdempotencyRepository,
    AppointmentReferenceRepository,
    AppointmentRepository,
)
from app.modules.appointments.schemas import (
    AppointmentBookingRead,
    AppointmentCreate,
    AppointmentRead,
    AppointmentReschedule,
    FollowUpAppointmentCreate,
    QueueEntryRead,
)
from app.modules.appointments.services.billing_rules import AppointmentBillingResolver
from app.modules.appointments.services.conflict_rules import (
    BookingConflictValidator,
    DuplicatePatientBookingRule,
)
from app.modules.audit.service import record_audit_event
from app.modules.consultations.models import ConsultationStatus
from app.modules.identity.models import User
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import (
    queue_notification_if_allowed,
    queue_whatsapp_template_if_allowed,
    whatsapp_template_integration_enabled,
)
from app.modules.notifications.services.in_app import notify_appointment_booked
from app.modules.practitioners.service import (
    check_practitioner_availability,
    check_practitioner_date_availability,
    generate_practitioner_calendar,
    practitioner_is_eligible,
)
from app.modules.queue.service import (
    create_queue_entry_for_appointment,
    next_token_number,
    record_queue_event,
)
from app.modules.settings.numbering import next_document_number
from app.modules.tenants.models import now_utc


def _appointment_payload_hash(payload: AppointmentCreate) -> str:
    encoded = json.dumps(
        payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def _normalize_department_lookup(value: str | None) -> str:
    return "".join(char for char in str(value or "").lower() if char.isalnum())


class AppointmentBookingService:
    """Handles appointment booking and follow-up booking lifecycle."""

    def __init__(self, session: Session):
        self.session = session
        self.appointments = AppointmentRepository(session)
        self.references = AppointmentReferenceRepository(session)
        self.idempotency = AppointmentIdempotencyRepository(session)
        self.conflicts = BookingConflictValidator(session)
        self.billing = AppointmentBillingResolver(session)

    def _resolve_department_id(
        self, tenant_id: str, department_id: str | None
    ) -> str | None:
        if not department_id:
            return None
        department = self.references.get_department_for_tenant(tenant_id, department_id)
        if department:
            return department.id
        requested = _normalize_department_lookup(department_id)
        departments = self.references.list_departments_for_tenant(tenant_id)
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

    def _first_available_practitioner_slot(
        self,
        *,
        tenant_id: str,
        practitioner_id: str,
        branch_id: str,
        department_id: str | None,
        appointment_date: date,
    ) -> time:
        calendar = generate_practitioner_calendar(
            self.session,
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
                self.session,
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
        first_available_slot = next(
            (slot for slot in day.slots if slot.available), None
        )
        if not first_available_slot:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No available consultation slot for this doctor/date",
            )
        return first_available_slot.start_time

    def book_appointment(
        self,
        *,
        tenant_id: str,
        payload: AppointmentCreate,
        idempotency_key: str | None,
        response: Response,
        actor: User,
    ) -> AppointmentBookingRead:
        enforce_entitlement(self.session, tenant_id, "appointments")
        tenant = self.references.get_tenant(tenant_id)
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
            )
        resolved_department_id = self._resolve_department_id(
            tenant_id, payload.department_id
        )
        if resolved_department_id != payload.department_id:
            payload = payload.model_copy(
                update={"department_id": resolved_department_id}
            )
        request_hash = _appointment_payload_hash(payload)
        if idempotency_key:
            existing_key = self.idempotency.get(
                tenant_id=tenant_id,
                user_id=actor.id,
                idempotency_key=idempotency_key,
            )
            if existing_key:
                if existing_key.request_hash != request_hash:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Idempotency key was reused with a different appointment request",
                    )
                response.headers["X-Idempotency-Replayed"] = "true"
                return AppointmentBookingRead.model_validate_json(
                    existing_key.booking_json
                )

        require_branch_in_tenant(self.session, tenant_id, payload.branch_id)
        require_user_branch_access(actor, payload.branch_id)
        doctor_practitioner_id = current_doctor_practitioner_id(
            self.session, tenant_id, actor
        )
        if doctor_practitioner_id and payload.practitioner_id != doctor_practitioner_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access denied"
            )
        patient = self.references.get_patient_for_tenant(tenant_id, payload.patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid patient"
            )
        if payload.referrer_patient_id:
            referrer = self.references.get_patient_for_tenant(
                tenant_id, payload.referrer_patient_id
            )
            if not referrer:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid referrer patient",
                )
        if payload.source_appointment_id:
            source_appointment = self.appointments.get_for_tenant(
                tenant_id, payload.source_appointment_id
            )
            if not source_appointment or source_appointment.patient_id != patient.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid source appointment",
                )
        practitioner_requires_schedule = False
        practitioner = None
        if payload.practitioner_id:
            practitioner = self.references.get_practitioner(payload.practitioner_id)
            if practitioner:
                practitioner_requires_schedule = (
                    payload.appointment_type.value != "emergency"
                )
                if not practitioner_is_eligible(
                    self.session,
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
                        appointment_time = self._first_available_practitioner_slot(
                            tenant_id=tenant_id,
                            practitioner_id=payload.practitioner_id,
                            branch_id=payload.branch_id,
                            department_id=payload.department_id,
                            appointment_date=payload.appointment_date,
                        )
                        payload = payload.model_copy(
                            update={"appointment_time": appointment_time}
                        )
        self.conflicts.validate(tenant_id, payload)
        if practitioner_requires_schedule and payload.appointment_time:
            availability = check_practitioner_availability(
                self.session,
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

        is_billable, billing_note = self.billing.resolve_billing_defaults(
            tenant_id=tenant_id,
            branch_id=payload.branch_id,
            payload=payload,
        )
        custom_fee_amount = self.billing.resolve_custom_fee_amount(
            is_billable=is_billable, payload=payload
        )
        actor_user_id = payload.created_by_user_id or actor.id
        appointment = Appointment.model_validate(
            payload,
            update={
                "tenant_id": tenant_id,
                "created_by_user_id": actor_user_id,
                "updated_by_user_id": actor_user_id,
                "appointment_number": next_document_number(
                    self.session,
                    tenant_id=tenant_id,
                    entity="appointment",
                    branch_id=payload.branch_id,
                ),
                "is_billable": is_billable,
                "billing_note": billing_note,
                "custom_fee_amount": custom_fee_amount,
            },
        )
        self.appointments.add(appointment)
        self.session.commit()
        self.session.refresh(appointment)
        if appointment.appointment_type == AppointmentType.EMERGENCY:
            record_audit_event(
                self.session,
                tenant_id=tenant_id,
                branch_id=appointment.branch_id,
                actor_user_id=actor_user_id,
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
                self.session,
                tenant_id=tenant_id,
                branch_id=appointment.branch_id,
                actor_user_id=actor_user_id,
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
            self.session,
            tenant_id=tenant_id,
            branch_id=appointment.branch_id,
            actor_user_id=actor_user_id,
            action="appointment.booked",
            resource_type="appointment",
            resource_id=appointment.id,
            purpose="appointment_booking",
            commit=False,
        )
        queue_entry = create_queue_entry_for_appointment(self.session, appointment)
        queue_notification_if_allowed(
            self.session,
            tenant_id=tenant_id,
            branch_id=appointment.branch_id,
            provider=NotificationProvider.SMS,
            event_type=NotificationEventType.APPOINTMENT_REMINDER,
            recipient=patient.mobile,
            subject="Appointment booked",
            message=f"Your appointment token is {queue_entry.token_number}.",
            resource_type="appointment",
            resource_id=appointment.id,
            queued_by_user_id=actor_user_id,
        )
        patient_template_event = queue_whatsapp_template_if_allowed(
            self.session,
            tenant_id=tenant_id,
            branch_id=appointment.branch_id,
            flow_key="appointment_booked_patient",
            recipient=patient.mobile,
            resource_type="appointment",
            resource_id=appointment.id,
            dedupe_key=f"whatsapp:appointment:{appointment.id}:patient",
            queued_by_user_id=actor_user_id,
        )
        if not patient_template_event and not whatsapp_template_integration_enabled(
            self.session, tenant_id
        ):
            queue_notification_if_allowed(
                self.session,
                tenant_id=tenant_id,
                branch_id=appointment.branch_id,
                provider=NotificationProvider.WHATSAPP,
                event_type=NotificationEventType.APPOINTMENT_REMINDER,
                recipient=patient.mobile,
                subject="Appointment booked",
                message=f"Your appointment token is {queue_entry.token_number}.",
                resource_type="appointment",
                resource_id=appointment.id,
                queued_by_user_id=actor_user_id,
            )
        if practitioner:
            queue_whatsapp_template_if_allowed(
                self.session,
                tenant_id=tenant_id,
                branch_id=appointment.branch_id,
                flow_key="appointment_booked_doctor",
                recipient=practitioner.mobile,
                resource_type="appointment",
                resource_id=appointment.id,
                dedupe_key=f"whatsapp:appointment:{appointment.id}:doctor",
                queued_by_user_id=actor_user_id,
            )
        notify_appointment_booked(
            self.session,
            appointment=appointment,
            patient_name=patient.full_name,
            token_number=queue_entry.token_number,
            actor_user_id=actor.id,
        )
        booking = AppointmentBookingRead(
            appointment=AppointmentRead.model_validate(
                appointment, from_attributes=True
            ),
            queue_entry=QueueEntryRead.model_validate(
                queue_entry, from_attributes=True
            ),
        )
        if idempotency_key:
            self.idempotency.add(
                AppointmentIdempotencyKey(
                    tenant_id=tenant_id,
                    user_id=actor.id,
                    idempotency_key=idempotency_key,
                    request_hash=request_hash,
                    booking_json=booking.model_dump_json(),
                    appointment_id=appointment.id,
                )
            )
            try:
                self.session.commit()
            except IntegrityError:
                # Another concurrent request with the same key won the race and
                # already recorded its own booking — replay that one instead of
                # erroring, which is what an idempotency key promises the client.
                self.session.rollback()
                existing_key = self.idempotency.get(
                    tenant_id=tenant_id,
                    user_id=actor.id,
                    idempotency_key=idempotency_key,
                )
                if existing_key:
                    response.headers["X-Idempotency-Replayed"] = "true"
                    return AppointmentBookingRead.model_validate_json(
                        existing_key.booking_json
                    )
        return booking

    def reschedule_appointment(
        self,
        *,
        tenant_id: str,
        appointment_id: str,
        payload: AppointmentReschedule,
        actor: User,
    ) -> AppointmentBookingRead:
        enforce_entitlement(self.session, tenant_id, "appointments")
        appointment = self.appointments.get_for_tenant(tenant_id, appointment_id)
        if not appointment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Appointment not found",
            )
        require_user_branch_access(actor, appointment.branch_id)
        blocked_statuses = {
            AppointmentStatus.IN_CONSULTATION,
            AppointmentStatus.CONSULTATION_COMPLETED,
            AppointmentStatus.BILLED,
            AppointmentStatus.CANCELLED,
            AppointmentStatus.NO_SHOW,
        }
        if appointment.status in blocked_statuses:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Completed, active-consultation, cancelled, or no-show appointments cannot be rescheduled",
            )
        consultation = self.references.get_consultation_for_appointment(
            tenant_id=tenant_id,
            appointment_id=appointment.id,
        )
        if consultation and consultation.status in {
            ConsultationStatus.IN_PROGRESS,
            ConsultationStatus.SIGNED,
        }:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Appointments with an active or completed consultation cannot be rescheduled",
            )
        if payload.appointment_date == appointment.appointment_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select a different appointment date",
            )

        appointment_time = payload.appointment_time
        if (
            appointment.appointment_type != AppointmentType.EMERGENCY
            and appointment.practitioner_id
        ):
            if appointment_time is None:
                appointment_time = self._first_available_practitioner_slot(
                    tenant_id=tenant_id,
                    practitioner_id=appointment.practitioner_id,
                    branch_id=appointment.branch_id,
                    department_id=appointment.department_id,
                    appointment_date=payload.appointment_date,
                )
            else:
                availability = check_practitioner_availability(
                    self.session,
                    tenant_id=tenant_id,
                    practitioner_id=appointment.practitioner_id,
                    branch_id=appointment.branch_id,
                    department_id=appointment.department_id,
                    appointment_date=payload.appointment_date,
                    appointment_time=appointment_time,
                )
                if not availability.available:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=availability.reason
                        or "Practitioner is not available at this time",
                    )

        candidate = AppointmentCreate(
            branch_id=appointment.branch_id,
            patient_id=appointment.patient_id,
            department_id=appointment.department_id or "",
            practitioner_id=appointment.practitioner_id or "",
            appointment_type=appointment.appointment_type,
            appointment_date=payload.appointment_date,
            appointment_time=appointment_time,
            acquisition_source=appointment.acquisition_source,
            referrer_patient_id=appointment.referrer_patient_id,
            referrer_name=appointment.referrer_name,
            reason=appointment.reason,
            visit_purpose=appointment.visit_purpose,
            source_appointment_id=appointment.source_appointment_id,
            is_billable=appointment.is_billable,
            custom_fee_amount=appointment.custom_fee_amount,
            billing_note=appointment.billing_note,
            emergency_reason=appointment.emergency_reason,
            intake_vitals=appointment.intake_vitals,
            intake_complaints=appointment.intake_complaints,
            created_by_user_id=appointment.created_by_user_id,
        )
        self.conflicts.validate(tenant_id, candidate)

        previous_date = appointment.appointment_date
        previous_time = appointment.appointment_time
        previous_status = appointment.status
        appointment.appointment_date = payload.appointment_date
        appointment.appointment_time = appointment_time
        appointment.status = AppointmentStatus.WAITING
        appointment.updated_at = now_utc()
        appointment.updated_by_user_id = actor.id
        self.session.add(appointment)
        self.session.flush()

        queue_entry = self.references.get_queue_entry_for_appointment(
            tenant_id=tenant_id,
            appointment_id=appointment.id,
        )
        if queue_entry:
            queue_entry.token_number = next_token_number(
                self.session,
                tenant_id=tenant_id,
                branch_id=appointment.branch_id,
                practitioner_id=appointment.practitioner_id,
                department_id=appointment.department_id,
                appointment_date=appointment.appointment_date,
                emergency=appointment.appointment_type == AppointmentType.EMERGENCY,
                exclude_appointment_id=appointment.id,
            )
            queue_entry.status = AppointmentStatus.WAITING
            queue_entry.missed_call_count = 0
            queue_entry.called_at = None
            queue_entry.completed_at = None
            queue_entry.updated_at = now_utc()
            queue_entry.updated_by_user_id = actor.id
            self.session.add(queue_entry)
            record_queue_event(
                self.session,
                entry=queue_entry,
                appointment=appointment,
                action="queue.appointment_rescheduled",
                from_status=previous_status,
                to_status=AppointmentStatus.WAITING,
                reason=f"Rescheduled from {previous_date} to {appointment.appointment_date}",
                actor_user_id=actor.id,
            )
        else:
            self.session.commit()
            self.session.refresh(appointment)
            queue_entry = create_queue_entry_for_appointment(self.session, appointment)

        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=appointment.branch_id,
            actor_user_id=actor.id,
            action="appointment.rescheduled",
            resource_type="appointment",
            resource_id=appointment.id,
            purpose="appointment_scheduling",
            metadata_json=json.dumps(
                {
                    "previous_date": str(previous_date),
                    "previous_time": str(previous_time or ""),
                    "appointment_date": str(appointment.appointment_date),
                    "appointment_time": str(appointment.appointment_time or ""),
                }
            ),
        )
        self.session.refresh(appointment)
        self.session.refresh(queue_entry)
        return AppointmentBookingRead(
            appointment=AppointmentRead.model_validate(
                appointment, from_attributes=True
            ),
            queue_entry=QueueEntryRead.model_validate(
                queue_entry, from_attributes=True
            ),
        )

    def book_follow_up_appointment(
        self,
        *,
        tenant_id: str,
        appointment_id: str,
        payload: FollowUpAppointmentCreate,
        actor: User,
    ) -> AppointmentBookingRead:
        enforce_entitlement(self.session, tenant_id, "appointments")
        source = self.appointments.get_for_tenant(tenant_id, appointment_id)
        if not source:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
            )
        require_user_branch_access(actor, source.branch_id)
        require_doctor_practitioner_access(
            self.session, tenant_id, actor, source.practitioner_id
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
            created_by_user_id=payload.created_by_user_id or actor.id,
        )
        actor_user_id = follow_up_payload.created_by_user_id or actor.id
        DuplicatePatientBookingRule(self.session).check(tenant_id, follow_up_payload)
        appointment = Appointment.model_validate(
            follow_up_payload,
            update={
                "tenant_id": tenant_id,
                "created_by_user_id": actor_user_id,
                "updated_by_user_id": actor_user_id,
                "appointment_number": next_document_number(
                    self.session,
                    tenant_id=tenant_id,
                    entity="appointment",
                    branch_id=follow_up_payload.branch_id,
                ),
            },
        )
        self.appointments.add(appointment)
        self.session.commit()
        self.session.refresh(appointment)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=appointment.branch_id,
            actor_user_id=actor_user_id,
            action="appointment.follow_up_booked",
            resource_type="appointment",
            resource_id=appointment.id,
            purpose="follow_up_booking",
            metadata_json=f'{{"source_appointment_id": "{source.id}"}}',
            commit=False,
        )
        queue_entry = create_queue_entry_for_appointment(self.session, appointment)
        patient = self.references.get_patient_for_tenant(
            tenant_id, appointment.patient_id
        )
        notify_appointment_booked(
            self.session,
            appointment=appointment,
            patient_name=patient.full_name if patient else "Patient",
            token_number=queue_entry.token_number,
            actor_user_id=actor.id,
        )
        return AppointmentBookingRead(
            appointment=AppointmentRead.model_validate(
                appointment, from_attributes=True
            ),
            queue_entry=QueueEntryRead.model_validate(
                queue_entry, from_attributes=True
            ),
        )
