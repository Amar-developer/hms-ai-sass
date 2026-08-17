from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.core.database import database_pool_status
from app.infrastructure.integrations.factories import get_cache_store

router = APIRouter()


def _redis_status(settings: Settings) -> str:
    """Report the real state of Redis, with a bounded cost.

    Redis backs the auth cache, login rate limiting, the report queue, the
    scheduler lease and the worker heartbeat, so reporting it as absent — as
    this endpoint previously did unconditionally — misleads whoever is reading
    it during an incident.

    The timeouts matter as much as the check. Redis client defaults are
    effectively unbounded, so an unreachable host would hang readiness, and a
    load balancer would then turn a degraded cache into an API outage. One
    second is long enough to succeed and short enough to fail safely.
    """
    if not settings.redis_url:
        return "not_configured"
    try:
        client = get_cache_store(
            settings,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        return "reachable" if client.ping() else "unreachable"
    except Exception:
        # Never raise from readiness: the caller needs an answer, and "Redis is
        # unreachable" is that answer. The application degrades to database
        # reads when the cache is down, so this alone is not a failed state.
        return "unreachable"


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    build_commit: str
    built_at: str | None
    environment: str
    checked_at: datetime


class ReadinessResponse(HealthResponse):
    dependencies: dict[str, str]


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Check API health",
)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        build_commit=settings.build_commit,
        built_at=settings.build_time,
        environment=settings.environment,
        checked_at=datetime.now(timezone.utc),
    )


@router.get(
    "/readiness",
    response_model=ReadinessResponse,
    summary="Check API readiness",
)
def readiness() -> ReadinessResponse:
    settings = get_settings()
    pool = database_pool_status()
    checked_out = pool.get("checked_out")
    capacity = pool.get("capacity")
    pool_saturated = (
        isinstance(checked_out, int)
        and isinstance(capacity, int)
        and checked_out >= capacity
    )
    return ReadinessResponse(
        status="degraded" if pool_saturated else "ready",
        service=settings.app_name,
        version=settings.app_version,
        build_commit=settings.build_commit,
        built_at=settings.build_time,
        environment=settings.environment,
        checked_at=datetime.now(timezone.utc),
        dependencies={
            "database": "pool_saturated" if pool_saturated else "configured",
            "database_pool": (
                f"checked_out={checked_out};capacity={capacity};"
                f"overflow={pool.get('overflow')}"
            ),
            "redis": _redis_status(settings),
            "object_storage": (
                "s3_configured"
                if settings.file_storage_backend == "s3"
                else "local_configured"
            ),
            "permanent_invoice_delivery": (
                "enabled" if settings.permanent_invoice_delivery_enabled else "disabled"
            ),
        },
    )
