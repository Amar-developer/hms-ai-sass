from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class TenantContextMiddleware(BaseHTTPMiddleware):
    """Attach tenant context for future API permission and isolation checks."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request.state.tenant_id = request.headers.get("X-Tenant-ID")
        request.state.branch_id = request.headers.get("X-Branch-ID")
        response = await call_next(request)
        if request.state.tenant_id:
            response.headers["X-Tenant-ID"] = request.state.tenant_id
        return response
