from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_branch_in_tenant, require_user_branch_access
from app.modules.audit.service import record_audit_event
from app.modules.identity.models import User
from app.modules.ip.models import IPAdmission, IPRoom
from app.modules.ip.repositories import IPAdmissionRepository, IPRoomRepository
from app.modules.ip.schemas import (
    IPAdmissionCreate,
    IPAdmissionUpdate,
    IPRoomCreate,
    IPRoomRead,
    IPRoomUpdate,
)
from app.modules.ip.services.validation import (
    _active_admission_statuses,
    _ranges_overlap,
    admission_end_date,
    assert_ip_enabled,
)
from app.modules.tenants.models import now_utc


def room_occupant(
    session: Session,
    *,
    tenant_id: str,
    room_id: str,
    start_date: date,
    end_date: date,
    exclude_admission_id: str | None = None,
) -> IPAdmission | None:
    rows = IPAdmissionRepository(session).list_active_room_admissions(
        tenant_id=tenant_id,
        room_id=room_id,
        active_statuses=_active_admission_statuses(),
    )
    for row in rows:
        if exclude_admission_id and row.id == exclude_admission_id:
            continue
        row_end = admission_end_date(session, row)
        if _ranges_overlap(start_date, end_date, row.admission_date, row_end):
            return row
    return None


def room_read(
    session: Session,
    room: IPRoom,
    *,
    available_from: date | None = None,
    available_to: date | None = None,
) -> IPRoomRead:
    start_date = available_from or date.today()
    end_date = available_to or start_date
    occupant = room_occupant(
        session,
        tenant_id=room.tenant_id,
        room_id=room.id,
        start_date=start_date,
        end_date=end_date,
    )
    data = IPRoomRead.model_validate(room, from_attributes=True).model_dump()
    data["available"] = room.is_active and occupant is None
    data["occupied_admission_id"] = occupant.id if occupant else None
    return IPRoomRead(**data)


def resolve_room_for_admission(
    session: Session,
    tenant_id: str,
    branch_id: str,
    payload: IPAdmissionCreate | IPAdmissionUpdate,
    *,
    admission_date: date,
    expected_discharge_date: date | None,
    exclude_admission_id: str | None = None,
) -> tuple[IPRoom | None, dict[str, str | None]]:
    if not payload.room_id:
        return None, {}
    room = IPRoomRepository(session).get_for_update(payload.room_id)
    if (
        not room
        or room.tenant_id != tenant_id
        or room.branch_id != branch_id
        or not room.is_active
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or inactive IP room",
        )
    end_date = expected_discharge_date or admission_date
    occupant = room_occupant(
        session,
        tenant_id=tenant_id,
        room_id=room.id,
        start_date=admission_date,
        end_date=end_date,
        exclude_admission_id=exclude_admission_id,
    )
    if occupant:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Selected room/bed is not available for this date range",
        )
    return room, {
        "ward": room.ward_name,
        "room": room.room_number,
        "bed": room.bed_number,
    }


def create_room_record(
    session: Session,
    *,
    tenant_id: str,
    payload: IPRoomCreate,
    current_user: User,
) -> IPRoomRead:
    assert_ip_enabled(session, tenant_id)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    duplicate = IPRoomRepository(session).find_duplicate_bed(
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        room_number=payload.room_number,
        bed_number=payload.bed_number,
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Room and bed already exists"
        )
    room = IPRoom.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(room)
    session.commit()
    session.refresh(room)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=room.branch_id,
        actor_user_id=current_user.id,
        action="ip_room.created",
        resource_type="ip_room",
        resource_id=room.id,
        purpose="ip_room_master",
    )
    return room_read(session, room)


def update_room_record(
    session: Session,
    *,
    tenant_id: str,
    room_id: str,
    payload: IPRoomUpdate,
    current_user: User,
) -> IPRoomRead:
    assert_ip_enabled(session, tenant_id)
    room = IPRoomRepository(session).get_for_tenant(
        tenant_id=tenant_id, room_id=room_id
    )
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="IP room not found"
        )
    require_user_branch_access(current_user, room.branch_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(room, key, value)
    room.updated_by_user_id = current_user.id
    room.updated_at = now_utc()
    session.add(room)
    session.commit()
    session.refresh(room)
    return room_read(session, room)
