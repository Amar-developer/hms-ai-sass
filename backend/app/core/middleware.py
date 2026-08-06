import logging
import re
import time
import traceback
from contextlib import contextmanager
from http.cookies import SimpleCookie
from types import GeneratorType
from typing import Callable
from uuid import uuid4

from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.database import engine, get_session
from app.core.logging import request_id_context, tenant_id_context
from app.core.runtime_metrics import record_request
from app.modules.error_logs.service import record_error_log
from app.modules.identity.models import AuthSession, User
from app.modules.identity.security import hash_token
from app.modules.tenants.models import Branch, Tenant


request_logger = logging.getLogger("medizinhub.request")
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,100}$")


@contextmanager
def _request_session(scope: dict):
    app = scope.get("app")
    override = getattr(app, "dependency_overrides", {}).get(get_session)
    if override:
        resource = override()
        if isinstance(resource, GeneratorType):
            try:
                yield next(resource)
            finally:
                resource.close()
            return
        with resource as session:
            yield session
        return
    with Session(engine) as session:
        yield session


def _pool_has_logging_headroom() -> bool:
    """Reserve overflow connections for application traffic, not DB logging."""
    pool = engine.pool
    capacity = getattr(pool, "size", None)
    checked_out = getattr(pool, "checkedout", None)
    if not callable(capacity) or not callable(checked_out):
        return True
    return checked_out() < capacity()


def _header_token(headers: dict[bytes, bytes]) -> str | None:
    authorization = headers.get(b"authorization", b"").decode(errors="ignore")
    if authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    cookie_header = headers.get(b"cookie", b"").decode(errors="ignore")
    if not cookie_header:
        return None
    cookie = SimpleCookie()
    try:
        cookie.load(cookie_header)
    except Exception:
        return None
    return cookie.get("access_token").value if cookie.get("access_token") else None


def _request_identity(
    session: Session,
    headers: dict[bytes, bytes],
    tenant_id: str | None,
    branch_id: str | None,
) -> tuple[str | None, str | None, str | None]:
    valid_tenant_id = (
        tenant_id if tenant_id and session.get(Tenant, tenant_id) else None
    )
    branch = session.get(Branch, branch_id) if branch_id else None
    valid_branch_id = (
        branch_id if branch and branch.tenant_id == valid_tenant_id else None
    )
    token = _header_token(headers)
    if not token:
        return valid_tenant_id, valid_branch_id, None
    auth_session = session.exec(
        select(AuthSession).where(
            AuthSession.token_hash == hash_token(token),
            AuthSession.revoked_at.is_(None),
        )
    ).first()
    user = session.get(User, auth_session.user_id) if auth_session else None
    return valid_tenant_id, valid_branch_id, user.id if user else None


def _request_category(status_code: int | None, *, slow: bool = False) -> str:
    if slow:
        return "performance"
    if status_code in (401, 403):
        return "permission"
    if status_code == 404:
        return "not_found"
    if status_code == 409:
        return "conflict"
    if status_code == 422:
        return "validation"
    if status_code and status_code >= 500:
        return "api"
    return "request"


def _persist_request_issue(
    scope: dict,
    *,
    headers: dict[bytes, bytes],
    tenant_id: str | None,
    branch_id: str | None,
    request_id: str,
    method: str,
    path: str,
    status_code: int | None,
    duration_ms: float,
    stack_trace: str | None = None,
    slow: bool = False,
) -> None:
    if slow:
        # Slow requests are already emitted as structured application logs.
        # Persisting them synchronously creates another DB checkout precisely
        # when the database is slow and can turn congestion into an outage.
        return
    if stack_trace and (
        "sqlalchemy.exc.TimeoutError" in stack_trace or "QueuePool limit" in stack_trace
    ):
        return
    if not _pool_has_logging_headroom():
        # The DB pool is already the problem for this request. Opening a
        # second session here to persist an ErrorLog row would just queue
        # for another connection and time out too, turning one saturation
        # event into a cascade of identical failures in the logs. Skip the
        # DB write entirely — the stdout log below is enough to see it.
        request_logger.warning(
            "error_log.persistence_skipped_pool_saturated",
            extra={"request_id": request_id, "path": path},
        )
        return
    try:
        with _request_session(scope) as session:
            valid_tenant_id, valid_branch_id, user_id = _request_identity(
                session, headers, tenant_id, branch_id
            )
            level = (
                "error"
                if stack_trace or (status_code is not None and status_code >= 500)
                else "warning"
            )
            event = (
                "request.unhandled_error"
                if stack_trace
                else "request.slow"
                if slow
                else "request.failed"
            )
            status_text = f" returned HTTP {status_code}" if status_code else " failed"
            message = (
                f"{method} {path}{status_text}"
                if not slow
                else f"{method} {path} completed slowly in {duration_ms:.2f} ms"
            )
            record_error_log(
                session,
                tenant_id=valid_tenant_id,
                branch_id=valid_branch_id,
                user_id=user_id,
                source="backend_api",
                level=level,
                category=_request_category(status_code, slow=slow),
                event=event,
                message=message,
                module=(
                    path.removeprefix("/api/v1/").split("/", 1)[0]
                    if path.startswith("/api/v1/")
                    else "api"
                ),
                route=path,
                method=method,
                status_code=status_code,
                request_id=request_id,
                stack_trace=stack_trace,
                metadata_json={"duration_ms": duration_ms},
            )
    except Exception:
        request_logger.exception(
            "error_log.persistence_failed",
            extra={"request_id": request_id, "path": path},
        )


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
        branch_id = headers.get(b"x-branch-id", b"").decode(errors="ignore")
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
            route = scope.get("route")
            route_path = str(getattr(route, "path", None) or path)
            record_request(
                route=route_path,
                method=method,
                status_code=500,
                duration_ms=duration_ms,
            )
            stack_trace = traceback.format_exc()
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
            _persist_request_issue(
                scope,
                headers=headers,
                tenant_id=tenant_id or None,
                branch_id=branch_id or None,
                request_id=request_id,
                method=method,
                path=path,
                status_code=500,
                duration_ms=duration_ms,
                stack_trace=stack_trace,
            )
            request_id_context.reset(request_context_token)
            tenant_id_context.reset(tenant_context_token)
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        route = scope.get("route")
        route_path = str(getattr(route, "path", None) or path)
        record_request(
            route=route_path,
            method=method,
            status_code=response_status,
            duration_ms=duration_ms,
        )
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
        if response_status >= 400 and response_status != 503:
            _persist_request_issue(
                scope,
                headers=headers,
                tenant_id=tenant_id or None,
                branch_id=branch_id or None,
                request_id=request_id,
                method=method,
                path=path,
                status_code=response_status,
                duration_ms=duration_ms,
                slow=False,
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


class SecurityHeadersMiddleware:
    """Apply browser security policy consistently, including API errors."""

    def __init__(self, app: Callable) -> None:
        self.app = app
        self.production = get_settings().environment.strip().lower() in {
            "production",
            "prod",
        }

    async def __call__(self, scope: dict, receive: Callable, send: Callable) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path") or "")

        async def send_with_security_headers(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                existing = {name.lower() for name, _value in headers}

                def add(name: bytes, value: bytes) -> None:
                    if name not in existing:
                        headers.append((name, value))

                add(b"x-content-type-options", b"nosniff")
                add(b"x-frame-options", b"DENY")
                add(b"referrer-policy", b"no-referrer")
                add(
                    b"permissions-policy",
                    b"camera=(), microphone=(), geolocation=()",
                )
                if path.startswith("/api/v1/auth/"):
                    add(b"cache-control", b"no-store")
                    add(b"pragma", b"no-cache")
                if self.production:
                    add(
                        b"strict-transport-security",
                        b"max-age=31536000; includeSubDomains",
                    )
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_security_headers)
