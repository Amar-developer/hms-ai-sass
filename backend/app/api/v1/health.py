from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    checked_at: datetime


class ReadinessResponse(HealthResponse):
    dependencies: dict[str, str]


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        checked_at=datetime.now(timezone.utc),
    )


@router.get("/readiness", response_model=ReadinessResponse)
def readiness() -> ReadinessResponse:
    settings = get_settings()
    return ReadinessResponse(
        status="ready",
        service=settings.app_name,
        version=settings.app_version,
        checked_at=datetime.now(timezone.utc),
        dependencies={
            "database": "not_configured",
            "redis": "not_configured",
            "object_storage": "not_configured",
        },
    )
