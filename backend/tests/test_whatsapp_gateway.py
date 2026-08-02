import json

import pytest

from app.infrastructure.integrations.adapters.messaging import http_template
from app.infrastructure.integrations.adapters.messaging.http_template import (
    HttpTemplateMessageGateway,
    normalize_mobile_number,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("98765 43210", "+919876543210"),
        ("91-98765-43210", "+919876543210"),
        ("+44 7700 900123", "+447700900123"),
        ("0044 7700 900123", "+447700900123"),
    ],
)
def test_normalizes_mobile_numbers(value, expected):
    assert normalize_mobile_number(value, "+91") == expected


def test_rejects_invalid_mobile_number():
    with pytest.raises(ValueError, match="valid mobile number"):
        normalize_mobile_number("123", "+91")


def test_gateway_sends_expected_template_payload(monkeypatch):
    captured = {}

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, _limit):
            return b'{"messageId":"message-123"}'

    class FakeOpener:
        def open(self, request, timeout):
            captured["url"] = request.full_url
            captured["payload"] = json.loads(request.data)
            captured["timeout"] = timeout
            return FakeResponse()

    monkeypatch.setattr(http_template, "build_opener", lambda *_args: FakeOpener())
    monkeypatch.setattr(http_template, "validate_public_https_url", lambda _value: None)

    result = HttpTemplateMessageGateway().send_template(
        api_url="https://gateway.example.com/messages",
        api_key="secret-key",
        campaign_name="doctor_appointment_confirmation",
        destination="+919876543210",
        recipient_name="Test Patient",
        template_parameters=["Test Patient", "25 July 2026", "10:30 AM"],
        timeout_seconds=15,
    )

    assert result.success is True
    assert result.external_message_id == "message-123"
    assert captured["payload"] == {
        "apiKey": "secret-key",
        "campaignName": "doctor_appointment_confirmation",
        "destination": "+919876543210",
        "userName": "Test Patient",
        "source": "MedizinHub HMS",
        "templateParams": ["Test Patient", "25 July 2026", "10:30 AM"],
    }
