from types import SimpleNamespace

import pytest

from scripts import reset_super_admin


def test_reset_super_admin_requires_password_non_interactively(monkeypatch):
    monkeypatch.setenv("MEDIZINHUB_ENVIRONMENT", "production")
    monkeypatch.setenv("MEDIZINHUB_SUPER_ADMIN_EMAIL", "admin@example.com")
    monkeypatch.delenv("MEDIZINHUB_SUPER_ADMIN_PASSWORD", raising=False)
    monkeypatch.setattr(
        reset_super_admin.sys,
        "stdin",
        SimpleNamespace(isatty=lambda: False),
    )

    with pytest.raises(SystemExit, match="Super admin password is required"):
        reset_super_admin.resolve_super_admin_credentials()


def test_reset_super_admin_requires_extra_production_confirmation(monkeypatch):
    monkeypatch.setenv("MEDIZINHUB_ENVIRONMENT", "production")
    monkeypatch.delenv("MEDIZINHUB_SUPER_ADMIN_CONFIRM", raising=False)

    with pytest.raises(SystemExit, match="Refusing to reset production super admin"):
        reset_super_admin._assert_reset_allowed()


def test_reset_super_admin_has_no_hardcoded_local_credentials(monkeypatch):
    monkeypatch.setenv("MEDIZINHUB_ENVIRONMENT", "local")
    monkeypatch.delenv("MEDIZINHUB_SUPER_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("MEDIZINHUB_SUPER_ADMIN_PASSWORD", raising=False)
    monkeypatch.setattr(
        reset_super_admin.sys,
        "stdin",
        SimpleNamespace(isatty=lambda: False),
    )

    with pytest.raises(SystemExit, match="Super admin email is required"):
        reset_super_admin.resolve_super_admin_credentials()


def test_reset_super_admin_resolves_explicit_credentials(monkeypatch):
    monkeypatch.delenv("MEDIZINHUB_SUPER_ADMIN_NAME", raising=False)
    monkeypatch.setenv("MEDIZINHUB_SUPER_ADMIN_EMAIL", " Admin@Example.COM ")
    monkeypatch.setenv("MEDIZINHUB_SUPER_ADMIN_PASSWORD", "strong-password")

    credentials = reset_super_admin.resolve_super_admin_credentials()

    assert credentials.name == "Platform Super Admin"
    assert credentials.email == "admin@example.com"
    assert credentials.password == "strong-password"
