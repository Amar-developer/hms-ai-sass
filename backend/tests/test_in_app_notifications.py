from datetime import date

from sqlmodel import Session, select

from app.modules.appointments.models import Appointment, AppointmentType
from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole
from app.modules.notifications.models import InAppNotification
from app.modules.notifications.schemas import (
    InAppNotificationUpdate,
    ProductAnnouncementCreate,
)
from app.modules.notifications.services.in_app import (
    list_for_user,
    notify_appointment_booked,
    publish_announcement,
    update_for_user,
)
from app.modules.practitioners.models import Practitioner
from app.modules.tenants.models import Branch, Department, Tenant, TenantStatus


def test_announcement_inbox_read_and_archive(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Notification Clinic", status=TenantStatus.ACTIVE)
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        recipient = User(
            tenant_id=tenant.id,
            name="Clinic User",
            email="clinic.notifications@test.local",
        )
        publisher = User(
            name="Platform Publisher",
            email="platform.publisher@test.local",
            is_super_admin=True,
        )
        session.add(recipient)
        session.add(publisher)
        session.commit()
        session.refresh(recipient)
        session.refresh(publisher)

        published = publish_announcement(
            session,
            current_tenant_id=tenant.id,
            actor=publisher,
            payload=ProductAnnouncementCreate(
                target_tenant_id=tenant.id,
                category="version_update",
                priority="high",
                title="Version 1.2 available",
                message="The appointment workspace has been improved.",
                version="1.2.0",
                action_module="appointments",
            ),
        )
        assert published.delivered_count == 1

        inbox = list_for_user(
            session,
            user=recipient,
            limit=30,
            offset=0,
            unread_only=False,
            category=None,
            include_archived=False,
        )
        assert inbox.unread_count == 1
        row = inbox.items[0]
        assert row.title == "Version 1.2 available"
        assert row.action_module == "appointments"

        marked = update_for_user(
            session,
            notification_id=row.id,
            user=recipient,
            payload=InAppNotificationUpdate(is_read=True),
        )
        assert marked.is_read is True

        archived = update_for_user(
            session,
            notification_id=row.id,
            user=recipient,
            payload=InAppNotificationUpdate(archived=True),
        )
        assert archived.archived_at is not None
        visible = list_for_user(
            session,
            user=recipient,
            limit=30,
            offset=0,
            unread_only=False,
            category=None,
            include_archived=False,
        )
        assert visible.items == []


def test_appointment_notification_targets_assigned_doctor_and_deduplicates(
    test_engine,
):
    with Session(test_engine) as session:
        tenant = Tenant(name="Doctor Notification Clinic", status=TenantStatus.ACTIVE)
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        department = Department(
            tenant_id=tenant.id,
            name="Cardiology",
            code="CARDIOLOGY",
        )
        doctor_user = User(
            tenant_id=tenant.id,
            name="Dr Alert",
            email="doctor.alert@test.local",
            user_type="doctor",
        )
        actor = User(
            tenant_id=tenant.id,
            name="Booking User",
            email="booking.user@test.local",
            user_type="receptionist",
        )
        session.add(branch)
        session.add(department)
        session.add(doctor_user)
        session.add(actor)
        session.commit()
        for row in (branch, department, doctor_user, actor):
            session.refresh(row)
        practitioner = Practitioner(
            tenant_id=tenant.id,
            user_id=doctor_user.id,
            full_name="Dr Alert",
        )
        permission = Permission(
            key="appointments.read", description="Read appointments"
        )
        role = Role(tenant_id=tenant.id, name="Doctor", key="doctor")
        session.add(practitioner)
        session.add(permission)
        session.add(role)
        session.commit()
        session.refresh(practitioner)
        session.refresh(permission)
        session.refresh(role)
        session.add(
            UserRole(user_id=doctor_user.id, role_id=role.id, tenant_id=tenant.id)
        )
        session.add(RolePermission(role_id=role.id, permission_id=permission.id))
        session.commit()

        appointment = Appointment(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id="patient_notification",
            department_id=department.id,
            practitioner_id=practitioner.id,
            appointment_type=AppointmentType.OP,
            appointment_date=date.today(),
            created_by_user_id=actor.id,
        )
        session.add(appointment)
        session.commit()
        session.refresh(appointment)

        for _ in range(2):
            notify_appointment_booked(
                session,
                appointment=appointment,
                patient_name="Test Patient",
                token_number="A-001",
                actor_user_id=actor.id,
            )

        rows = list(
            session.exec(
                select(InAppNotification).where(
                    InAppNotification.recipient_user_id == doctor_user.id
                )
            ).all()
        )
        assert len(rows) == 1
        assert rows[0].department_id == department.id
        assert rows[0].resource_id == appointment.id
        assert rows[0].event_type == "appointment.booked"
