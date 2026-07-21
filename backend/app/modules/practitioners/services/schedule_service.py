from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.audit.service import record_audit_event
from app.modules.practitioners.models import (
    PractitionerLeave,
    PractitionerRoomAssignment,
    PractitionerSchedule,
)
from app.modules.practitioners.repositories import (
    PractitionerLeaveRepository,
    PractitionerRoomAssignmentRepository,
    PractitionerScheduleRepository,
)
from app.modules.practitioners.schemas import (
    PractitionerLeaveCreate,
    PractitionerRoomAssignmentCreate,
    PractitionerScheduleCreate,
    PractitionerScheduleRead,
    PractitionerScheduleUpdate,
)
from app.modules.practitioners.services.availability import (
    practitioner_is_eligible,
    room_assignment_conflicts,
)
from app.modules.practitioners.services.read_models import enrich_schedules
from app.modules.practitioners.services.validation import (
    department_filter_ids,
    get_practitioner_or_404,
    get_schedule_or_404,
    validate_links,
    validate_time_window,
)


def list_all_schedules(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str | None,
    branch_id: str | None,
    department_id: str | None,
    is_active: bool | None,
) -> list[PractitionerScheduleRead]:
    department_ids = None
    if department_id:
        department_ids = department_filter_ids(session, tenant_id, department_id)
    schedules = PractitionerScheduleRepository(session).list_for_filters(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        department_ids=department_ids,
        is_active=is_active,
    )
    return enrich_schedules(session, schedules)


def update_schedule(
    session: Session,
    *,
    tenant_id: str,
    schedule_id: str,
    payload: PractitionerScheduleUpdate,
) -> PractitionerSchedule:
    schedule = get_schedule_or_404(session, tenant_id, schedule_id)
    updates = payload.model_dump(exclude_unset=True, exclude={"actor_user_id"})
    practitioner_id = updates.get("practitioner_id", schedule.practitioner_id)
    branch_id = updates.get("branch_id", schedule.branch_id)
    get_practitioner_or_404(session, tenant_id, practitioner_id)
    department_id = updates.get("department_id", schedule.department_id)
    validate_links(
        session,
        tenant_id,
        [branch_id],
        [department_id] if department_id else [],
    )
    if department_id and not practitioner_is_eligible(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        department_id=department_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Practitioner is not assigned to this branch and department",
        )
    start_time = updates.get("start_time", schedule.start_time)
    end_time = updates.get("end_time", schedule.end_time)
    validate_time_window(start_time, end_time)
    for key, value in updates.items():
        setattr(schedule, key, value)
    schedule.updated_at = datetime.now(timezone.utc)
    PractitionerScheduleRepository(session).add(schedule)
    session.commit()
    session.refresh(schedule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=schedule.branch_id,
        actor_user_id=payload.actor_user_id,
        action="practitioner.schedule.updated",
        resource_type="practitioner_schedule",
        resource_id=schedule.id,
        purpose="practitioner_setup",
    )
    return schedule


def delete_schedule(
    session: Session, *, tenant_id: str, schedule_id: str, actor_user_id: str | None
) -> dict[str, bool | str]:
    schedule = get_schedule_or_404(session, tenant_id, schedule_id)
    branch_id = schedule.branch_id
    schedule.is_active = False
    schedule.updated_at = datetime.now(timezone.utc)
    PractitionerScheduleRepository(session).add(schedule)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        actor_user_id=actor_user_id,
        action="practitioner.schedule.deleted",
        resource_type="practitioner_schedule",
        resource_id=schedule_id,
        purpose="practitioner_setup",
    )
    return {"deleted": True, "mode": "deactivated", "schedule_id": schedule_id}


def create_schedule(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    payload: PractitionerScheduleCreate,
) -> PractitionerSchedule:
    get_practitioner_or_404(session, tenant_id, practitioner_id)
    validate_links(
        session,
        tenant_id,
        [payload.branch_id],
        [payload.department_id] if payload.department_id else [],
    )
    if payload.department_id and not practitioner_is_eligible(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Practitioner is not assigned to this branch and department",
        )
    validate_time_window(payload.start_time, payload.end_time)
    schedule = PractitionerSchedule.model_validate(
        payload, update={"tenant_id": tenant_id, "practitioner_id": practitioner_id}
    )
    PractitionerScheduleRepository(session).add(schedule)
    session.commit()
    session.refresh(schedule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=schedule.branch_id,
        actor_user_id=payload.actor_user_id,
        action="practitioner.schedule.created",
        resource_type="practitioner_schedule",
        resource_id=schedule.id,
        purpose="practitioner_setup",
    )
    return schedule


def list_practitioner_schedules(
    session: Session, *, tenant_id: str, practitioner_id: str
) -> list[PractitionerScheduleRead]:
    get_practitioner_or_404(session, tenant_id, practitioner_id)
    schedules = PractitionerScheduleRepository(session).list_for_filters(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
    )
    return enrich_schedules(session, schedules)


def create_leave(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    payload: PractitionerLeaveCreate,
) -> PractitionerLeave:
    get_practitioner_or_404(session, tenant_id, practitioner_id)
    if payload.branch_id:
        validate_links(session, tenant_id, [payload.branch_id], [])
    if payload.start_date > payload.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date must be on or before end date",
        )
    if (payload.start_time is None) != (payload.end_time is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Leave start and end time must be provided together",
        )
    if payload.start_time and payload.end_time:
        validate_time_window(payload.start_time, payload.end_time)
    leave = PractitionerLeave.model_validate(
        payload, update={"tenant_id": tenant_id, "practitioner_id": practitioner_id}
    )
    PractitionerLeaveRepository(session).add(leave)
    session.commit()
    session.refresh(leave)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=leave.branch_id,
        actor_user_id=payload.actor_user_id,
        action="practitioner.leave.created",
        resource_type="practitioner_leave",
        resource_id=leave.id,
        purpose="practitioner_setup",
    )
    return leave


def list_leaves(
    session: Session, *, tenant_id: str, practitioner_id: str
) -> list[PractitionerLeave]:
    get_practitioner_or_404(session, tenant_id, practitioner_id)
    return PractitionerLeaveRepository(session).list_for_practitioner(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
    )


def create_room_assignment(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    payload: PractitionerRoomAssignmentCreate,
) -> PractitionerRoomAssignment:
    get_practitioner_or_404(session, tenant_id, practitioner_id)
    validate_links(session, tenant_id, [payload.branch_id], [])
    validate_time_window(payload.start_time, payload.end_time)
    if payload.assignment_date is None and payload.weekday is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Room assignment date or weekday is required",
        )
    if room_assignment_conflicts(
        session,
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        room_name=payload.room_name,
        assignment_date=payload.assignment_date,
        weekday=payload.weekday,
        start_time=payload.start_time,
        end_time=payload.end_time,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Room is already assigned during this time",
        )
    assignment = PractitionerRoomAssignment.model_validate(
        payload,
        update={"tenant_id": tenant_id, "practitioner_id": practitioner_id},
    )
    PractitionerRoomAssignmentRepository(session).add(assignment)
    session.commit()
    session.refresh(assignment)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=assignment.branch_id,
        actor_user_id=payload.actor_user_id,
        action="practitioner.room_assignment.created",
        resource_type="practitioner_room_assignment",
        resource_id=assignment.id,
        purpose="practitioner_setup",
    )
    return assignment


def list_room_assignments(
    session: Session, *, tenant_id: str, practitioner_id: str
) -> list[PractitionerRoomAssignment]:
    get_practitioner_or_404(session, tenant_id, practitioner_id)
    return PractitionerRoomAssignmentRepository(session).list_for_practitioner(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
    )
