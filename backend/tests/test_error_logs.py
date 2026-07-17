from datetime import timedelta

from sqlmodel import Session, select

from app.modules.error_logs.models import ErrorLog
from app.modules.error_logs.service import (
    ERROR_LOG_RETENTION_DAYS,
    purge_expired_error_logs,
    record_error_log,
)
from app.modules.tenants.models import Tenant, TenantStatus, now_utc


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


def test_unauthenticated_401_failures_are_not_persisted(
    unauthenticated_client, test_engine
):
    tenant = _tenant(test_engine)

    response = unauthenticated_client.post(
        "/api/v1/tenants",
        json={"name": "Should Not Log"},
        headers={"X-Tenant-ID": tenant.id},
    )
    assert response.status_code == 401

    with Session(test_engine) as session:
        assert session.exec(select(ErrorLog)).first() is None


def test_summary_counts_reflect_all_matching_rows_not_just_current_page(
    client, test_engine
):
    tenant = _tenant(test_engine)
    client.headers.update({"X-Tenant-ID": tenant.id})

    for index in range(3):
        client.post(
            "/api/v1/error-logs/client",
            json={
                "level": "error",
                "event": f"frontend.test_error_{index}",
                "message": f"boom {index}",
            },
        )
    client.post(
        "/api/v1/error-logs/client",
        json={
            "level": "warning",
            "event": "frontend.test_warning",
            "message": "careful",
        },
    )

    response = client.get("/api/v1/error-logs?limit=1&offset=0")
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 1
    assert body["total"] == 4
    assert body["summary"]["errors"] == 3
    assert body["summary"]["warnings"] == 1


def test_purge_expired_error_logs_removes_only_stale_rows(test_engine):
    tenant = _tenant(test_engine)

    with Session(test_engine) as session:
        stale = record_error_log(
            session,
            tenant_id=tenant.id,
            source="backend_api",
            level="error",
            category="api",
            event="request.failed",
            message="stale error",
            status_code=500,
        )
        fresh = record_error_log(
            session,
            tenant_id=tenant.id,
            source="backend_api",
            level="error",
            category="api",
            event="request.failed",
            message="fresh error",
            status_code=500,
        )
        stale.last_seen_at = now_utc() - timedelta(days=ERROR_LOG_RETENTION_DAYS + 1)
        session.add(stale)
        session.commit()
        stale_id, fresh_id = stale.id, fresh.id

    with Session(test_engine) as session:
        deleted = purge_expired_error_logs(session)
        assert deleted == 1

    with Session(test_engine) as session:
        remaining_ids = {row.id for row in session.exec(select(ErrorLog)).all()}
        assert stale_id not in remaining_ids
        assert fresh_id in remaining_ids
