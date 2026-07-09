from datetime import date, time

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.practitioners.schemas import (
    PractitionerAvailabilityRead,
    PractitionerCalendarRead,
    PractitionerEligibilityRead,
)
from app.modules.practitioners.services.availability import (
    check_practitioner_availability,
    generate_practitioner_calendar,
    practitioner_is_eligible,
)
from app.modules.practitioners.services.validation import (
    get_practitioner_or_404,
    resolved_department_id_for_filter,
    validate_links,
)


def check_eligibility(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    branch_id: str,
    department_id: str | None,
) -> PractitionerEligibilityRead:
    resolved_department_id = resolved_department_id_for_filter(
        session, tenant_id, department_id
    )
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


def check_schedule_availability(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    branch_id: str,
    appointment_date: date,
    appointment_time: time,
    department_id: str | None,
) -> PractitionerAvailabilityRead:
    resolved_department_id = resolved_department_id_for_filter(
        session, tenant_id, department_id
    )
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


def get_calendar(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    branch_id: str,
    start_date: date,
    end_date: date,
    department_id: str | None,
) -> PractitionerCalendarRead:
    get_practitioner_or_404(session, tenant_id, practitioner_id)
    validate_links(session, tenant_id, [branch_id], [])
    resolved_department_id = resolved_department_id_for_filter(
        session, tenant_id, department_id
    )
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date must be on or before end date",
        )
    if (end_date - start_date).days > 62:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Calendar range cannot exceed 62 days",
        )
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
