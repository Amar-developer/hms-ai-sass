from datetime import date

from sqlmodel import Session

from app.core.access_control import scoped_branch_id
from app.modules.identity.models import User
from app.modules.ip.repositories import IPRoomRepository
from app.modules.ip.schemas import IPRoomRead
from app.modules.ip.services.rooms import room_read
from app.modules.ip.services.validation import assert_ip_enabled


def list_ip_rooms(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    ward_type: str | None,
    room_type: str | None,
    available_from: date | None,
    available_to: date | None,
    include_occupied: bool,
    current_user: User,
) -> list[IPRoomRead]:
    assert_ip_enabled(session, tenant_id)
    branch_scope = scoped_branch_id(current_user, branch_id)
    rows = IPRoomRepository(session).list_rooms(
        tenant_id=tenant_id,
        branch_id=branch_scope,
        ward_type=ward_type,
        room_type=room_type,
    )
    read_rows = [
        room_read(
            session, row, available_from=available_from, available_to=available_to
        )
        for row in rows
    ]
    if not include_occupied:
        read_rows = [row for row in read_rows if row.available]
    return read_rows
