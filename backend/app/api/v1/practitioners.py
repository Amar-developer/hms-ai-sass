from datetime import date, time

from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.core.access_control import current_doctor_practitioner_id
from app.core.auth import require_any_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.core.validation import BranchId, DepartmentId, PractitionerId
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.practitioners.models import (
    PractitionerLeave,
    PractitionerRoomAssignment,
)
from app.modules.practitioners.schemas import (
    PractitionerAvailabilityRead,
    PractitionerCalendarRead,
    PractitionerCreate,
    PractitionerEligibilityRead,
    PractitionerLeaveCreate,
    PractitionerLeaveRead,
    PractitionerRead,
    PractitionerRoomAssignmentCreate,
    PractitionerRoomAssignmentRead,
    PractitionerScheduleCreate,
    PractitionerScheduleRead,
    PractitionerScheduleUpdate,
    PractitionerUpdate,
)
from app.modules.practitioners import service as practitioner_service

router = APIRouter(prefix="/practitioners")


@router.post("", response_model=PractitionerRead, status_code=status.HTTP_201_CREATED)
def create_practitioner(
    payload: PractitionerCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_CREATE,
        )
    ),
) -> PractitionerRead:
    return practitioner_service.create_practitioner(
        session, tenant_id=tenant_id, payload=payload
    )


@router.get("", response_model=list[PractitionerRead])
def list_practitioners(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: BranchId | None = None,
    department_id: DepartmentId | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_READ,
            permissions.APPOINTMENTS_MANAGE,
            permissions.APPOINTMENTS_CREATE,
            permissions.APPOINTMENTS_READ,
            permissions.SCHEDULING_MANAGE,
            permissions.SCHEDULING_CREATE,
            permissions.SCHEDULING_READ,
            permissions.SCHEDULING_EDIT,
            permissions.PHYSIOTHERAPY_READ,
            permissions.PHYSIOTHERAPY_EDIT,
        )
    ),
) -> list[PractitionerRead]:
    doctor_practitioner_id = current_doctor_practitioner_id(
        session, tenant_id, current_user
    )
    return practitioner_service.list_practitioners(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        department_id=department_id,
        doctor_practitioner_id=doctor_practitioner_id,
    )


@router.get("/schedules", response_model=list[PractitionerScheduleRead])
def list_all_practitioner_schedules(
    tenant_id: str = Depends(require_tenant_id),
    practitioner_id: PractitionerId | None = None,
    branch_id: BranchId | None = None,
    department_id: DepartmentId | None = None,
    is_active: bool | None = None,
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.SCHEDULING_MANAGE, permissions.SCHEDULING_READ
        )
    ),
) -> list[PractitionerScheduleRead]:
    return practitioner_service.list_all_schedules(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        department_id=department_id,
        is_active=is_active,
    )


@router.patch("/schedules/{schedule_id}", response_model=PractitionerScheduleRead)
def update_practitioner_schedule(
    schedule_id: str,
    payload: PractitionerScheduleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.SCHEDULING_MANAGE, permissions.SCHEDULING_EDIT
        )
    ),
) -> PractitionerScheduleRead:
    return practitioner_service.update_schedule(
        session, tenant_id=tenant_id, schedule_id=schedule_id, payload=payload
    )


@router.delete("/schedules/{schedule_id}")
def delete_practitioner_schedule(
    schedule_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.SCHEDULING_MANAGE, permissions.SCHEDULING_DELETE
        )
    ),
) -> dict[str, bool | str]:
    return practitioner_service.delete_schedule(
        session,
        tenant_id=tenant_id,
        schedule_id=schedule_id,
        actor_user_id=current_user.id,
    )


@router.get("/{practitioner_id}", response_model=PractitionerRead)
def get_practitioner(
    practitioner_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.PRACTITIONERS_MANAGE, permissions.PRACTITIONERS_READ
        )
    ),
) -> PractitionerRead:
    return practitioner_service.get_practitioner_read(
        session, tenant_id=tenant_id, practitioner_id=practitioner_id
    )


@router.patch("/{practitioner_id}", response_model=PractitionerRead)
def update_practitioner(
    practitioner_id: str,
    payload: PractitionerUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.PRACTITIONERS_MANAGE, permissions.PRACTITIONERS_EDIT
        )
    ),
) -> PractitionerRead:
    return practitioner_service.update_practitioner(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        payload=payload,
    )


@router.delete("/{practitioner_id}")
def delete_practitioner(
    practitioner_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.PRACTITIONERS_MANAGE, permissions.PRACTITIONERS_DELETE
        )
    ),
) -> dict[str, bool | str]:
    return practitioner_service.delete_practitioner(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        actor_user_id=current_user.id,
    )


@router.post(
    "/{practitioner_id}/schedules",
    response_model=PractitionerScheduleRead,
    status_code=status.HTTP_201_CREATED,
)
def create_practitioner_schedule(
    practitioner_id: str,
    payload: PractitionerScheduleCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.SCHEDULING_MANAGE,
            permissions.SCHEDULING_CREATE,
        )
    ),
) -> PractitionerScheduleRead:
    return practitioner_service.create_schedule(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        payload=payload,
    )


@router.get(
    "/{practitioner_id}/schedules", response_model=list[PractitionerScheduleRead]
)
def list_practitioner_schedules(
    practitioner_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.SCHEDULING_MANAGE, permissions.SCHEDULING_READ
        )
    ),
) -> list[PractitionerScheduleRead]:
    return practitioner_service.list_practitioner_schedules(
        session, tenant_id=tenant_id, practitioner_id=practitioner_id
    )


@router.post(
    "/{practitioner_id}/leaves",
    response_model=PractitionerLeaveRead,
    status_code=status.HTTP_201_CREATED,
)
def create_practitioner_leave(
    practitioner_id: str,
    payload: PractitionerLeaveCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.PRACTITIONERS_MANAGE, permissions.SCHEDULING_CREATE
        )
    ),
) -> PractitionerLeave:
    return practitioner_service.create_leave(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        payload=payload,
    )


@router.get("/{practitioner_id}/leaves", response_model=list[PractitionerLeaveRead])
def list_practitioner_leaves(
    practitioner_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.PRACTITIONERS_MANAGE, permissions.SCHEDULING_READ
        )
    ),
) -> list[PractitionerLeave]:
    return practitioner_service.list_leaves(
        session, tenant_id=tenant_id, practitioner_id=practitioner_id
    )


@router.post(
    "/{practitioner_id}/room-assignments",
    response_model=PractitionerRoomAssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_practitioner_room_assignment(
    practitioner_id: str,
    payload: PractitionerRoomAssignmentCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.PRACTITIONERS_MANAGE, permissions.SCHEDULING_CREATE
        )
    ),
) -> PractitionerRoomAssignment:
    return practitioner_service.create_room_assignment(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        payload=payload,
    )


@router.get(
    "/{practitioner_id}/room-assignments",
    response_model=list[PractitionerRoomAssignmentRead],
)
def list_practitioner_room_assignments(
    practitioner_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.PRACTITIONERS_MANAGE, permissions.SCHEDULING_READ
        )
    ),
) -> list[PractitionerRoomAssignment]:
    return practitioner_service.list_room_assignments(
        session, tenant_id=tenant_id, practitioner_id=practitioner_id
    )


@router.get(
    "/{practitioner_id}/eligibility", response_model=PractitionerEligibilityRead
)
def check_practitioner_eligibility(
    practitioner_id: PractitionerId,
    branch_id: BranchId,
    department_id: DepartmentId | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.APPOINTMENTS_MANAGE,
            permissions.APPOINTMENTS_CREATE,
            permissions.APPOINTMENTS_READ,
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_READ,
        )
    ),
) -> PractitionerEligibilityRead:
    return practitioner_service.check_eligibility(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        department_id=department_id,
    )


@router.get(
    "/{practitioner_id}/availability", response_model=PractitionerAvailabilityRead
)
def check_practitioner_schedule_availability(
    practitioner_id: PractitionerId,
    branch_id: BranchId,
    appointment_date: date,
    appointment_time: time,
    department_id: DepartmentId | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.APPOINTMENTS_MANAGE,
            permissions.APPOINTMENTS_CREATE,
            permissions.APPOINTMENTS_READ,
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_READ,
        )
    ),
) -> PractitionerAvailabilityRead:
    return practitioner_service.check_schedule_availability(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        appointment_date=appointment_date,
        appointment_time=appointment_time,
        department_id=department_id,
    )


@router.get("/{practitioner_id}/calendar", response_model=PractitionerCalendarRead)
def get_practitioner_calendar(
    practitioner_id: PractitionerId,
    branch_id: BranchId,
    start_date: date,
    end_date: date,
    department_id: DepartmentId | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(
        require_any_permission(
            permissions.APPOINTMENTS_MANAGE,
            permissions.APPOINTMENTS_CREATE,
            permissions.APPOINTMENTS_READ,
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_READ,
        )
    ),
) -> PractitionerCalendarRead:
    return practitioner_service.get_calendar(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        start_date=start_date,
        end_date=end_date,
        department_id=department_id,
    )
