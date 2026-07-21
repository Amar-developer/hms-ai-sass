from typing import Protocol

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.appointments.constants import ACTIVE_APPOINTMENT_STATUSES, slot_session
from app.modules.appointments.models import AppointmentType
from app.modules.appointments.repositories import (
    AppointmentReferenceRepository,
    AppointmentRepository,
)
from app.modules.appointments.schemas import AppointmentCreate


class BookingConflictRule(Protocol):
    """A single, independently-checkable booking conflict rule."""

    def check(self, tenant_id: str, payload: AppointmentCreate) -> None:
        """Raise HTTPException(409) if the payload conflicts with existing bookings."""
        ...


class DuplicatePatientBookingRule:
    """Prevents a patient from holding two active appointments in the same slot/session."""

    def __init__(self, session: Session):
        self.appointments = AppointmentRepository(session)
        self.references = AppointmentReferenceRepository(session)

    def check(self, tenant_id: str, payload: AppointmentCreate) -> None:
        if payload.appointment_type == AppointmentType.EMERGENCY:
            return
        # Lock the patient row FOR UPDATE so concurrent bookings for the same
        # patient serialize — mirrors the practitioner-side lock in
        # PractitionerSlotConflictRule and closes the same double-booking race
        # on the patient side. (No-op on single-writer SQLite.)
        self.references.lock_patient(payload.patient_id)
        existing_rows = self.appointments.for_patient_on_date(
            tenant_id=tenant_id,
            patient_id=payload.patient_id,
            appointment_date=payload.appointment_date,
        )
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
            requested_session = slot_session(payload.appointment_time)
            for row in active_rows:
                if (
                    row.practitioner_id == payload.practitioner_id
                    and slot_session(row.appointment_time) == requested_session
                ):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Patient already has an active appointment with this doctor in the selected timing session",
                    )


class PractitionerSlotConflictRule:
    """Prevents a practitioner from being double-booked in the same slot."""

    def __init__(self, session: Session):
        self.appointments = AppointmentRepository(session)
        self.references = AppointmentReferenceRepository(session)

    def check(self, tenant_id: str, payload: AppointmentCreate) -> None:
        if (
            payload.appointment_type == AppointmentType.EMERGENCY
            or not payload.practitioner_id
            or not payload.appointment_time
        ):
            return
        # Lock the practitioner row FOR UPDATE so concurrent bookings for the same
        # doctor serialize — the slot check + insert become atomic and the same slot
        # can't be double-booked in a race. (No-op on single-writer SQLite.)
        self.references.lock_practitioner(payload.practitioner_id)
        existing_rows = self.appointments.for_practitioner_slot(
            tenant_id=tenant_id,
            practitioner_id=payload.practitioner_id,
            appointment_date=payload.appointment_date,
            appointment_time=payload.appointment_time,
        )
        if any(row.status in ACTIVE_APPOINTMENT_STATUSES for row in existing_rows):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Doctor already has an active appointment at this time",
            )


class BookingConflictValidator:
    """Runs the full set of booking conflict rules against a payload."""

    def __init__(self, session: Session):
        self.rules: list[BookingConflictRule] = [
            DuplicatePatientBookingRule(session),
            PractitionerSlotConflictRule(session),
        ]

    def validate(self, tenant_id: str, payload: AppointmentCreate) -> None:
        for rule in self.rules:
            rule.check(tenant_id, payload)
