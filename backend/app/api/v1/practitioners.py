from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.access_control import current_doctor_practitioner_id
from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.audit.service import record_audit_event
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.practitioners.models import Practitioner, PractitionerBranch, PractitionerDepartment
from app.modules.practitioners.models import PractitionerLeave, PractitionerRoomAssignment, PractitionerSchedule
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
from app.modules.practitioners.service import (
    check_practitioner_availability,
    generate_practitioner_calendar,
    practitioner_branch_ids,
    practitioner_department_ids,
    practitioner_is_eligible,
    room_assignment_conflicts,
)
from app.modules.settings.numbering import next_document_number
from app.modules.tenants.models import Branch, Department

router = APIRouter(prefix="/practitioners")


def _read(session: Session, practitioner: Practitioner) -> PractitionerRead:
    data = PractitionerRead.model_validate(practitioner, from_attributes=True).model_dump()
    data["branch_ids"] = practitioner_branch_ids(session, practitioner.tenant_id, practitioner.id)
    data["department_ids"] = practitioner_department_ids(session, practitioner.tenant_id, practitioner.id)
    return PractitionerRead(**data)


def _validate_links(session: Session, tenant_id: str, branch_ids: list[str], department_ids: list[str]) -> None:
    for branch_id in branch_ids:
        branch = session.get(Branch, branch_id)
        if not branch or branch.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid branch: {branch_id}")

def _resolve_department(session: Session, tenant_id: str, department_id: str | None) -> Department | None:
    if not department_id:
        return None
    department = session.get(Department, department_id)
    if department and department.tenant_id == tenant_id:
        return department
    return session.exec(
        select(Department).where(
            Department.tenant_id == tenant_id,
            Department.code == department_id,
        )
    ).first()


def _department_filter_ids(session: Session, tenant_id: str, department_id: str | None) -> set[str]:
    department = _resolve_department(session, tenant_id, department_id)
    return {department_id, department.id, department.code} if department and department_id else ({department_id} if department_id else set())


def _get_practitioner(session: Session, tenant_id: str, practitioner_id: str) -> Practitioner:
    practitioner = session.get(Practitioner, practitioner_id)
    if not practitioner or practitioner.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Practitioner not found")
    return practitioner


def _validate_doctor_login_user(
    session: Session,
    tenant_id: str,
    user_id: str | None,
    practitioner_id: str | None = None,
) -> None:
    if not user_id:
        return
    user = session.get(User, user_id)
    if not user or user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid doctor login user")
    if user.user_type != "doctor":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Linked login user must have Doctor user type")
    existing = session.exec(
        select(Practitioner).where(
            Practitioner.tenant_id == tenant_id,
            Practitioner.user_id == user_id,
        )
    ).first()
    if existing and existing.id != practitioner_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Doctor login user is already linked to another doctor")


def _get_schedule(session: Session, tenant_id: str, schedule_id: str) -> PractitionerSchedule:
    schedule = session.get(PractitionerSchedule, schedule_id)
    if not schedule or schedule.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Practitioner schedule not found")
    return schedule


def _validate_time_window(start_time, end_time) -> None:
    if start_time >= end_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start time must be before end time")


def _replace_links(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    branch_ids: list[str] | None,
    department_ids: list[str] | None,
) -> None:
    if branch_ids is not None:
        existing = session.exec(
            select(PractitionerBranch).where(
                PractitionerBranch.tenant_id == tenant_id,
                PractitionerBranch.practitioner_id == practitioner_id,
            )
        ).all()
        for row in existing:
            session.delete(row)
        for branch_id in sorted(set(branch_ids)):
            session.add(PractitionerBranch(tenant_id=tenant_id, practitioner_id=practitioner_id, branch_id=branch_id))
    if department_ids is not None:
        existing = session.exec(
            select(PractitionerDepartment).where(
                PractitionerDepartment.tenant_id == tenant_id,
                PractitionerDepartment.practitioner_id == practitioner_id,
            )
        ).all()
        for row in existing:
            session.delete(row)
        for department_id in sorted(set(department_ids)):
            session.add(
                PractitionerDepartment(
                    tenant_id=tenant_id,
                    practitioner_id=practitioner_id,
                    department_id=department_id,
                )
            )
    session.commit()


@router.post("", response_model=PractitionerRead, status_code=status.HTTP_201_CREATED)
def create_practitioner(
    payload: PractitionerCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(require_permission(permissions.PRACTITIONERS_MANAGE)),
) -> PractitionerRead:
    _validate_doctor_login_user(session, tenant_id, payload.user_id)
    _validate_links(session, tenant_id, payload.branch_ids, payload.department_ids)
    branch_id = payload.branch_ids[0] if payload.branch_ids else None
    practitioner = Practitioner.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "practitioner_number": next_document_number(session, tenant_id=tenant_id, branch_id=branch_id, entity="doctor"),
        },
    )
    session.add(practitioner)
    session.commit()
    session.refresh(practitioner)
    _replace_links(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner.id,
        branch_ids=payload.branch_ids,
        department_ids=payload.department_ids,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=payload.actor_user_id,
        action="practitioner.created",
        resource_type="practitioner",
        resource_id=practitioner.id,
        purpose="practitioner_setup",
    )
    return _read(session, practitioner)


@router.get("", response_model=list[PractitionerRead])
def list_practitioners(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    department_id: str | None = None,
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
    statement = select(Practitioner).where(Practitioner.tenant_id == tenant_id).order_by(Practitioner.full_name)
    doctor_practitioner_id = current_doctor_practitioner_id(session, tenant_id, current_user)
    if doctor_practitioner_id:
        statement = statement.where(Practitioner.id == doctor_practitioner_id)
    practitioners = list(session.exec(statement).all())
    if branch_id:
        practitioners = [
            practitioner
            for practitioner in practitioners
            if branch_id in practitioner_branch_ids(session, tenant_id, practitioner.id)
        ]
    if department_id:
        department_ids = _department_filter_ids(session, tenant_id, department_id)
        practitioners = [
            practitioner
            for practitioner in practitioners
            if department_ids.intersection(practitioner_department_ids(session, tenant_id, practitioner.id))
        ]
    return [_read(session, practitioner) for practitioner in practitioners]


@router.get("/schedules", response_model=list[PractitionerScheduleRead])
def list_all_practitioner_schedules(
    tenant_id: str = Depends(require_tenant_id),
    practitioner_id: str | None = None,
    branch_id: str | None = None,
    department_id: str | None = None,
    is_active: bool | None = None,
    session: Session = Depends(get_session),
    _current_user=Depends(require_any_permission(permissions.SCHEDULING_MANAGE, permissions.SCHEDULING_READ)),
) -> list[PractitionerSchedule]:
    statement = select(PractitionerSchedule).where(PractitionerSchedule.tenant_id == tenant_id)
    if practitioner_id:
        statement = statement.where(PractitionerSchedule.practitioner_id == practitioner_id)
    if branch_id:
        statement = statement.where(PractitionerSchedule.branch_id == branch_id)
    if department_id:
        department_ids = _department_filter_ids(session, tenant_id, department_id)
        statement = statement.where(PractitionerSchedule.department_id.in_(department_ids))
    if is_active is not None:
        statement = statement.where(PractitionerSchedule.is_active == is_active)
    return list(session.exec(statement.order_by(PractitionerSchedule.updated_at.desc(), PractitionerSchedule.created_at.desc())).all())


@router.patch("/schedules/{schedule_id}", response_model=PractitionerScheduleRead)
def update_practitioner_schedule(
    schedule_id: str,
    payload: PractitionerScheduleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(require_any_permission(permissions.SCHEDULING_MANAGE, permissions.SCHEDULING_EDIT)),
) -> PractitionerSchedule:
    schedule = _get_schedule(session, tenant_id, schedule_id)
    updates = payload.model_dump(exclude_unset=True, exclude={"actor_user_id"})
    practitioner_id = updates.get("practitioner_id", schedule.practitioner_id)
    branch_id = updates.get("branch_id", schedule.branch_id)
    _get_practitioner(session, tenant_id, practitioner_id)
    _validate_links(session, tenant_id, [branch_id], [])
    start_time = updates.get("start_time", schedule.start_time)
    end_time = updates.get("end_time", schedule.end_time)
    _validate_time_window(start_time, end_time)
    for key, value in updates.items():
        setattr(schedule, key, value)
    schedule.updated_at = datetime.now(timezone.utc)
    session.add(schedule)
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


@router.delete("/schedules/{schedule_id}")
def delete_practitioner_schedule(
    schedule_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.SCHEDULING_MANAGE, permissions.SCHEDULING_DELETE)),
) -> dict[str, bool | str]:
    schedule = _get_schedule(session, tenant_id, schedule_id)
    branch_id = schedule.branch_id
    schedule.is_active = False
    schedule.updated_at = datetime.now(timezone.utc)
    session.add(schedule)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        actor_user_id=current_user.id,
        action="practitioner.schedule.deleted",
        resource_type="practitioner_schedule",
        resource_id=schedule_id,
        purpose="practitioner_setup",
    )
    return {"deleted": True, "mode": "deactivated", "schedule_id": schedule_id}


@router.get("/{practitioner_id}", response_model=PractitionerRead)
def get_practitioner(
    practitioner_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(require_any_permission(permissions.PRACTITIONERS_MANAGE, permissions.PRACTITIONERS_READ)),
) -> PractitionerRead:
    return _read(session, _get_practitioner(session, tenant_id, practitioner_id))


@router.patch("/{practitioner_id}", response_model=PractitionerRead)
def update_practitioner(
    practitioner_id: str,
    payload: PractitionerUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(require_any_permission(permissions.SCHEDULING_MANAGE, permissions.SCHEDULING_CREATE)),
) -> PractitionerRead:
    practitioner = _get_practitioner(session, tenant_id, practitioner_id)
    if "user_id" in payload.model_fields_set:
        _validate_doctor_login_user(session, tenant_id, payload.user_id, practitioner_id)
    branch_ids = payload.branch_ids
    department_ids = payload.department_ids
    _validate_links(session, tenant_id, branch_ids or [], department_ids or [])
    for key, value in payload.model_dump(exclude_unset=True, exclude={"branch_ids", "department_ids", "actor_user_id"}).items():
        setattr(practitioner, key, value)
    practitioner.updated_at = datetime.now(timezone.utc)
    session.add(practitioner)
    session.commit()
    session.refresh(practitioner)
    _replace_links(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner.id,
        branch_ids=branch_ids,
        department_ids=department_ids,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=payload.actor_user_id,
        action="practitioner.updated",
        resource_type="practitioner",
        resource_id=practitioner.id,
        purpose="practitioner_setup",
    )
    return _read(session, practitioner)


@router.delete("/{practitioner_id}")
def delete_practitioner(
    practitioner_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PRACTITIONERS_MANAGE)),
) -> dict[str, bool | str]:
    practitioner = _get_practitioner(session, tenant_id, practitioner_id)
    practitioner.status = "inactive"
    practitioner.updated_at = datetime.now(timezone.utc)
    session.add(practitioner)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        action="practitioner.deleted",
        resource_type="practitioner",
        resource_id=practitioner.id,
        purpose="practitioner_setup",
    )
    return {"deleted": True, "mode": "deactivated", "practitioner_id": practitioner.id}


@router.post("/{practitioner_id}/schedules", response_model=PractitionerScheduleRead, status_code=status.HTTP_201_CREATED)
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
) -> PractitionerSchedule:
    _get_practitioner(session, tenant_id, practitioner_id)
    _validate_links(session, tenant_id, [payload.branch_id], [])
    _validate_time_window(payload.start_time, payload.end_time)
    schedule = PractitionerSchedule.model_validate(payload, update={"tenant_id": tenant_id, "practitioner_id": practitioner_id})
    session.add(schedule)
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


@router.get("/{practitioner_id}/schedules", response_model=list[PractitionerScheduleRead])
def list_practitioner_schedules(
    practitioner_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(require_any_permission(permissions.SCHEDULING_MANAGE, permissions.SCHEDULING_READ)),
) -> list[PractitionerSchedule]:
    _get_practitioner(session, tenant_id, practitioner_id)
    return list(
        session.exec(
            select(PractitionerSchedule).where(
                PractitionerSchedule.tenant_id == tenant_id,
                PractitionerSchedule.practitioner_id == practitioner_id,
            )
        ).all()
    )


@router.post("/{practitioner_id}/leaves", response_model=PractitionerLeaveRead, status_code=status.HTTP_201_CREATED)
def create_practitioner_leave(
    practitioner_id: str,
    payload: PractitionerLeaveCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(require_permission(permissions.PRACTITIONERS_MANAGE)),
) -> PractitionerLeave:
    _get_practitioner(session, tenant_id, practitioner_id)
    if payload.branch_id:
        _validate_links(session, tenant_id, [payload.branch_id], [])
    if payload.start_date > payload.end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start date must be on or before end date")
    if (payload.start_time is None) != (payload.end_time is None):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Leave start and end time must be provided together")
    if payload.start_time and payload.end_time:
        _validate_time_window(payload.start_time, payload.end_time)
    leave = PractitionerLeave.model_validate(payload, update={"tenant_id": tenant_id, "practitioner_id": practitioner_id})
    session.add(leave)
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


@router.get("/{practitioner_id}/leaves", response_model=list[PractitionerLeaveRead])
def list_practitioner_leaves(
    practitioner_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(require_permission(permissions.PRACTITIONERS_MANAGE)),
) -> list[PractitionerLeave]:
    _get_practitioner(session, tenant_id, practitioner_id)
    return list(
        session.exec(
            select(PractitionerLeave).where(
                PractitionerLeave.tenant_id == tenant_id,
                PractitionerLeave.practitioner_id == practitioner_id,
            )
        ).all()
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
    _current_user=Depends(require_permission(permissions.PRACTITIONERS_MANAGE)),
) -> PractitionerRoomAssignment:
    _get_practitioner(session, tenant_id, practitioner_id)
    _validate_links(session, tenant_id, [payload.branch_id], [])
    _validate_time_window(payload.start_time, payload.end_time)
    if payload.assignment_date is None and payload.weekday is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Room assignment date or weekday is required")
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Room is already assigned during this time")
    assignment = PractitionerRoomAssignment.model_validate(
        payload,
        update={"tenant_id": tenant_id, "practitioner_id": practitioner_id},
    )
    session.add(assignment)
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


@router.get("/{practitioner_id}/room-assignments", response_model=list[PractitionerRoomAssignmentRead])
def list_practitioner_room_assignments(
    practitioner_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user=Depends(require_permission(permissions.PRACTITIONERS_MANAGE)),
) -> list[PractitionerRoomAssignment]:
    _get_practitioner(session, tenant_id, practitioner_id)
    return list(
        session.exec(
            select(PractitionerRoomAssignment).where(
                PractitionerRoomAssignment.tenant_id == tenant_id,
                PractitionerRoomAssignment.practitioner_id == practitioner_id,
            )
        ).all()
    )


@router.get("/{practitioner_id}/eligibility", response_model=PractitionerEligibilityRead)
def check_practitioner_eligibility(
    practitioner_id: str,
    branch_id: str,
    department_id: str | None = None,
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
    resolved_department_id = _resolve_department(session, tenant_id, department_id).id if department_id and _resolve_department(session, tenant_id, department_id) else department_id
    return PractitionerEligibilityRead(
        practitioner_id=practitioner_id,
        tenant_id=tenant_id,
        branch_id=branch_id,
        department_id=resolved_department_id,
        eligible=practitioner_is_eligible(
            session,
            tenant_id=tenant_id,
            practitioner_id=practitioner_id,
            branch_id=branch_id,
            department_id=resolved_department_id,
        ),
    )


@router.get("/{practitioner_id}/availability", response_model=PractitionerAvailabilityRead)
def check_practitioner_schedule_availability(
    practitioner_id: str,
    branch_id: str,
    appointment_date: date,
    appointment_time: time,
    department_id: str | None = None,
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
    resolved_department_id = _resolve_department(session, tenant_id, department_id).id if department_id and _resolve_department(session, tenant_id, department_id) else department_id
    availability = check_practitioner_availability(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        department_id=resolved_department_id,
        appointment_date=appointment_date,
        appointment_time=appointment_time,
    )
    return PractitionerAvailabilityRead(
        practitioner_id=practitioner_id,
        tenant_id=tenant_id,
        branch_id=branch_id,
        department_id=resolved_department_id,
        appointment_date=appointment_date,
        appointment_time=appointment_time,
        available=availability.available,
        reason=availability.reason,
        schedule_id=availability.schedule_id,
        room_name=availability.room_name,
    )


@router.get("/{practitioner_id}/calendar", response_model=PractitionerCalendarRead)
def get_practitioner_calendar(
    practitioner_id: str,
    branch_id: str,
    start_date: date,
    end_date: date,
    department_id: str | None = None,
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
    _get_practitioner(session, tenant_id, practitioner_id)
    _validate_links(session, tenant_id, [branch_id], [])
    resolved_department_id = _resolve_department(session, tenant_id, department_id).id if department_id and _resolve_department(session, tenant_id, department_id) else department_id
    if start_date > end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start date must be on or before end date")
    if (end_date - start_date).days > 62:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Calendar range cannot exceed 62 days")
    calendar = generate_practitioner_calendar(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        department_id=resolved_department_id,
        start_date=start_date,
        end_date=end_date,
    )
    return PractitionerCalendarRead.model_validate(calendar, from_attributes=True)
