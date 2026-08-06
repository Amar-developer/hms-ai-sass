from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import (
    current_doctor_practitioner_id,
    enforce_entitlement,
    require_branch_in_tenant,
    require_doctor_practitioner_access,
    require_user_branch_access,
    scoped_branch_id,
)
from app.core.pagination import Page
from app.modules.appointments.models import Appointment
from app.modules.appointments.repositories import (
    AppointmentGridRepository,
    AppointmentRepository,
)
from app.modules.appointments.schemas import AppointmentGridRead
from app.modules.identity.models import User


def appointment_grid_row(row) -> AppointmentGridRead:
    (
        appointment,
        tenant_id,
        tenant_name,
        branch_id,
        branch_name,
        patient_id,
        patient_name,
        patient_mobile,
        department_id,
        department_name,
        practitioner_id,
        practitioner_name,
        token_number,
        consultation_status,
    ) = row
    return AppointmentGridRead(
        id=appointment.id,
        tenant_id=tenant_id,
        tenant_name=tenant_name,
        branch_id=branch_id,
        branch_name=branch_name,
        patient_id=patient_id,
        patient_name=patient_name,
        patient_mobile=patient_mobile,
        department_id=department_id or appointment.department_id,
        department_name=department_name or appointment.department_id,
        practitioner_id=practitioner_id or appointment.practitioner_id,
        practitioner_name=practitioner_name or appointment.practitioner_id,
        token_number=token_number,
        appointment_type=appointment.appointment_type,
        visit_purpose=appointment.visit_purpose,
        reason=appointment.reason,
        source_appointment_id=appointment.source_appointment_id,
        acquisition_source=appointment.acquisition_source,
        referrer_patient_id=appointment.referrer_patient_id,
        referrer_name=appointment.referrer_name,
        is_billable=appointment.is_billable,
        custom_fee_amount=appointment.custom_fee_amount,
        billing_note=appointment.billing_note,
        emergency_reason=appointment.emergency_reason,
        intake_vitals=appointment.intake_vitals,
        intake_complaints=appointment.intake_complaints,
        appointment_date=appointment.appointment_date,
        appointment_time=appointment.appointment_time,
        status=appointment.status,
        consultation_status=(
            consultation_status.value
            if hasattr(consultation_status, "value")
            else consultation_status
        ),
        created_by_user_id=appointment.created_by_user_id,
        created_at=appointment.created_at,
        updated_at=appointment.updated_at,
    )


class AppointmentQueryService:
    """Read-only lookups over appointments: grid listings and single-record fetch."""

    def __init__(self, session: Session):
        self.session = session
        self.appointments = AppointmentRepository(session)
        self.grid = AppointmentGridRepository(session)

    def list_appointments(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        department_id: str | None,
        practitioner_id: str | None,
        appointment_date: date | None,
        q: str | None,
        skip: int,
        limit: int,
        actor: User,
    ) -> list[AppointmentGridRead]:
        enforce_entitlement(self.session, tenant_id, "appointments")
        branch_id = scoped_branch_id(actor, branch_id)
        require_branch_in_tenant(self.session, tenant_id, branch_id)
        doctor_practitioner_id = current_doctor_practitioner_id(
            self.session, tenant_id, actor
        )
        if doctor_practitioner_id:
            effective_practitioner_id = doctor_practitioner_id
        elif practitioner_id:
            effective_practitioner_id = practitioner_id
        else:
            effective_practitioner_id = None
        rows = self.grid.list_for_tenant(
            tenant_id=tenant_id,
            branch_id=branch_id,
            department_id=department_id,
            practitioner_id=effective_practitioner_id,
            appointment_date=appointment_date,
            q=q,
            skip=skip,
            limit=limit,
        )
        return [appointment_grid_row(row) for row in rows]

    def list_platform_appointments(
        self,
        *,
        tenant_id: str | None,
        branch_id: str | None,
        department_id: str | None,
        appointment_date: date | None,
        q: str | None,
        skip: int,
        limit: int,
    ) -> list[AppointmentGridRead]:
        # Require at least one scoping filter so this cross-tenant, 8-table-join
        # search can never run as an unbounded full-platform scan.
        if not any([tenant_id, branch_id, department_id, appointment_date, q]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide at least one filter (tenant, branch, department, date, or search term)",
            )
        rows = self.grid.list_platform(
            tenant_id=tenant_id,
            branch_id=branch_id,
            department_id=department_id,
            appointment_date=appointment_date,
            q=q,
            skip=skip,
            limit=limit,
        )
        return [appointment_grid_row(row) for row in rows]

    def list_appointment_page(self, **kwargs) -> Page[AppointmentGridRead]:
        items = self.list_appointments(**kwargs)
        actor = kwargs["actor"]
        branch_id = scoped_branch_id(actor, kwargs["branch_id"])
        doctor_practitioner_id = current_doctor_practitioner_id(
            self.session, kwargs["tenant_id"], actor
        )
        practitioner_id = doctor_practitioner_id or kwargs["practitioner_id"]
        total = self.grid.count_for_tenant(
            tenant_id=kwargs["tenant_id"],
            branch_id=branch_id,
            department_id=kwargs["department_id"],
            practitioner_id=practitioner_id,
            appointment_date=kwargs["appointment_date"],
            q=kwargs["q"],
        )
        return Page(
            items=items,
            total=total,
            limit=kwargs["limit"],
            offset=kwargs["skip"],
        )

    def get_appointment(
        self, *, tenant_id: str, appointment_id: str, actor: User
    ) -> Appointment:
        enforce_entitlement(self.session, tenant_id, "appointments")
        appointment = self.appointments.get_for_tenant(tenant_id, appointment_id)
        if not appointment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
            )
        require_user_branch_access(actor, appointment.branch_id)
        require_doctor_practitioner_access(
            self.session, tenant_id, actor, appointment.practitioner_id
        )
        return appointment
