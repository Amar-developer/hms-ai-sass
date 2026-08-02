from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.database import database_pool_status

router = APIRouter()


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
            "redis": "not_configured",
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
