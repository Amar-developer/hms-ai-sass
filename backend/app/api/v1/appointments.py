from datetime import date

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlmodel import Session

from app.core.auth import require_any_permission, require_super_admin
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.appointments.schemas import (
    AppointmentBookingRead,
    AppointmentCreate,
    AppointmentGridRead,
    AppointmentRead,
    FollowUpAppointmentCreate,
)
from app.modules.appointments.services.appointment_service import AppointmentService
from app.modules.appointments.models import Appointment
from app.modules.identity import permissions
from app.modules.identity.models import User

router = APIRouter(prefix="/appointments")


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
    return AppointmentService(session).book_appointment(
        tenant_id=tenant_id,
        payload=payload,
        idempotency_key=idempotency_key,
        response=response,
        actor=current_user,
    )


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
    return AppointmentService(session).book_follow_up_appointment(
        tenant_id=tenant_id,
        appointment_id=appointment_id,
        payload=payload,
        actor=current_user,
    )


@router.get(
    "",
    response_model=list[AppointmentGridRead],
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
) -> list[AppointmentGridRead]:
    return AppointmentService(session).list_appointments(
        tenant_id=tenant_id,
        branch_id=branch_id,
        department_id=department_id,
        practitioner_id=practitioner_id,
        appointment_date=appointment_date,
        q=q,
        skip=skip,
        limit=limit,
        actor=current_user,
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
    return AppointmentService(session).list_platform_appointments(
        tenant_id=tenant_id,
        branch_id=branch_id,
        department_id=department_id,
        appointment_date=appointment_date,
        q=q,
        skip=skip,
        limit=limit,
    )


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
    return AppointmentService(session).get_appointment(
        tenant_id=tenant_id, appointment_id=appointment_id, actor=current_user
    )
