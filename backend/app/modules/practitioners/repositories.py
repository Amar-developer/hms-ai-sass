from datetime import date, time

from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.identity.models import User
from app.modules.practitioners.models import (
    Practitioner,
    PractitionerBranch,
    PractitionerDepartment,
    PractitionerLeave,
    PractitionerRoomAssignment,
    PractitionerSchedule,
)
from app.modules.tenants.models import Branch, Department


class PractitionerRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, practitioner: Practitioner) -> Practitioner:
        self.session.add(practitioner)
        return practitioner

    def get_for_tenant(
        self, tenant_id: str, practitioner_id: str
    ) -> Practitioner | None:
        practitioner = self.session.get(Practitioner, practitioner_id)
        if not practitioner or practitioner.tenant_id != tenant_id:
            return None
        return practitioner

    def find_by_user(self, *, tenant_id: str, user_id: str) -> Practitioner | None:
        return self.session.exec(
            select(Practitioner).where(
                Practitioner.tenant_id == tenant_id,
                Practitioner.user_id == user_id,
            )
        ).first()

    def list_for_tenant(
        self, *, tenant_id: str, practitioner_id: str | None = None
    ) -> list[Practitioner]:
        statement = (
            select(Practitioner)
            .where(Practitioner.tenant_id == tenant_id)
            .order_by(Practitioner.full_name)
        )
        if practitioner_id:
            statement = statement.where(Practitioner.id == practitioner_id)
        return list(self.session.exec(statement).all())


class PractitionerLinkRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_user_for_tenant(self, tenant_id: str, user_id: str) -> User | None:
        user = self.session.get(User, user_id)
        if not user or user.tenant_id != tenant_id:
            return None
        return user

    def get_branch_for_tenant(self, tenant_id: str, branch_id: str) -> Branch | None:
        branch = self.session.get(Branch, branch_id)
        if not branch or branch.tenant_id != tenant_id:
            return None
        return branch

    def get_department_for_tenant(
        self, tenant_id: str, department_id: str
    ) -> Department | None:
        department = self.session.get(Department, department_id)
        if not department or department.tenant_id != tenant_id:
            return None
        return department

    def list_departments_for_tenant(self, tenant_id: str) -> list[Department]:
        return list(
            self.session.exec(
                select(Department).where(Department.tenant_id == tenant_id)
            ).all()
        )

    def active_branch_ids(self, *, tenant_id: str, practitioner_id: str) -> list[str]:
        return [
            row.branch_id
            for row in self.session.exec(
                select(PractitionerBranch).where(
                    PractitionerBranch.tenant_id == tenant_id,
                    PractitionerBranch.practitioner_id == practitioner_id,
                    PractitionerBranch.is_active == True,  # noqa: E712
                )
            ).all()
        ]

    def active_department_ids(
        self, *, tenant_id: str, practitioner_id: str
    ) -> list[str]:
        return [
            row.department_id
            for row in self.session.exec(
                select(PractitionerDepartment).where(
                    PractitionerDepartment.tenant_id == tenant_id,
                    PractitionerDepartment.practitioner_id == practitioner_id,
                    PractitionerDepartment.is_active == True,  # noqa: E712
                )
            ).all()
        ]

    def get_branch_link(
        self, *, tenant_id: str, practitioner_id: str, branch_id: str
    ) -> PractitionerBranch | None:
        link = self.session.get(PractitionerBranch, (practitioner_id, branch_id))
        if not link or link.tenant_id != tenant_id:
            return None
        return link

    def get_department_link(
        self, *, tenant_id: str, practitioner_id: str, department_id: str
    ) -> PractitionerDepartment | None:
        link = self.session.get(
            PractitionerDepartment, (practitioner_id, department_id)
        )
        if not link or link.tenant_id != tenant_id:
            return None
        return link

    def branch_links(self, *, tenant_id: str, practitioner_id: str):
        return self.session.exec(
            select(PractitionerBranch).where(
                PractitionerBranch.tenant_id == tenant_id,
                PractitionerBranch.practitioner_id == practitioner_id,
            )
        ).all()

    def department_links(self, *, tenant_id: str, practitioner_id: str):
        return self.session.exec(
            select(PractitionerDepartment).where(
                PractitionerDepartment.tenant_id == tenant_id,
                PractitionerDepartment.practitioner_id == practitioner_id,
            )
        ).all()


class PractitionerScheduleRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, schedule: PractitionerSchedule) -> PractitionerSchedule:
        self.session.add(schedule)
        return schedule

    def get_for_tenant(
        self, tenant_id: str, schedule_id: str
    ) -> PractitionerSchedule | None:
        schedule = self.session.get(PractitionerSchedule, schedule_id)
        if not schedule or schedule.tenant_id != tenant_id:
            return None
        return schedule

    def list_for_filters(
        self,
        *,
        tenant_id: str,
        practitioner_id: str | None = None,
        branch_id: str | None = None,
        department_ids: set[str] | None = None,
        is_active: bool | None = None,
    ) -> list[PractitionerSchedule]:
        statement = select(PractitionerSchedule).where(
            PractitionerSchedule.tenant_id == tenant_id
        )
        if practitioner_id:
            statement = statement.where(
                PractitionerSchedule.practitioner_id == practitioner_id
            )
        if branch_id:
            statement = statement.where(PractitionerSchedule.branch_id == branch_id)
        if department_ids:
            statement = statement.where(
                PractitionerSchedule.department_id.in_(department_ids)
            )
        if is_active is not None:
            statement = statement.where(PractitionerSchedule.is_active == is_active)
        return list(
            self.session.exec(
                statement.order_by(
                    PractitionerSchedule.updated_at.desc(),
                    PractitionerSchedule.created_at.desc(),
                )
            ).all()
        )

    def active_for_weekday(
        self,
        *,
        tenant_id: str,
        practitioner_id: str,
        branch_id: str,
        weekday: int,
    ) -> list[PractitionerSchedule]:
        return list(
            self.session.exec(
                select(PractitionerSchedule).where(
                    PractitionerSchedule.tenant_id == tenant_id,
                    PractitionerSchedule.practitioner_id == practitioner_id,
                    PractitionerSchedule.branch_id == branch_id,
                    PractitionerSchedule.weekday == weekday,
                    PractitionerSchedule.is_active == True,  # noqa: E712
                )
            ).all()
        )


class PractitionerReferenceRepository:
    def __init__(self, session: Session):
        self.session = session

    def practitioner_names(self, practitioner_ids: set[str]) -> dict[str, str]:
        if not practitioner_ids:
            return {}
        return {
            row.id: row.full_name
            for row in self.session.exec(
                select(Practitioner).where(Practitioner.id.in_(practitioner_ids))
            ).all()
        }

    def branch_names(self, branch_ids: set[str]) -> dict[str, str]:
        if not branch_ids:
            return {}
        return {
            row.id: row.name
            for row in self.session.exec(
                select(Branch).where(Branch.id.in_(branch_ids))
            ).all()
        }

    def department_names(self, department_ids: set[str]) -> dict[str, str]:
        if not department_ids:
            return {}
        return {
            row.id: row.name
            for row in self.session.exec(
                select(Department).where(Department.id.in_(department_ids))
            ).all()
        }


class PractitionerLeaveRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, leave: PractitionerLeave) -> PractitionerLeave:
        self.session.add(leave)
        return leave

    def list_for_practitioner(
        self, *, tenant_id: str, practitioner_id: str
    ) -> list[PractitionerLeave]:
        return list(
            self.session.exec(
                select(PractitionerLeave).where(
                    PractitionerLeave.tenant_id == tenant_id,
                    PractitionerLeave.practitioner_id == practitioner_id,
                )
            ).all()
        )

    def active_for_date(
        self, *, tenant_id: str, practitioner_id: str, appointment_date: date
    ) -> list[PractitionerLeave]:
        return list(
            self.session.exec(
                select(PractitionerLeave).where(
                    PractitionerLeave.tenant_id == tenant_id,
                    PractitionerLeave.practitioner_id == practitioner_id,
                    PractitionerLeave.start_date <= appointment_date,
                    PractitionerLeave.end_date >= appointment_date,
                    PractitionerLeave.is_active == True,  # noqa: E712
                )
            ).all()
        )


class PractitionerRoomAssignmentRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, assignment: PractitionerRoomAssignment) -> PractitionerRoomAssignment:
        self.session.add(assignment)
        return assignment

    def list_for_practitioner(
        self, *, tenant_id: str, practitioner_id: str
    ) -> list[PractitionerRoomAssignment]:
        return list(
            self.session.exec(
                select(PractitionerRoomAssignment).where(
                    PractitionerRoomAssignment.tenant_id == tenant_id,
                    PractitionerRoomAssignment.practitioner_id == practitioner_id,
                )
            ).all()
        )

    def active_for_room(
        self, *, tenant_id: str, branch_id: str, room_name: str
    ) -> list[PractitionerRoomAssignment]:
        return list(
            self.session.exec(
                select(PractitionerRoomAssignment).where(
                    PractitionerRoomAssignment.tenant_id == tenant_id,
                    PractitionerRoomAssignment.branch_id == branch_id,
                    PractitionerRoomAssignment.room_name == room_name,
                    PractitionerRoomAssignment.is_active == True,  # noqa: E712
                )
            ).all()
        )

    def active_for_practitioner_branch(
        self,
        *,
        tenant_id: str,
        practitioner_id: str,
        branch_id: str,
    ) -> list[PractitionerRoomAssignment]:
        return list(
            self.session.exec(
                select(PractitionerRoomAssignment).where(
                    PractitionerRoomAssignment.tenant_id == tenant_id,
                    PractitionerRoomAssignment.practitioner_id == practitioner_id,
                    PractitionerRoomAssignment.branch_id == branch_id,
                    PractitionerRoomAssignment.is_active == True,  # noqa: E712
                )
            ).all()
        )


class PractitionerAppointmentRepository:
    def __init__(self, session: Session):
        self.session = session

    def appointments_at_time(
        self,
        *,
        tenant_id: str,
        practitioner_id: str,
        appointment_date: date,
        appointment_time: time,
    ) -> list[Appointment]:
        return list(
            self.session.exec(
                select(Appointment).where(
                    Appointment.tenant_id == tenant_id,
                    Appointment.practitioner_id == practitioner_id,
                    Appointment.appointment_date == appointment_date,
                    Appointment.appointment_time == appointment_time,
                )
            ).all()
        )
