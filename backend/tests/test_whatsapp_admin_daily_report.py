import json
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.credentials import encrypt_credential
from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.home_care.models import HomeCareBooking, HomeCareVisitLog
from app.modules.identity.models import User
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations.whatsapp.daily_report import (
    queue_due_whatsapp_admin_daily_reports,
)
from app.modules.integrations.whatsapp.gateway import WhatsAppGatewayResult
from app.modules.integrations.whatsapp import queue_service as whatsapp_queue_service
from app.modules.integrations.whatsapp import service as whatsapp_service
from app.modules.integrations.whatsapp.schemas import WhatsAppIntegrationUpdate
from app.modules.lab.models import LabOrder, LabOrderStatus
from app.modules.notifications import whatsapp_processor
from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.services import events
from app.modules.subscriptions.models import SubscriptionPlan, TenantSubscription
from app.modules.patients.models import Patient
from app.modules.tenants.models import Branch, Tenant


def test_admin_report_configuration_can_be_saved_before_recipients_are_selected():
    payload = WhatsAppIntegrationUpdate.model_validate(
        {
            "enabled": True,
            "api_url": "https://gateway.example.com/messages",
            "api_key": "daily-report-secret",
            "patient_notifications_enabled": False,
            "doctor_notifications_enabled": False,
            "admin_recipient_user_ids": [],
            "templates": {"admin_daily_report": "hms_admin_daily_report"},
            "flows": {"admin_daily_report": True},
        }
    )

    assert payload.flows.admin_daily_report is True
    assert payload.admin_recipient_user_ids == []


def test_admin_report_recipient_selection_rejects_another_tenants_user(
    test_engine, monkeypatch
):
    monkeypatch.setattr(
        whatsapp_service,
        "enforce_module_enabled",
        lambda _session, _tenant, _module: None,
    )
    with Session(test_engine) as session:
        tenant = Tenant(name="Recipient Clinic")
        other_tenant = Tenant(name="Other Clinic")
        session.add(tenant)
        session.add(other_tenant)
        session.commit()
        actor = User(
            tenant_id=tenant.id,
            user_type="tenant_admin",
            name="Recipient Admin",
            email="recipient.admin@example.com",
            mobile="9876543210",
        )
        foreign_user = User(
            tenant_id=other_tenant.id,
            name="Foreign User",
            email="foreign.user@example.com",
            mobile="9123456789",
        )
        session.add(actor)
        session.add(foreign_user)
        session.commit()

        payload = WhatsAppIntegrationUpdate.model_validate(
            {
                "enabled": True,
                "api_url": "https://gateway.example.com/messages",
                "api_key": "daily-report-secret",
                "patient_notifications_enabled": False,
                "doctor_notifications_enabled": False,
                "admin_recipient_user_ids": [foreign_user.id],
                "templates": {"admin_daily_report": "hms_admin_daily_report"},
                "flows": {"admin_daily_report": True},
            }
        )
        with pytest.raises(HTTPException) as error:
            whatsapp_service.update_whatsapp_integration(
                session,
                tenant_id=tenant.id,
                payload=payload,
                actor=actor,
            )
        assert error.value.status_code == 422
        assert "active users in this tenant" in str(error.value.detail)


def test_daily_report_queues_once_at_tenant_10pm_and_sends_eight_values(
    test_engine, monkeypatch
):
    monkeypatch.setattr(
        events, "enforce_module_enabled", lambda _session, _tenant, _module: None
    )
    monkeypatch.setattr(
        whatsapp_processor,
        "enforce_module_enabled",
        lambda _session, _tenant, _module: None,
    )
    sent = {}

    class FakeGateway:
        def send_template(self, **kwargs):
            sent.update(kwargs)
            return WhatsAppGatewayResult(True, "sent", "Message sent.", 200)

    with Session(test_engine) as session:
        tenant = Tenant(name="Daily Report Clinic", timezone="Asia/Kolkata")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        plan = SubscriptionPlan(
            key=f"daily_report_{tenant.id}",
            name="Daily Report Plan",
            monthly_patient_limit=1000,
            monthly_whatsapp_message_limit=1000,
            enabled_modules_json=json.dumps(["whatsapp"]),
        )
        session.add(plan)
        session.commit()
        session.refresh(plan)
        session.add(
            TenantSubscription(
                tenant_id=tenant.id,
                plan_id=plan.id,
                starts_on=date(2026, 8, 1),
            )
        )
        admin = User(
            tenant_id=tenant.id,
            user_type="tenant_admin",
            name="Clinic Admin",
            email="daily.admin@example.com",
            mobile="98765 43210",
        )
        unselected_admin = User(
            tenant_id=tenant.id,
            user_type="tenant_admin",
            name="Unselected Admin",
            email="unselected.admin@example.com",
            mobile="91234 56789",
        )
        integration = TenantIntegrationPlugin(
            tenant_id=tenant.id,
            plugin_key="whatsapp",
            enabled=True,
            config_json=json.dumps(
                {
                    "api_url": "https://gateway.example.com/messages",
                    "default_country_code": "+91",
                    "admin_recipient_user_ids": [admin.id],
                    "templates": {"admin_daily_report": "hms_admin_daily_report"},
                    "flows": {"admin_daily_report": True},
                }
            ),
            secret_ciphertext=encrypt_credential("daily-report-secret"),
            secret_last_four="cret",
        )
        session.add(admin)
        session.add(unselected_admin)
        session.add(integration)
        session.commit()

        branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        patient = Patient(
            tenant_id=tenant.id,
            patient_number="P-DAILY-1",
            full_name="Daily Patient",
            mobile="9000000000",
        )
        session.add(branch)
        session.add(patient)
        session.commit()
        session.refresh(branch)
        session.refresh(patient)
        report_date = date(2026, 8, 26)
        completed_homecare = HomeCareBooking(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            booking_number="HC-DAILY-1",
            start_date=report_date,
            end_date=report_date,
        )
        pending_homecare = HomeCareBooking(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            booking_number="HC-DAILY-2",
            start_date=report_date,
            end_date=report_date,
        )
        session.add(completed_homecare)
        session.add(pending_homecare)
        session.commit()
        session.refresh(completed_homecare)
        session.add_all(
            [
                Appointment(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    patient_id=patient.id,
                    appointment_date=report_date,
                    status=AppointmentStatus.BILLED,
                ),
                Appointment(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    patient_id=patient.id,
                    appointment_date=report_date,
                    status=AppointmentStatus.SCHEDULED,
                ),
                LabOrder(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    patient_id=patient.id,
                    order_date=report_date,
                    tests="CBC",
                    status=LabOrderStatus.RESULT_READY,
                ),
                LabOrder(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    patient_id=patient.id,
                    order_date=report_date,
                    tests="RBS",
                    status=LabOrderStatus.ORDERED,
                ),
                HomeCareVisitLog(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    booking_id=completed_homecare.id,
                    visit_date=report_date,
                    description="Daily nursing visit",
                    status="completed",
                ),
                Invoice(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    patient_id=patient.id,
                    invoice_number="INV-DAILY-1",
                    status=InvoiceStatus.ISSUED,
                    total_amount=Decimal("100"),
                    balance_amount=Decimal("100"),
                ),
                Invoice(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    patient_id=patient.id,
                    invoice_number="INV-DAILY-2",
                    status=InvoiceStatus.PAID,
                    total_amount=Decimal("100"),
                    paid_amount=Decimal("100"),
                    balance_amount=Decimal("0"),
                ),
            ]
        )
        session.commit()

        assert (
            queue_due_whatsapp_admin_daily_reports(
                session,
                now=datetime(2026, 8, 26, 16, 29, tzinfo=timezone.utc),
            )
            == 0
        )
        send_time = datetime(2026, 8, 26, 16, 30, tzinfo=timezone.utc)
        assert queue_due_whatsapp_admin_daily_reports(session, now=send_time) == 1
        assert queue_due_whatsapp_admin_daily_reports(session, now=send_time) == 0

        event = session.exec(
            select(NotificationEvent).where(
                NotificationEvent.template_key == "admin_daily_report"
            )
        ).one()
        snapshot = json.loads(event.message)
        assert snapshot == {
            "recipient_name": "Clinic Admin",
            "report_date": "26 August 2026",
            "appointments_completed": "1",
            "appointments_not_completed": "1",
            "lab_bookings_completed": "1",
            "lab_bookings_not_completed": "1",
            "homecare_completed": "1",
            "homecare_not_completed": "1",
            "pending_invoices": "1",
        }
        assert whatsapp_queue_service._display_context(session, event) == (
            "Clinic Admin",
            "26 August 2026",
        )

        assert (
            whatsapp_processor.process_due_whatsapp_notifications(
                session, limit=5, gateway=FakeGateway()
            )
            == 1
        )
        assert sent["campaign_name"] == "hms_admin_daily_report"
        assert sent["recipient_name"] == "Clinic Admin"
        assert sent["destination"] == "+919876543210"
        assert sent["template_parameters"] == [
            "26 August 2026",
            "1",
            "1",
            "1",
            "1",
            "1",
            "1",
            "1",
        ]
