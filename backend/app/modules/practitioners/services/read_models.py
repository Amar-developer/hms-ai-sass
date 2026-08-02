from sqlmodel import Session

from app.modules.practitioners.models import Practitioner, PractitionerSchedule
from app.modules.practitioners.repositories import (
    PractitionerLinkRepository,
    PractitionerReferenceRepository,
)
from app.modules.practitioners.schemas import PractitionerRead, PractitionerScheduleRead


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
