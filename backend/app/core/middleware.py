from typing import Callable


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
