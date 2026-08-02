import asyncio
import json
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
from app.modules.notifications.services.operational_metrics import read_queue_metrics
from scripts.summarize_api_metrics import parse_lines


async def _request(headers: list[tuple[bytes, bytes]]) -> list[dict]:
    messages: list[dict] = []

    async def app(_scope, _receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/health",
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


def test_operational_queue_metrics_report_empty_queue(test_engine):
    with Session(test_engine) as session:
        metrics = read_queue_metrics(session)

    assert metrics["notification_events"]["depth"] == 0
    assert metrics["document_deliveries"]["oldest_age_seconds"] is None
    assert metrics["report_jobs"]["depth"] == 0
