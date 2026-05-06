from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.billing.models import Invoice
from app.modules.consultations.models import Consultation
from app.modules.identity.models import Role, User, UserRole
from app.modules.notifications.models import NotificationEvent
from app.modules.patients.models import Patient
from app.modules.queue.models import QueueEntry
from scripts.seed_demo import seed_demo_data


def test_seed_demo_creates_complete_workflow_data(client, test_engine):
    with Session(test_engine) as session:
        first = seed_demo_data(session)
        second = seed_demo_data(session)

        assert first["tenant_id"] == second["tenant_id"]
        assert first["patient_number"] == "DEMO-0001"
        assert first["token_number"] == "N-001"
        assert first["invoice_number"].startswith("MHD-")
        assert first["notification_count"] >= 5

        assert session.get(Patient, first["patient_id"])
        assert session.get(Appointment, first["appointment_id"])
        assert session.get(QueueEntry, first["queue_entry_id"])
        assert session.get(Consultation, first["consultation_id"])
        assert session.get(Invoice, first["invoice_id"])
        super_admin = session.exec(select(User).where(User.email == "super.admin@demo.medizinhub.local")).first()
        super_role = session.exec(select(Role).where(Role.key == "super_admin")).first()
        assert super_admin is not None
        primary_tenant_admin_role = session.exec(
            select(Role).where(Role.tenant_id == super_admin.tenant_id, Role.key == "tenant_admin")
        ).first()
        assert super_role is not None
        assert super_role.tenant_id == super_admin.tenant_id
        assert super_role.is_global_template is True
        assert primary_tenant_admin_role is not None
        assert primary_tenant_admin_role.name == "Tenant Admin"
        assert primary_tenant_admin_role.is_global_template is True
        assert session.exec(
            select(UserRole).where(UserRole.user_id == super_admin.id, UserRole.role_id == super_role.id)
        ).first()

        notification_events = session.exec(
            select(NotificationEvent.event_type).where(NotificationEvent.tenant_id == first["tenant_id"])
        ).all()
        assert {"appointment_reminder", "queue_token_call", "payment_reminder", "follow_up_reminder"}.issubset(
            {event.value for event in notification_events}
        )
