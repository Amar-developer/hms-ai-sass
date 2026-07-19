from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings

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
    return ReadinessResponse(
        status="ready",
        service=settings.app_name,
        version=settings.app_version,
        build_commit=settings.build_commit,
        built_at=settings.build_time,
        environment=settings.environment,
        checked_at=datetime.now(timezone.utc),
        dependencies={
            "database": "not_configured",
            "redis": "not_configured",
            "object_storage": "not_configured",
        },
    )
