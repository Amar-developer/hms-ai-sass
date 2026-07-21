from __future__ import annotations

import os
from collections.abc import Generator
from urllib.parse import urlsplit

import httpx
import pytest

from helpers import AuthContext, assert_status, login


@pytest.fixture(scope="session")
def api_base_url() -> str:
    value = os.environ.get(
        "MEDIZINHUB_E2E_BASE_URL", "http://127.0.0.1:8090/api/v1"
    ).rstrip("/")
    assert urlsplit(value).scheme in {"http", "https"}
    return value


@pytest.fixture(scope="session")
def server_base_url(api_base_url: str) -> str:
    parsed = urlsplit(api_base_url)
    return f"{parsed.scheme}://{parsed.netloc}"


@pytest.fixture(scope="session")
def api_client(api_base_url: str) -> Generator[httpx.Client, None, None]:
    with httpx.Client(base_url=api_base_url, timeout=30.0) as client:
        yield client


@pytest.fixture(scope="session")
def super_admin(api_client: httpx.Client) -> AuthContext:
    email = os.environ.get(
        "MEDIZINHUB_E2E_SUPER_ADMIN_EMAIL",
        "super.admin@e2e.medizinhub.local",
    )
    password = os.environ.get(
        "MEDIZINHUB_E2E_SUPER_ADMIN_PASSWORD", "SuperAdminE2EPass123"
    )
    response = assert_status(
        api_client.post(
            "/auth/bootstrap-super-admin",
            json={
                "name": "E2E Platform Super Admin",
                "email": email,
                "password": password,
            },
        ),
        201,
    )
    assert response.json()["is_super_admin"] is True
    authenticated = login(api_client, email=email, password=password)
    me = assert_status(
        api_client.get("/auth/me", headers=authenticated.headers()), 200
    ).json()
    assert me["is_super_admin"] is True
    assert me["permissions"] == ["*"]
    return authenticated
