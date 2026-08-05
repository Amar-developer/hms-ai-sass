from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlmodel import Session

from app.modules.appointments.models import AppointmentStatus
from app.modules.practitioners.models import PractitionerRoomAssignment
from app.modules.practitioners.models import PractitionerStatus
from app.modules.practitioners.repositories import (
    PractitionerAppointmentRepository,
    PractitionerLeaveRepository,
    PractitionerLinkRepository,
    PractitionerRepository,
    PractitionerRoomAssignmentRepository,
    PractitionerScheduleRepository,
)


def practitioner_is_eligible(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    branch_id: str,
    department_id: str | None,
) -> bool:
    practitioner = PractitionerRepository(session).get_for_tenant(
        tenant_id, practitioner_id
    )
    if not practitioner or practitioner.status != PractitionerStatus.ACTIVE:
        return False
    links = PractitionerLinkRepository(session)
    branch_link = links.get_branch_link(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
    )
    if not branch_link or not branch_link.is_active:
        return False
    if department_id:
        department_link = links.get_department_link(
            tenant_id=tenant_id,
            practitioner_id=practitioner_id,
            department_id=department_id,
        )
        if not department_link or not department_link.is_active:
            return False
    return True


@dataclass(frozen=True)
class PractitionerAvailability:
    available: bool
    reason: str | None = None
    schedule_id: str | None = None
    room_name: str | None = None


@dataclass(frozen=True)
class PractitionerGeneratedSlot:
    appointment_date: date
    start_time: time
    end_time: time
    status: str
    available: bool
    reason: str | None = None
    schedule_id: str | None = None
    room_name: str | None = None


@dataclass(frozen=True)
class PractitionerCalendarDay:
    appointment_date: date
    weekday: int
    total_slots: int
    available_slots: int
    slots: list[PractitionerGeneratedSlot]


@dataclass(frozen=True)
class PractitionerCalendar:
    practitioner_id: str
    tenant_id: str
    branch_id: str
    department_id: str | None
    start_date: date
    end_date: date
    days: list[PractitionerCalendarDay]


def _department_matches(
    configured_department_id: str | None, requested_department_id: str | None
) -> bool:
    return (
        configured_department_id is None
        or configured_department_id == requested_department_id
    )


def _time_in_range(value: time, start: time, end: time) -> bool:
    return start <= value < end


def _minutes_since_midnight(value: time) -> int:
    return value.hour * 60 + value.minute


def _is_slot_aligned(value: time, start: time, slot_minutes: int) -> bool:
    return (
        _minutes_since_midnight(value) - _minutes_since_midnight(start)
    ) % slot_minutes == 0


def _add_minutes(value_date: date, value_time: time, minutes: int) -> time:
    return (
        datetime.combine(value_date, value_time) + timedelta(minutes=minutes)
    ).time()


def _matching_room_assignment(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    branch_id: str,
    department_id: str | None,
    appointment_date: date,
    appointment_time: time,
) -> PractitionerRoomAssignment | None:
    assignments = PractitionerRoomAssignmentRepository(
        session
    ).active_for_practitioner_branch(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
    )
    matches = [
        assignment
        for assignment in assignments
        if _department_matches(assignment.department_id, department_id)
        and _time_in_range(appointment_time, assignment.start_time, assignment.end_time)
        and (
            assignment.assignment_date == appointment_date
            or (
                assignment.assignment_date is None
                and assignment.weekday == appointment_date.weekday()
            )
        )
    ]
    dated_matches = [
        assignment
        for assignment in matches
        if assignment.assignment_date == appointment_date
    ]
    return (dated_matches or matches)[0] if matches else None


def check_practitioner_availability(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    branch_id: str,
    department_id: str | None,
    appointment_date: date,
    appointment_time: time,
) -> PractitionerAvailability:
    if not practitioner_is_eligible(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        department_id=department_id,
    ):
        return PractitionerAvailability(
            False, "Practitioner is not assigned to this branch and department"
        )

    schedules = PractitionerScheduleRepository(session).active_for_date(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        appointment_date=appointment_date,
    )
    matching_schedules = [
        schedule
        for schedule in schedules
        if _department_matches(schedule.department_id, department_id)
        and _time_in_range(appointment_time, schedule.start_time, schedule.end_time)
    ]
    if not matching_schedules:
        return PractitionerAvailability(
            False, "Practitioner is not scheduled at this time"
        )

    schedule = matching_schedules[0]
    if not _is_slot_aligned(
        appointment_time, schedule.start_time, schedule.slot_minutes
    ):
        return PractitionerAvailability(
            False, "Appointment time does not match the practitioner slot interval"
        )

    leave_rows = PractitionerLeaveRepository(session).active_for_date(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        appointment_date=appointment_date,
    )
    for leave in leave_rows:
        if leave.branch_id and leave.branch_id != branch_id:
            continue
        if (
            leave.start_time is None
            or leave.end_time is None
            or _time_in_range(
                appointment_time,
                leave.start_time,
                leave.end_time,
            )
        ):
            return PractitionerAvailability(
                False, "Practitioner is on leave at this time", schedule_id=schedule.id
            )

    existing_rows = PractitionerAppointmentRepository(session).appointments_at_time(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        appointment_date=appointment_date,
        appointment_time=appointment_time,
    )
    if any(
        row.status not in {AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW}
        for row in existing_rows
    ):
        return PractitionerAvailability(
            False, "Practitioner already has an appointment at this time"
        )

    room_assignment = _matching_room_assignment(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        department_id=department_id,
        appointment_date=appointment_date,
        appointment_time=appointment_time,
    )
    room_name = room_assignment.room_name if room_assignment else schedule.room_name
    return PractitionerAvailability(True, schedule_id=schedule.id, room_name=room_name)


def check_practitioner_date_availability(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    branch_id: str,
    department_id: str | None,
    appointment_date: date,
) -> PractitionerAvailability:
    if not practitioner_is_eligible(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        department_id=department_id,
    ):
        return PractitionerAvailability(
            False, "Practitioner is not assigned to this branch and department"
        )

    schedules = PractitionerScheduleRepository(session).active_for_date(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        appointment_date=appointment_date,
    )
    matching_schedules = [
        schedule
        for schedule in schedules
        if _department_matches(schedule.department_id, department_id)
    ]
    if not matching_schedules:
        return PractitionerAvailability(
            False, "Practitioner is not scheduled on this date"
        )

    leave_rows = PractitionerLeaveRepository(session).active_for_date(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        appointment_date=appointment_date,
    )
    for leave in leave_rows:
        if leave.branch_id and leave.branch_id != branch_id:
            continue
        if leave.start_time is None or leave.end_time is None:
            return PractitionerAvailability(
                False, "Practitioner is on leave on this date"
            )

    schedule = matching_schedules[0]
    return PractitionerAvailability(
        True, schedule_id=schedule.id, room_name=schedule.room_name
    )


def room_assignment_conflicts(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    room_name: str,
    assignment_date: date | None,
    weekday: int | None,
    start_time: time,
    end_time: time,
) -> bool:
    rows = PractitionerRoomAssignmentRepository(session).active_for_room(
        tenant_id=tenant_id,
        branch_id=branch_id,
        room_name=room_name,
    )
    for row in rows:
        if assignment_date is not None:
            same_scope = row.assignment_date == assignment_date or (
                row.assignment_date is None and row.weekday == assignment_date.weekday()
            )
        else:
            same_scope = row.weekday == weekday or (
                row.assignment_date is not None
                and row.assignment_date.weekday() == weekday
            )
        if not same_scope:
            continue
        if start_time < row.end_time and end_time > row.start_time:
            return True
    return False


def generate_practitioner_calendar(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    branch_id: str,
    department_id: str | None,
    start_date: date,
    end_date: date,
) -> PractitionerCalendar:
    days: list[PractitionerCalendarDay] = []
    current_date = start_date
    while current_date <= end_date:
        schedules = PractitionerScheduleRepository(session).active_for_date(
            tenant_id=tenant_id,
            practitioner_id=practitioner_id,
            branch_id=branch_id,
            appointment_date=current_date,
        )
        slots: list[PractitionerGeneratedSlot] = []
        for schedule in schedules:
            if not _department_matches(schedule.department_id, department_id):
                continue
            slot_time = schedule.start_time
            while (
                _add_minutes(current_date, slot_time, schedule.slot_minutes)
                <= schedule.end_time
            ):
                availability = check_practitioner_availability(
                    session,
                    tenant_id=tenant_id,
                    practitioner_id=practitioner_id,
                    branch_id=branch_id,
                    department_id=department_id,
                    appointment_date=current_date,
                    appointment_time=slot_time,
                )
                if availability.available:
                    status = "available"
                elif (
                    availability.reason
                    == "Practitioner already has an appointment at this time"
                ):
                    status = "booked"
                elif availability.reason == "Practitioner is on leave at this time":
                    status = "leave"
                else:
                    status = "unavailable"
                slots.append(
                    PractitionerGeneratedSlot(
                        appointment_date=current_date,
                        start_time=slot_time,
                        end_time=_add_minutes(
                            current_date, slot_time, schedule.slot_minutes
                        ),
                        status=status,
                        available=availability.available,
                        reason=availability.reason,
                        schedule_id=availability.schedule_id or schedule.id,
                        room_name=availability.room_name or schedule.room_name,
                    )
                )
                slot_time = _add_minutes(current_date, slot_time, schedule.slot_minutes)
        slots.sort(key=lambda slot: slot.start_time)
        days.append(
            PractitionerCalendarDay(
                appointment_date=current_date,
                weekday=current_date.weekday(),
                total_slots=len(slots),
                available_slots=sum(1 for slot in slots if slot.available),
                slots=slots,
            )
        )
        current_date += timedelta(days=1)
    return PractitionerCalendar(
        practitioner_id=practitioner_id,
        tenant_id=tenant_id,
        branch_id=branch_id,
        department_id=department_id,
        start_date=start_date,
        end_date=end_date,
        days=days,
    )
