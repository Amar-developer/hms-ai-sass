import asyncio

import pytest
from pydantic import ValidationError

from app.api.v1.client_logs import ClientLogCreate
from app.core.middleware import ObservabilityMiddleware


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
