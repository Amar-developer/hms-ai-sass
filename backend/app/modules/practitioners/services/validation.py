from datetime import time

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.practitioners.models import (
    Practitioner,
    PractitionerBranch,
    PractitionerDepartment,
    PractitionerSchedule,
)
from app.modules.practitioners.repositories import (
    PractitionerLinkRepository,
    PractitionerRepository,
    PractitionerScheduleRepository,
)
from app.modules.tenants.models import Department


def validate_links(
    session: Session, tenant_id: str, branch_ids: list[str], department_ids: list[str]
) -> None:
    links = PractitionerLinkRepository(session)
    for branch_id in branch_ids:
        branch = links.get_branch_for_tenant(tenant_id, branch_id)
        if not branch:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid branch: {branch_id}",
            )


def _normalize_department_lookup(value: str | None) -> str:
    return "".join(char for char in str(value or "").lower() if char.isalnum())


def resolve_department(
    session: Session, tenant_id: str, department_id: str | None
) -> Department | None:
    if not department_id:
        return None
    links = PractitionerLinkRepository(session)
    department = links.get_department_for_tenant(tenant_id, department_id)
    if department:
        return department
    requested = _normalize_department_lookup(department_id)
    departments = links.list_departments_for_tenant(tenant_id)
    for department in departments:
        department_keys = {
            _normalize_department_lookup(department.id),
            _normalize_department_lookup(department.code),
            _normalize_department_lookup(department.name),
        }
        if requested in department_keys:
            return department
        if requested == "general" and _normalize_department_lookup(
            department.name
        ).startswith("general"):
            return department
    return None


def resolved_department_id_for_filter(
    session: Session, tenant_id: str, department_id: str | None
) -> str | None:
    department = (
        resolve_department(session, tenant_id, department_id) if department_id else None
    )
    return department.id if department else department_id


def department_filter_ids(
    session: Session, tenant_id: str, department_id: str | None
) -> set[str]:
    department = resolve_department(session, tenant_id, department_id)
    return (
        {department_id, department.id, department.code}
        if department and department_id
        else ({department_id} if department_id else set())
    )


def get_practitioner_or_404(
    session: Session, tenant_id: str, practitioner_id: str
) -> Practitioner:
    practitioner = PractitionerRepository(session).get_for_tenant(
        tenant_id, practitioner_id
    )
    if not practitioner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Practitioner not found"
        )
    return practitioner


def validate_doctor_login_user(
    session: Session,
    tenant_id: str,
    user_id: str | None,
    practitioner_id: str | None = None,
) -> None:
    if not user_id:
        return
    links = PractitionerLinkRepository(session)
    user = links.get_user_for_tenant(tenant_id, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid doctor login user"
        )
    if user.user_type != "doctor":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Linked login user must have Doctor user type",
        )
    existing = PractitionerRepository(session).find_by_user(
        tenant_id=tenant_id,
        user_id=user_id,
    )
    if existing and existing.id != practitioner_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Doctor login user is already linked to another doctor",
        )


def get_schedule_or_404(
    session: Session, tenant_id: str, schedule_id: str
) -> PractitionerSchedule:
    schedule = PractitionerScheduleRepository(session).get_for_tenant(
        tenant_id, schedule_id
    )
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Practitioner schedule not found",
        )
    return schedule


def validate_time_window(start_time: time, end_time: time) -> None:
    if start_time >= end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start time must be before end time",
        )


def replace_links(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    branch_ids: list[str] | None,
    department_ids: list[str] | None,
) -> None:
    links = PractitionerLinkRepository(session)
    if branch_ids is not None:
        existing = links.branch_links(
            tenant_id=tenant_id,
            practitioner_id=practitioner_id,
        )
        for row in existing:
            session.delete(row)
        for branch_id in sorted(set(branch_ids)):
            session.add(
                PractitionerBranch(
                    tenant_id=tenant_id,
                    practitioner_id=practitioner_id,
                    branch_id=branch_id,
                )
            )
    if department_ids is not None:
        existing = links.department_links(
            tenant_id=tenant_id,
            practitioner_id=practitioner_id,
        )
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
