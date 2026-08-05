from datetime import date

from sqlmodel import Session

from app.modules.practitioners.models import Practitioner, PractitionerSchedule
from app.modules.practitioners.repositories import (
    PractitionerLinkRepository,
    PractitionerReferenceRepository,
)
from app.modules.practitioners.schemas import (
    PractitionerRead,
    PractitionerScheduleGroupRead,
    PractitionerScheduleRead,
    PractitionerScheduleSlotRead,
)


def practitioner_branch_ids(
    session: Session, tenant_id: str, practitioner_id: str
) -> list[str]:
    return PractitionerLinkRepository(session).active_branch_ids(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
    )


def practitioner_department_ids(
    session: Session, tenant_id: str, practitioner_id: str
) -> list[str]:
    return PractitionerLinkRepository(session).active_department_ids(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
    )


def read_practitioner(session: Session, practitioner: Practitioner) -> PractitionerRead:
    return practitioner_read_with_links(
        practitioner,
        branch_ids=practitioner_branch_ids(
            session, practitioner.tenant_id, practitioner.id
        ),
        department_ids=practitioner_department_ids(
            session, practitioner.tenant_id, practitioner.id
        ),
    )


def practitioner_read_with_links(
    practitioner: Practitioner,
    *,
    branch_ids: list[str],
    department_ids: list[str],
) -> PractitionerRead:
    data = PractitionerRead.model_validate(
        practitioner, from_attributes=True
    ).model_dump()
    data["branch_ids"] = branch_ids
    data["department_ids"] = department_ids
    return PractitionerRead(**data)


def enrich_schedules(
    session: Session, schedules: list[PractitionerSchedule]
) -> list[PractitionerScheduleRead]:
    """Attach human-readable practitioner / branch / department names so the UI
    never has to fall back to rendering a raw id or slug for these rows."""
    if not schedules:
        return []
    prac_ids = {s.practitioner_id for s in schedules if s.practitioner_id}
    branch_ids = {s.branch_id for s in schedules if s.branch_id}
    dept_ids = {s.department_id for s in schedules if s.department_id}

    references = PractitionerReferenceRepository(session)
    prac_names = references.practitioner_names(prac_ids)
    branch_names = references.branch_names(branch_ids)
    dept_names = references.department_names(dept_ids)

    rows: list[PractitionerScheduleRead] = []
    for schedule in schedules:
        read = PractitionerScheduleRead.model_validate(schedule, from_attributes=True)
        read.practitioner_full_name = prac_names.get(schedule.practitioner_id)
        read.branch_name = branch_names.get(schedule.branch_id)
        read.department_name = dept_names.get(schedule.department_id)
        rows.append(read)
    return rows


def schedule_group_key(schedule: PractitionerScheduleRead) -> str:
    """Identity of one editable schedule: everything a group shares, with the
    per-slot timing fields deliberately excluded.

    Joined with "~" (URL-unreserved) because this key is addressable — the
    scheduling UI puts it straight into /scheduling/{group_key}/edit.
    """
    return "~".join(
        [
            schedule.practitioner_id,
            schedule.branch_id,
            schedule.department_id or "",
            schedule.room_number or "",
            str(schedule.slot_minutes),
            "active" if schedule.is_active else "inactive",
        ]
    )


def group_schedules(
    rows: list[PractitionerScheduleRead],
) -> list[PractitionerScheduleGroupRead]:
    """Collapse flat timing rows into one object per doctor/branch/department/
    room/slot-size, with the timings nested under `slots`."""
    groups: dict[str, PractitionerScheduleGroupRead] = {}
    for row in rows:
        key = schedule_group_key(row)
        slot = PractitionerScheduleSlotRead.model_validate(row, from_attributes=True)
        group = groups.get(key)
        if group is None:
            groups[key] = PractitionerScheduleGroupRead(
                group_key=key,
                practitioner_id=row.practitioner_id,
                practitioner_full_name=row.practitioner_full_name,
                branch_id=row.branch_id,
                branch_name=row.branch_name,
                department_id=row.department_id,
                department_name=row.department_name,
                room_name=row.room_name,
                room_number=row.room_number,
                slot_minutes=row.slot_minutes,
                is_active=row.is_active,
                slots=[slot],
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            continue
        group.slots.append(slot)
        group.created_at = min(group.created_at, row.created_at)
        group.updated_at = max(group.updated_at, row.updated_at)

    ordered = list(groups.values())
    for group in ordered:
        # Recurring weekly rows first (by weekday), then dated ones by date,
        # so the UI can render a stable timing list without re-sorting.
        group.slots.sort(
            key=lambda slot: (
                slot.schedule_date is not None,
                slot.schedule_date or date.min,
                slot.weekday,
                slot.start_time,
            )
        )
    ordered.sort(key=lambda group: group.updated_at, reverse=True)
    return ordered
