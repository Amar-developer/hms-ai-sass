from io import BytesIO
from urllib.error import HTTPError

import pytest
from fastapi import HTTPException

from app.modules.integrations import graphql_catalog
from app.modules.integrations.graphql_catalog import (
    GraphQLCatalogClient,
    MAX_GRAPHQL_RESPONSE_BYTES,
)


class FakeResponse:
    def __init__(self, body: bytes):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, limit: int) -> bytes:
        return self.body[:limit]


def _client() -> GraphQLCatalogClient:
    return GraphQLCatalogClient(graphql_url="https://catalog.example.test/graphql")


def test_graphql_catalog_does_not_expose_provider_error_body(monkeypatch):
    sensitive_body = b'{"error":"patient name and provider secret"}'

    def fail(request, timeout):
        raise HTTPError(request.full_url, 500, "Failure", {}, BytesIO(sensitive_body))

    monkeypatch.setattr(graphql_catalog, "urlopen", fail)

    with pytest.raises(HTTPException) as raised:
        _client().get_products()

    assert raised.value.status_code == 502
    assert raised.value.detail == "Medicine GraphQL request failed"
    assert "patient name" not in raised.value.detail
    assert "provider secret" not in raised.value.detail


def test_graphql_catalog_rejects_oversized_responses(monkeypatch):
    response = FakeResponse(b"x" * (MAX_GRAPHQL_RESPONSE_BYTES + 1))
    monkeypatch.setattr(graphql_catalog, "urlopen", lambda *_args, **_kwargs: response)

    with pytest.raises(HTTPException) as raised:
        _client().get_products()

    assert raised.value.status_code == 502
    assert raised.value.detail == "Medicine GraphQL API returned an oversized response"


def test_graphql_catalog_rejects_invalid_utf8(monkeypatch):
    monkeypatch.setattr(
        graphql_catalog,
        "urlopen",
        lambda *_args, **_kwargs: FakeResponse(b"\xff\xfe"),
    )

    with pytest.raises(HTTPException) as raised:
        _client().get_products()

    assert raised.value.status_code == 502
    assert raised.value.detail == "Medicine GraphQL API returned invalid text"
