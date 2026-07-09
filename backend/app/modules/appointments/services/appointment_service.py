from datetime import date

from fastapi import Response
from sqlmodel import Session

from app.modules.appointments.models import Appointment
from app.modules.appointments.schemas import (
    AppointmentBookingRead,
    AppointmentCreate,
    AppointmentGridRead,
    FollowUpAppointmentCreate,
)
from app.modules.appointments.services.booking_service import AppointmentBookingService
from app.modules.appointments.services.query_service import (  # noqa: F401
    AppointmentQueryService,
    appointment_grid_row,
)
from app.modules.identity.models import User


class AppointmentService:
    """Facade over appointment booking and query services."""

    def __init__(self, session: Session):
        self.session = session
        self.booking_service = AppointmentBookingService(session)
        self.query_service = AppointmentQueryService(session)

    def book_appointment(
        self,
        *,
        tenant_id: str,
        payload: AppointmentCreate,
        idempotency_key: str | None,
        response: Response,
        actor: User,
    ) -> AppointmentBookingRead:
        return self.booking_service.book_appointment(
            tenant_id=tenant_id,
            payload=payload,
            idempotency_key=idempotency_key,
            response=response,
            actor=actor,
        )

    def book_follow_up_appointment(
        self,
        *,
        tenant_id: str,
        appointment_id: str,
        payload: FollowUpAppointmentCreate,
        actor: User,
    ) -> AppointmentBookingRead:
        return self.booking_service.book_follow_up_appointment(
            tenant_id=tenant_id,
            appointment_id=appointment_id,
            payload=payload,
            actor=actor,
        )

    def list_appointments(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        department_id: str | None,
        practitioner_id: str | None,
        appointment_date: date | None,
        q: str | None,
        skip: int,
        limit: int,
        actor: User,
    ) -> list[AppointmentGridRead]:
        return self.query_service.list_appointments(
            tenant_id=tenant_id,
            branch_id=branch_id,
            department_id=department_id,
            practitioner_id=practitioner_id,
            appointment_date=appointment_date,
            q=q,
            skip=skip,
            limit=limit,
            actor=actor,
        )

    def list_platform_appointments(
        self,
        *,
        tenant_id: str | None,
        branch_id: str | None,
        department_id: str | None,
        appointment_date: date | None,
        q: str | None,
        skip: int,
        limit: int,
    ) -> list[AppointmentGridRead]:
        return self.query_service.list_platform_appointments(
            tenant_id=tenant_id,
            branch_id=branch_id,
            department_id=department_id,
            appointment_date=appointment_date,
            q=q,
            skip=skip,
            limit=limit,
        )

    def get_appointment(
        self, *, tenant_id: str, appointment_id: str, actor: User
    ) -> Appointment:
        return self.query_service.get_appointment(
            tenant_id=tenant_id, appointment_id=appointment_id, actor=actor
        )
