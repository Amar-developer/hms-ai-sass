import pytest

from scripts import reset_super_admin


def test_reset_super_admin_requires_password_in_production(monkeypatch):
    monkeypatch.setenv("MEDIZINHUB_ENVIRONMENT", "production")
    monkeypatch.delenv("MEDIZINHUB_SUPER_ADMIN_PASSWORD", raising=False)

    with pytest.raises(RuntimeError, match="SUPER_ADMIN_PASSWORD is required"):
        reset_super_admin._super_admin_password()


def test_reset_super_admin_requires_extra_production_confirmation(monkeypatch):
    monkeypatch.setenv("MEDIZINHUB_ENVIRONMENT", "production")
    monkeypatch.delenv("MEDIZINHUB_SUPER_ADMIN_CONFIRM", raising=False)

    with pytest.raises(SystemExit, match="Refusing to reset production super admin"):
        reset_super_admin._assert_reset_allowed()


def test_reset_super_admin_local_defaults_are_development_only(monkeypatch):
    monkeypatch.setenv("MEDIZINHUB_ENVIRONMENT", "local")
    monkeypatch.delenv("MEDIZINHUB_SUPER_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("MEDIZINHUB_SUPER_ADMIN_PASSWORD", raising=False)

    assert reset_super_admin._super_admin_email() == "admin@medizinhub.local"
    assert reset_super_admin._super_admin_password() == "ChangeMe@123"
