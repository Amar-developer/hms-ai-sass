from datetime import time

from app.modules.appointments.models import AppointmentStatus

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


def slot_session(appointment_time: time | None) -> str:
    if appointment_time is None:
        return "unscheduled"
    if appointment_time < time(13, 0):
        return "morning"
    if appointment_time < time(18, 0):
        return "afternoon"
    return "evening"
