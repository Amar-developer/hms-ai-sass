import asyncio
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core import uploads


class AsyncUpload:
    def __init__(self, payload: bytes):
        self.stream = BytesIO(payload)

    async def read(self, size: int = -1) -> bytes:
        return self.stream.read(size)


def test_upload_intake_limit_is_configurable(monkeypatch):
    monkeypatch.setattr(
        uploads, "get_settings", lambda: SimpleNamespace(max_upload_size_mb=1)
    )

    with pytest.raises(HTTPException) as oversized:
        asyncio.run(uploads._read_bounded(AsyncUpload(b"x" * (1024 * 1024 + 1))))

    assert oversized.value.status_code == 413
    assert oversized.value.detail == "File too large (maximum intake size is 1 MB)"


def test_upload_at_intake_limit_is_accepted(monkeypatch):
    monkeypatch.setattr(
        uploads, "get_settings", lambda: SimpleNamespace(max_upload_size_mb=1)
    )
    payload = b"x" * (1024 * 1024)

    assert asyncio.run(uploads._read_bounded(AsyncUpload(payload))) == payload
