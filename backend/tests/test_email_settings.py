"""Per-tenant email (SMTP) settings."""

from unittest.mock import patch

from sqlmodel import Session

from app.core.config import Settings
from app.infrastructure.integrations.adapters.email.smtp import SmtpEmailAdapter
from app.infrastructure.integrations.ports.email import EmailMessageRequest
from app.modules.identity.models import User
from app.modules.integrations.email.schemas import (
    EmailSettingsUpdate,
    EmailTestRequest,
)
from app.modules.integrations.email.service import (
    get_email_runtime_settings,
    get_email_settings,
    update_email_settings,
)
from app.modules.integrations.email.test_send import send_email_test
from app.modules.tenants.models import Tenant


def _tenant_with_admin(session: Session, name: str, admin_email: str) -> Tenant:
    tenant = Tenant(name=name)
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    session.add(
        User(
            tenant_id=tenant.id,
            name="Tenant Admin",
            email=admin_email,
            password_hash="test",
            user_type="tenant_admin",
        )
    )
    session.commit()
    return tenant


def test_an_unconfigured_tenant_falls_back_to_the_deployment_smtp(test_engine):
    """An install that only sets SMTP in the environment keeps working."""
    with Session(test_engine) as session:
        tenant = _tenant_with_admin(session, "Fallback Clinic", "admin@fallback.test")

        runtime = get_email_runtime_settings(session, tenant_id=tenant.id)

        assert runtime.uses_platform_smtp is True
        # Sender still defaults to the tenant's admin, which is what makes
        # per-tenant sending work without a per-tenant server.
        assert runtime.from_email == "admin@fallback.test"
        assert runtime.from_name == "Fallback Clinic"


def test_a_tenant_smtp_server_overrides_the_deployment_settings(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant_with_admin(session, "Own Server Clinic", "admin@own.test")
        actor = session.exec(
            User.__table__.select().where(User.tenant_id == tenant.id)
        ).first()
        actor = session.get(User, actor.id)

        saved = update_email_settings(
            session,
            tenant_id=tenant.id,
            payload=EmailSettingsUpdate(
                enabled=True,
                smtp_host="smtp.own.test",
                smtp_port=2525,
                smtp_username="own-user",
                smtp_password="own-secret-9876",
                smtp_use_tls=False,
                sender_mode="custom",
                from_email="reports@own.test",
                from_name="Own Clinic Reports",
            ),
            actor=actor,
        )
        runtime = get_email_runtime_settings(session, tenant_id=tenant.id)

        assert saved.has_password is True
        assert saved.password_last_four == "9876"
        assert saved.effective_from_email == "reports@own.test"
        assert saved.uses_platform_smtp is False
        assert runtime.host == "smtp.own.test"
        assert runtime.port == 2525
        assert runtime.password == "own-secret-9876"
        assert runtime.use_tls is False


def test_the_password_is_never_read_back_and_is_kept_when_omitted(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant_with_admin(session, "Secret Clinic", "admin@secret.test")
        actor = session.get(
            User,
            session.exec(User.__table__.select().where(User.tenant_id == tenant.id))
            .first()
            .id,
        )
        update_email_settings(
            session,
            tenant_id=tenant.id,
            payload=EmailSettingsUpdate(
                enabled=True,
                smtp_host="smtp.secret.test",
                smtp_username="user",
                smtp_password="original-secret",
            ),
            actor=actor,
        )

        # A later save that changes only the display name must keep the password.
        saved = update_email_settings(
            session,
            tenant_id=tenant.id,
            payload=EmailSettingsUpdate.model_validate({"from_name": "Renamed"}),
            actor=actor,
        )
        runtime = get_email_runtime_settings(session, tenant_id=tenant.id)

        assert "original-secret" not in saved.model_dump_json()
        assert runtime.password == "original-secret"
        assert runtime.host == "smtp.secret.test"
        assert get_email_settings(session, tenant_id=tenant.id).from_name == "Renamed"


def test_sender_mode_tenant_admin_follows_the_current_admin(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant_with_admin(session, "Admin Sender Clinic", "first@admin.test")

        assert (
            get_email_runtime_settings(session, tenant_id=tenant.id).from_email
            == "first@admin.test"
        )


def test_enabling_without_a_host_is_rejected():
    try:
        EmailSettingsUpdate(enabled=True, smtp_host="")
        raise AssertionError("Enabling email without an SMTP host must fail")
    except Exception as exc:
        assert "SMTP host is required" in str(exc)


def test_a_custom_sender_needs_an_address():
    try:
        EmailSettingsUpdate(
            enabled=True, smtp_host="smtp.test", sender_mode="custom", from_email=""
        )
        raise AssertionError("A custom sender with no address must fail")
    except Exception as exc:
        assert "sender address is required" in str(exc)


def test_test_send_uses_the_tenant_smtp_server_and_sender(test_engine):
    captured = {}

    class FakeSmtp:
        def __init__(self, host, port, timeout=None):
            captured["host"] = host
            captured["port"] = port

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def starttls(self):
            captured["tls"] = True

        def login(self, username, password):
            captured["login"] = (username, password)

        def send_message(self, message):
            captured["from"] = message["From"]
            captured["to"] = message["To"]

    with Session(test_engine) as session:
        tenant = _tenant_with_admin(session, "Test Send Clinic", "admin@send.test")
        actor = session.get(
            User,
            session.exec(User.__table__.select().where(User.tenant_id == tenant.id))
            .first()
            .id,
        )
        update_email_settings(
            session,
            tenant_id=tenant.id,
            payload=EmailSettingsUpdate(
                enabled=True,
                smtp_host="smtp.send.test",
                smtp_port=2587,
                smtp_username="send-user",
                smtp_password="send-secret",
            ),
            actor=actor,
        )

        with patch("smtplib.SMTP", FakeSmtp):
            result = send_email_test(
                session,
                tenant_id=tenant.id,
                payload=EmailTestRequest(recipient="owner@clinic.test"),
                actor=actor,
                sender=SmtpEmailAdapter(Settings(smtp_host="platform.test")),
            )

        assert result.success is True
        assert captured["host"] == "smtp.send.test"
        assert captured["port"] == 2587
        assert captured["login"] == ("send-user", "send-secret")
        assert captured["from"] == "Test Send Clinic <admin@send.test>"
        assert captured["to"] == "owner@clinic.test"


def test_test_send_reports_a_provider_rejection_instead_of_raising(test_engine):
    class FailingSender:
        def send_message(self, _request):
            raise RuntimeError("535 Authentication credentials invalid")

    with Session(test_engine) as session:
        tenant = _tenant_with_admin(session, "Reject Clinic", "admin@reject.test")
        actor = session.get(
            User,
            session.exec(User.__table__.select().where(User.tenant_id == tenant.id))
            .first()
            .id,
        )
        update_email_settings(
            session,
            tenant_id=tenant.id,
            payload=EmailSettingsUpdate(
                enabled=True,
                smtp_host="smtp.reject.test",
                smtp_username="u",
                smtp_password="p",
            ),
            actor=actor,
        )

        result = send_email_test(
            session,
            tenant_id=tenant.id,
            payload=EmailTestRequest(recipient="owner@clinic.test"),
            actor=actor,
            sender=FailingSender(),
        )

        assert result.success is False
        assert "535" in result.message


def test_a_tenant_message_falls_back_to_platform_smtp_when_it_has_no_server():
    """smtp_host unset on the request means the deployment server is used."""
    captured = {}

    class FakeSmtp:
        def __init__(self, host, port, timeout=None):
            captured["host"] = host

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def starttls(self):
            pass

        def login(self, *_args):
            pass

        def send_message(self, message):
            captured["from"] = message["From"]

    adapter = SmtpEmailAdapter(
        Settings(smtp_host="platform.test", smtp_from_email="reports@platform.test")
    )
    with patch("smtplib.SMTP", FakeSmtp):
        adapter.send_message(
            EmailMessageRequest(
                recipients=["owner@clinic.test"],
                subject="x",
                body="x",
                from_email="admin@clinic.test",
                from_name="Clinic",
            )
        )

    assert captured["host"] == "platform.test"
    assert captured["from"] == "Clinic <admin@clinic.test>"


def test_port_465_uses_implicit_tls_instead_of_starttls():
    """Port 465 is encrypted from the first byte. Speaking plain SMTP to it
    makes the server hang up with 'Connection unexpectedly closed'."""
    used = {}

    class FakeSmtpSsl:
        def __init__(self, host, port, timeout=None):
            used["class"] = "SMTP_SSL"

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def login(self, *_args):
            pass

        def send_message(self, _message):
            pass

    class FakeSmtp(FakeSmtpSsl):
        def __init__(self, host, port, timeout=None):
            used["class"] = "SMTP"

        def starttls(self):
            used["starttls"] = True

    def _request(port: int) -> EmailMessageRequest:
        return EmailMessageRequest(
            recipients=["owner@clinic.test"],
            subject="x",
            body="x",
            smtp_host="mail.test",
            smtp_port=port,
            smtp_username="u",
            smtp_password="p",
            smtp_use_tls=True,
        )

    adapter = SmtpEmailAdapter(Settings(smtp_host="platform.test"))
    with patch("smtplib.SMTP_SSL", FakeSmtpSsl), patch("smtplib.SMTP", FakeSmtp):
        adapter.send_message(_request(465))
        assert used["class"] == "SMTP_SSL"
        assert "starttls" not in used

        used.clear()
        adapter.send_message(_request(587))
        assert used["class"] == "SMTP"
        assert used["starttls"] is True


def test_a_closed_connection_is_explained_as_a_tls_port_mismatch(test_engine):
    class ClosingSender:
        def send_message(self, _request):
            raise Exception("Connection unexpectedly closed")

    with Session(test_engine) as session:
        tenant = _tenant_with_admin(session, "TLS Clinic", "admin@tls.test")
        actor = session.get(
            User,
            session.exec(User.__table__.select().where(User.tenant_id == tenant.id))
            .first()
            .id,
        )
        update_email_settings(
            session,
            tenant_id=tenant.id,
            payload=EmailSettingsUpdate(
                enabled=True,
                smtp_host="smtp.tls.test",
                smtp_port=587,
                smtp_username="u",
                smtp_password="p",
            ),
            actor=actor,
        )

        result = send_email_test(
            session,
            tenant_id=tenant.id,
            payload=EmailTestRequest(recipient="owner@clinic.test"),
            actor=actor,
            sender=ClosingSender(),
        )

        assert result.success is False
        assert "465" in result.message and "587" in result.message


def test_an_authentication_failure_names_app_specific_passwords(test_engine):
    class RejectingSender:
        def send_message(self, _request):
            raise Exception("(535, b'5.7.8 Username and Password not accepted')")

    with Session(test_engine) as session:
        tenant = _tenant_with_admin(session, "Auth Clinic", "admin@auth.test")
        actor = session.get(
            User,
            session.exec(User.__table__.select().where(User.tenant_id == tenant.id))
            .first()
            .id,
        )
        update_email_settings(
            session,
            tenant_id=tenant.id,
            payload=EmailSettingsUpdate(
                enabled=True,
                smtp_host="smtp.auth.test",
                smtp_username="u",
                smtp_password="p",
            ),
            actor=actor,
        )

        result = send_email_test(
            session,
            tenant_id=tenant.id,
            payload=EmailTestRequest(recipient="owner@clinic.test"),
            actor=actor,
            sender=RejectingSender(),
        )

        assert result.success is False
        assert "app-specific password" in result.message
