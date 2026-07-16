from sqlmodel import Session, select

from app.modules.error_logs.models import ErrorLog
from app.modules.tenants.models import Tenant, TenantStatus


def _tenant(test_engine) -> Tenant:
    with Session(test_engine) as session:
        tenant = Tenant(
            name="Error Log Clinic",
            status=TenantStatus.ACTIVE,
            tenant_type="clinic",
        )
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        return tenant


def test_client_error_logs_are_sanitized_deduplicated_and_manageable(
    client, test_engine
):
    tenant = _tenant(test_engine)
    client.headers.update({"X-Tenant-ID": tenant.id})
    payload = {
        "level": "error",
        "event": "frontend.test_error",
        "message": "password=secret user@example.com",
        "module": "tests",
        "route": "/patients",
        "request_id": "request_test_1",
        "stack": "Error: token=abc123",
    }

    first = client.post("/api/v1/error-logs/client", json=payload)
    second = client.post("/api/v1/error-logs/client", json=payload)

    assert first.status_code == 202
    assert second.status_code == 202
    assert first.json()["id"] == second.json()["id"]

    response = client.get("/api/v1/error-logs")
    assert response.status_code == 200
    rows = response.json()["items"]
    row = next(item for item in rows if item["event"] == "frontend.test_error")
    assert row["occurrence_count"] == 2
    assert "secret" not in row["message"]
    assert "user@example.com" not in row["message"]
    assert "abc123" not in (row["stack_trace"] or "")

    resolved = client.patch(
        f"/api/v1/error-logs/{row['id']}",
        json={"resolved": True, "resolution_note": "Fixed in test"},
    )
    assert resolved.status_code == 200
    assert resolved.json()["is_resolved"] is True

    visible_after_resolve = client.get("/api/v1/error-logs")
    assert visible_after_resolve.status_code == 200
    assert any(
        item["id"] == row["id"] and item["is_resolved"] is True
        for item in visible_after_resolve.json()["items"]
    )

    deleted = client.delete(f"/api/v1/error-logs/{row['id']}")
    assert deleted.status_code == 204


def test_backend_request_failures_are_persisted(client, test_engine):
    tenant = _tenant(test_engine)
    client.headers.update({"X-Tenant-ID": tenant.id})

    missing = client.get("/api/v1/route-that-does-not-exist")
    assert missing.status_code == 404

    response = client.get("/api/v1/error-logs?category=not_found")
    assert response.status_code == 200
    rows = response.json()["items"]
    assert any(
        row["source"] == "backend_api"
        and row["status_code"] == 404
        and row["route"] == "/api/v1/route-that-does-not-exist"
        for row in rows
    )

    with Session(test_engine) as session:
        assert session.exec(select(ErrorLog)).first() is not None
