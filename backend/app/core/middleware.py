import logging
import re
import time
from typing import Callable
from uuid import uuid4

from app.core.config import get_settings
from app.core.logging import request_id_context, tenant_id_context


request_logger = logging.getLogger("medizinhub.request")
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,100}$")


class ObservabilityMiddleware:
    """Structured request logs without bodies, query strings, or credentials."""

    def __init__(self, app: Callable) -> None:
        self.app = app
        self.slow_request_ms = get_settings().slow_request_ms

    async def __call__(self, scope: dict, receive: Callable, send: Callable) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        supplied_request_id = headers.get(b"x-request-id", b"").decode(errors="ignore")
        request_id = (
            supplied_request_id
            if REQUEST_ID_PATTERN.fullmatch(supplied_request_id)
            else str(uuid4())
        )
        tenant_id = headers.get(b"x-tenant-id", b"").decode(errors="ignore")
        method = str(scope.get("method") or "")
        path = str(scope.get("path") or "")
        started = time.perf_counter()
        response_status = 500
        request_context_token = request_id_context.set(request_id)
        tenant_context_token = tenant_id_context.set(tenant_id or None)

        async def send_with_request_id(message: dict) -> None:
            nonlocal response_status
            if message["type"] == "http.response.start":
                response_status = int(message.get("status") or 500)
                raw_headers = list(message.get("headers", []))
                raw_headers.append((b"x-request-id", request_id.encode()))
                message = {**message, "headers": raw_headers}
            await send(message)

        scope.setdefault("state", {})
        if isinstance(scope["state"], dict):
            scope["state"]["request_id"] = request_id

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            request_logger.exception(
                "request.unhandled_error",
                extra={
                    "request_id": request_id,
                    "method": method,
                    "path": path,
                    "tenant_id": tenant_id or None,
                    "duration_ms": duration_ms,
                },
            )
            request_id_context.reset(request_context_token)
            tenant_id_context.reset(tenant_context_token)
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        event = (
            "request.slow"
            if duration_ms >= self.slow_request_ms
            else "request.completed"
        )
        log = (
            request_logger.warning
            if response_status >= 400 or duration_ms >= self.slow_request_ms
            else request_logger.info
        )
        log(
            event,
            extra={
                "request_id": request_id,
                "method": method,
                "path": path,
                "tenant_id": tenant_id or None,
                "status": response_status,
                "duration_ms": duration_ms,
            },
        )
        request_id_context.reset(request_context_token)
        tenant_id_context.reset(tenant_context_token)


class TenantContextMiddleware:
    """
    Pure ASGI middleware — intentionally does NOT extend BaseHTTPMiddleware.

    BaseHTTPMiddleware has a known Starlette/FastAPI bug: unhandled exceptions
    inside call_next() can bypass the outer CORSMiddleware response path,
    causing the browser to report a missing Access-Control-Allow-Origin header
    (CORS error) even when the real issue is a 500 / 404 / 405 response.

    Using the raw ASGI callable avoids the bug entirely and keeps CORS headers
    intact on every response, including error responses.
    """

    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Callable, send: Callable) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        # Extract tenant/branch from request headers
        headers = {k.lower(): v for k, v in scope.get("headers", [])}
        tenant_id = headers.get(b"x-tenant-id", b"").decode()
        branch_id = headers.get(b"x-branch-id", b"").decode()

        # Intercept the send callable to inject X-Tenant-ID into responses
        async def send_with_tenant(message: dict) -> None:
            if message["type"] == "http.response.start" and tenant_id:
                raw_headers = list(message.get("headers", []))
                raw_headers.append((b"x-tenant-id", tenant_id.encode()))
                message = {**message, "headers": raw_headers}
            await send(message)

        scope.setdefault("state", {})
        if isinstance(scope["state"], dict):
            scope["state"]["tenant_id"] = tenant_id
            scope["state"]["branch_id"] = branch_id
        else:
            # Starlette State object
            scope["state"].tenant_id = tenant_id
            scope["state"].branch_id = branch_id

        await self.app(scope, receive, send_with_tenant)
