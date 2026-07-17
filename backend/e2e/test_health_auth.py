import httpx
import pytest

from helpers import AuthContext, assert_status, login


pytestmark = pytest.mark.e2e


def test_health_and_authenticated_session_lifecycle(
    api_client: httpx.Client,
    server_base_url: str,
    super_admin: AuthContext,
) -> None:
    health = assert_status(
        httpx.get(f"{server_base_url}/health", timeout=10.0), 200
    ).json()
    assert health["status"] == "ok"

    second_session = login(
        api_client,
        email=super_admin.email,
        password=super_admin.password,
    )
    assert_status(api_client.get("/auth/me", headers=second_session.headers()), 200)
    logout = assert_status(
        api_client.post("/auth/logout", headers=second_session.headers()), 200
    )
    assert logout.json() == {"logged_out": True}
    assert_status(
        api_client.get("/auth/me", headers=second_session.headers()),
        401,
    )

    # Revoking one login session must not revoke a separate active session.
    assert_status(api_client.get("/auth/me", headers=super_admin.headers()), 200)
