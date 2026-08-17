import asyncio
import json
from contextlib import nullcontext
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError
from sqlmodel import Session

from app.api.v1.client_logs import ClientLogCreate
from app.core.middleware import ObservabilityMiddleware
from app.core.runtime_metrics import (
    record_database_query,
    record_pool_checkout_wait,
    reset_for_tests,
    snapshot,
)
from app.main import database_pool_timeout_handler
from app.modules.notifications.services.operational_metrics import (
    read_queue_metrics,
    read_worker_metrics,
)
from scripts.load_test_api import (
    RequestResult,
    percentile,
    summarize,
    validate_target,
)
from scripts.verify_deployment import contract_issues, validate_origin
from scripts.start_api import migration_lock, run_deployment_gate, uvicorn_command
from scripts.summarize_api_metrics import parse_lines


PARAM_ROUTE = "/api/v1/patients/{patient_id}"


async def _request(
    headers: list[tuple[bytes, bytes]],
    *,
    path: str = "/health",
    route_path: str | None = "/health",
) -> list[dict]:
    """Drive ObservabilityMiddleware over one request.

    ``route_path`` mirrors what Starlette's router does: on a match it stores
    the resolved route in the shared scope, which the outer middleware reads
    after the inner app returns. Passing None models a request that matched no
    route, which is what a 404 looks like from here.
    """
    messages: list[dict] = []

    async def app(scope, _receive, send):
        if route_path is not None:
            scope["route"] = SimpleNamespace(path=route_path)
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": headers,
        "state": {},
    }
    await ObservabilityMiddleware(app)(scope, receive, send)
    return messages


def _response_request_id(messages: list[dict]) -> str:
    response_start = next(
        message for message in messages if message["type"] == "http.response.start"
    )
    headers = dict(response_start["headers"])
    return headers[b"x-request-id"].decode()


def test_request_id_is_returned_and_client_value_is_preserved():
    generated = asyncio.run(_request([]))
    supplied = asyncio.run(_request([(b"x-request-id", b"support-case-42")]))

    assert _response_request_id(generated)
    assert _response_request_id(supplied) == "support-case-42"


def test_invalid_request_id_is_replaced():
    messages = asyncio.run(_request([(b"x-request-id", b"bad id/value")]))

    assert _response_request_id(messages) != "bad id/value"


def test_client_log_schema_accepts_only_actionable_warning_and_error_logs():
    accepted = ClientLogCreate(
        level="error",
        event="frontend.react_error_boundary",
        message="Screen failed",
        module="billing",
    )
    assert accepted.level == "error"

    with pytest.raises(ValidationError):
        ClientLogCreate(level="debug", event="frontend.debug", message="noise")


def test_slow_success_does_not_persist_another_database_log(monkeypatch):
    persisted = []
    monkeypatch.setattr(
        "app.core.middleware._persist_request_issue",
        lambda *_args, **kwargs: persisted.append(kwargs),
    )
    middleware = ObservabilityMiddleware(
        lambda _scope, _receive, send: _successful_response(send)
    )
    middleware.slow_request_ms = 0

    asyncio.run(middleware(_scope(), _receive, lambda _message: asyncio.sleep(0)))

    assert persisted == []


async def _successful_response(send):
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok"})


def _scope():
    return {
        "type": "http",
        "method": "GET",
        "path": "/slow",
        "headers": [],
        "state": {},
    }


async def _receive():
    return {"type": "http.request", "body": b"", "more_body": False}


def test_pool_timeout_returns_fast_retryable_service_unavailable():
    reset_for_tests()
    request = SimpleNamespace(state=SimpleNamespace(request_id="request-503"))
    response = asyncio.run(
        database_pool_timeout_handler(
            request,
            SQLAlchemyTimeoutError("pool exhausted"),
        )
    )

    assert response.status_code == 503
    assert response.headers["retry-after"] == "3"
    assert json.loads(response.body)["detail"].startswith(
        "The service is temporarily busy"
    )
    assert snapshot()["database_pool_timeouts"] == 1


def test_runtime_metrics_report_request_and_database_percentiles():
    reset_for_tests()
    asyncio.run(_request([]))
    record_database_query(operation="select", duration_ms=12.5)
    record_database_query(operation="select", duration_ms=25.0)
    record_pool_checkout_wait(4.5)

    metrics = snapshot()

    assert metrics["requests"]["GET /health"]["p95_ms"] is not None
    assert metrics["database_queries"]["SELECT"]["p50_ms"] == 12.5
    assert metrics["database_queries"]["SELECT"]["p99_ms"] == 25.0
    assert metrics["database_pool_checkout_wait"]["p95_ms"] == 4.5


def test_requests_are_keyed_by_route_template_not_by_url():
    """Metric keys must stay bounded by the routing table.

    Keying on the raw path let every distinct URL allocate a permanent entry:
    the metric dictionaries prune old samples but never drop keys, so a
    scanner walking unmatched URLs, or a path parameter reaching the fallback,
    would grow the process without limit.
    """
    reset_for_tests()

    asyncio.run(_request([], path="/api/v1/patients/pat-1", route_path=PARAM_ROUTE))
    asyncio.run(_request([], path="/api/v1/patients/pat-2", route_path=PARAM_ROUTE))
    for index in range(25):
        asyncio.run(_request([], path=f"/nope-{index}", route_path=None))

    requests = snapshot()["requests"]

    # Two distinct patient URLs collapse onto the one route template.
    assert requests[f"GET {PARAM_ROUTE}"]["total"] == 2
    # Twenty-five distinct unmatched URLs collapse onto a single key.
    assert requests["GET UNMATCHED"]["total"] == 25
    assert set(requests) == {f"GET {PARAM_ROUTE}", "GET UNMATCHED"}


def test_combined_log_summary_calculates_deployment_percentiles():
    lines = [
        json.dumps(
            {
                "logger": "medizinhub.request",
                "event": "request.completed",
                "method": "GET",
                "path": "/api/v1/practitioners",
                "status": 200,
                "duration_ms": duration,
            }
        )
        for duration in [10, 20, 30, 40, 100]
    ]

    result = parse_lines(lines)["GET /api/v1/practitioners"]

    assert result["p50_ms"] == 30
    assert result["p95_ms"] == 100
    assert result["p99_ms"] == 100


def test_load_gate_is_bounded_and_summarizes_failures():
    assert (
        validate_target("http://127.0.0.1:8080", ["/api/v1/health"], allow_remote=False)
        == "http://127.0.0.1:8080/"
    )
    with pytest.raises(ValueError, match="--allow-remote"):
        validate_target(
            "https://clinic.example.test",
            ["/api/v1/health"],
            allow_remote=False,
        )
    with pytest.raises(ValueError, match="query data"):
        validate_target(
            "http://127.0.0.1:8080",
            ["/api/v1/patients?name=patient"],
            allow_remote=False,
        )

    summary = summarize(
        [
            RequestResult("/health", 200, 10),
            RequestResult("/health", 200, 20),
            RequestResult("/health", 503, 30, "http_error"),
        ]
    )
    assert percentile([10, 20, 30], 0.95) == 30
    assert summary["failures"] == 1
    assert summary["error_rate"] == 0.3333


def test_api_startup_capacity_arguments_and_non_postgres_lock(monkeypatch):
    monkeypatch.setenv("MEDIZINHUB_WEB_CONCURRENCY", "4")
    monkeypatch.setenv("MEDIZINHUB_WEB_LIMIT_CONCURRENCY", "60")
    monkeypatch.setenv("MEDIZINHUB_WEB_BACKLOG", "1024")
    monkeypatch.setenv("MEDIZINHUB_WEB_TIMEOUT_KEEP_ALIVE", "4")
    monkeypatch.setenv("MEDIZINHUB_WEB_GRACEFUL_SHUTDOWN_SECONDS", "45")
    command = uvicorn_command()

    assert command[command.index("--workers") + 1] == "4"
    assert command[command.index("--limit-concurrency") + 1] == "60"
    assert command[command.index("--timeout-graceful-shutdown") + 1] == "45"
    with migration_lock("sqlite://"):
        pass


def test_api_deployment_gate_validates_environment_before_migrations(monkeypatch):
    commands = []
    monkeypatch.setattr(
        "scripts.start_api.migration_lock", lambda _database_url: nullcontext()
    )
    monkeypatch.setattr(
        "scripts.start_api.subprocess.run",
        lambda command, **kwargs: commands.append((command, kwargs)),
    )

    run_deployment_gate("postgresql+psycopg://app:secret@postgres/app")

    assert commands[0][0] == ["python", "scripts/verify_production_environment.py"]
    assert commands[1][0][-2:] == ["upgrade", "head"]
    assert commands[2][0][-1] == "--ensure-pg-stat-statements"
    assert all(call[1]["check"] is True for call in commands)


def test_deployment_verifier_requires_https_and_matching_release_metadata():
    assert validate_origin("http://127.0.0.1:8081/") == "http://127.0.0.1:8081"
    with pytest.raises(ValueError, match="requires HTTPS"):
        validate_origin("http://staging.example.com")

    health = {
        "status": "ok",
        "version": "1.0.0",
        "build_commit": "abc123def456",
        "built_at": "2026-08-03T10:00:00Z",
        "environment": "staging",
    }
    readiness = {
        "status": "ready",
        "dependencies": {"database": "configured"},
    }
    assert (
        contract_issues(
            health,
            readiness,
            expected_version="1.0.0",
            expected_commit="abc123def456",
            expected_environment="staging",
        )
        == []
    )

    readiness["status"] = "degraded"
    issues = contract_issues(
        health,
        readiness,
        expected_version="1.0.1",
        expected_commit="abc123def456",
        expected_environment="staging",
    )
    assert "API readiness status is not ready" in issues
    assert "deployed version does not match expected value" in issues


def test_operational_queue_metrics_report_empty_queue(test_engine):
    with Session(test_engine) as session:
        metrics = read_queue_metrics(session)

    assert metrics["notification_events"]["depth"] == 0
    assert metrics["document_deliveries"]["oldest_age_seconds"] is None
    assert metrics["report_jobs"]["depth"] == 0


def test_worker_metrics_are_best_effort(monkeypatch):
    monkeypatch.setattr(
        "app.modules.notifications.services.operational_metrics.read_worker_heartbeat",
        lambda: "2026-08-02T10:00:00+00:00",
    )
    assert read_worker_metrics()["status"] == "healthy"

    def unavailable():
        raise ConnectionError("Redis unavailable")

    monkeypatch.setattr(
        "app.modules.notifications.services.operational_metrics.read_worker_heartbeat",
        unavailable,
    )
    assert read_worker_metrics() == {
        "status": "unavailable",
        "last_heartbeat_at": None,
    }


def test_api_security_headers_and_auth_cache_policy(unauthenticated_client):
    health = unauthenticated_client.get("/api/v1/health")
    assert health.headers["X-Content-Type-Options"] == "nosniff"
    assert health.headers["X-Frame-Options"] == "DENY"
    assert health.headers["Referrer-Policy"] == "no-referrer"
    assert health.headers["Permissions-Policy"] == (
        "camera=(), microphone=(), geolocation=()"
    )

    auth = unauthenticated_client.get("/api/v1/auth/me")
    assert auth.headers["Cache-Control"] == "no-store"
    assert auth.headers["Pragma"] == "no-cache"
