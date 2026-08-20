from datetime import datetime, time, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.list_filters import ListFilter, ListFilterOption, ListSort
from app.core.pagination import Page
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
from app.modules.practitioners.schedule_days import (
    dump_weekdays,
    mode_value,
    parse_weekdays,
    resolve_weekdays,
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


def _times_overlap(start_a: time, end_a: time, start_b: time, end_b: time) -> bool:
    """True when two time windows intersect. Back-to-back windows (one ends
    exactly when the next begins) do not count as overlapping, so a doctor
    can run consecutive sessions."""
    return start_a < end_b and start_b < end_a


def _actor_id(payload_actor_id: str | None, actor: object | None = None) -> str | None:
    return getattr(actor, "id", None) or payload_actor_id


_DUPLICATE_SCHEDULE_DETAIL = (
    "This doctor already has an overlapping schedule for this department "
    "on one or more of the selected weekdays"
)


def _conflicts_with_existing(
    *,
    weekdays: set[int],
    start_time: time,
    end_time: time,
    exclude_schedule_id: str | None,
    existing: list[PractitionerSchedule],
) -> bool:
    for row in existing:
        if row.id == exclude_schedule_id:
            continue
        if not weekdays & set(parse_weekdays(row.weekdays_json)):
            continue
        if _times_overlap(start_time, end_time, row.start_time, row.end_time):
            return True
    return False


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


def list_schedule_page(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str | None,
    branch_id: str | None,
    department_id: str | None,
    is_active: bool | None,
    weekday: int | None,
    q: str | None,
    list_filters: list[ListFilter],
    list_sort: ListSort | None,
    limit: int,
    offset: int,
) -> Page[PractitionerScheduleRead]:
    department_ids = None
    if department_id:
        department_ids = department_filter_ids(session, tenant_id, department_id)
    repository = PractitionerScheduleRepository(session)
    schedules = repository.list_page(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        department_ids=department_ids,
        is_active=is_active,
        weekday=weekday,
        q=q,
        list_filters=list_filters,
        list_sort=list_sort,
        limit=limit,
        offset=offset,
    )
    total = repository.count_page(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        department_ids=department_ids,
        is_active=is_active,
        weekday=weekday,
        q=q,
        list_filters=list_filters,
    )
    return Page(
        items=enrich_schedules(session, schedules),
        total=total,
        limit=limit,
        offset=offset,
    )


def list_schedule_filter_options(
    session: Session,
    *,
    tenant_id: str,
) -> dict[str, list[ListFilterOption]]:
    return PractitionerScheduleRepository(session).filter_options(tenant_id=tenant_id)


def update_schedule(
    session: Session,
    *,
    tenant_id: str,
    schedule_id: str,
    payload: PractitionerScheduleUpdate,
    actor=None,
) -> PractitionerScheduleRead:
    actor_user_id = _actor_id(payload.actor_user_id, actor)
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
    mode = mode_value(updates.pop("mode", schedule.mode))
    weekdays = updates.pop("weekdays", None)
    resolved_weekdays = (
        resolve_weekdays(mode, weekdays)
        if weekdays is not None or "mode" in payload.model_fields_set
        else parse_weekdays(schedule.weekdays_json)
    )
    if department_id and _conflicts_with_existing(
        weekdays=set(resolved_weekdays),
        start_time=start_time,
        end_time=end_time,
        exclude_schedule_id=schedule.id,
        existing=PractitionerScheduleRepository(
            session
        ).active_for_practitioner_department(
            tenant_id=tenant_id,
            practitioner_id=practitioner_id,
            department_id=department_id,
        ),
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_DUPLICATE_SCHEDULE_DETAIL,
        )
    for key, value in updates.items():
        setattr(schedule, key, value)
    schedule.mode = mode
    schedule.weekdays_json = dump_weekdays(resolved_weekdays)
    schedule.updated_by_user_id = actor_user_id
    schedule.updated_at = datetime.now(timezone.utc)
    PractitionerScheduleRepository(session).add(schedule)
    session.commit()
    session.refresh(schedule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=schedule.branch_id,
        actor_user_id=actor_user_id,
        action="practitioner.schedule.updated",
        resource_type="practitioner_schedule",
        resource_id=schedule.id,
        purpose="practitioner_setup",
    )
    return enrich_schedules(session, [schedule])[0]


def delete_schedule(
    session: Session, *, tenant_id: str, schedule_id: str, actor_user_id: str | None
) -> dict[str, bool | str]:
    schedule = get_schedule_or_404(session, tenant_id, schedule_id)
    branch_id = schedule.branch_id
    schedule.is_active = False
    schedule.updated_by_user_id = actor_user_id
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
    actor=None,
) -> PractitionerScheduleRead:
    actor_user_id = _actor_id(payload.actor_user_id, actor)
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
    resolved_weekdays = resolve_weekdays(payload.mode, payload.weekdays)
    if payload.department_id and _conflicts_with_existing(
        weekdays=set(resolved_weekdays),
        start_time=payload.start_time,
        end_time=payload.end_time,
        exclude_schedule_id=None,
        existing=PractitionerScheduleRepository(
            session
        ).active_for_practitioner_department(
            tenant_id=tenant_id,
            practitioner_id=practitioner_id,
            department_id=payload.department_id,
        ),
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_DUPLICATE_SCHEDULE_DETAIL,
        )
    schedule = PractitionerSchedule.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "practitioner_id": practitioner_id,
            "mode": mode_value(payload.mode),
            "weekdays_json": dump_weekdays(resolved_weekdays),
            "created_by_user_id": actor_user_id,
            "updated_by_user_id": actor_user_id,
        },
    )
    PractitionerScheduleRepository(session).add(schedule)
    session.commit()
    session.refresh(schedule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=schedule.branch_id,
        actor_user_id=actor_user_id,
        action="practitioner.schedule.created",
        resource_type="practitioner_schedule",
        resource_id=schedule.id,
        purpose="practitioner_setup",
    )
    return enrich_schedules(session, [schedule])[0]


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
    actor=None,
) -> PractitionerLeave:
    actor_user_id = _actor_id(payload.actor_user_id, actor)
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
        payload,
        update={
            "tenant_id": tenant_id,
            "practitioner_id": practitioner_id,
            "created_by_user_id": actor_user_id,
            "updated_by_user_id": actor_user_id,
        },
    )
    PractitionerLeaveRepository(session).add(leave)
    session.commit()
    session.refresh(leave)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=leave.branch_id,
        actor_user_id=actor_user_id,
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
    actor=None,
) -> PractitionerRoomAssignment:
    actor_user_id = _actor_id(payload.actor_user_id, actor)
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
        update={
            "tenant_id": tenant_id,
            "practitioner_id": practitioner_id,
            "created_by_user_id": actor_user_id,
            "updated_by_user_id": actor_user_id,
        },
    )
    PractitionerRoomAssignmentRepository(session).add(assignment)
    session.commit()
    session.refresh(assignment)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=assignment.branch_id,
        actor_user_id=actor_user_id,
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
