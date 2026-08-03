from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError

from app.api.router import api_router
from app.api.v1.health import HealthResponse, ReadinessResponse, health, readiness
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.middleware import (
    ObservabilityMiddleware,
    SecurityHeadersMiddleware,
    TenantContextMiddleware,
)
from app.core.runtime_metrics import record_pool_timeout
from app.core.uploads import UPLOADS_DIR


async def database_pool_timeout_handler(
    request: Request, _exc: SQLAlchemyTimeoutError
) -> JSONResponse:
    record_pool_timeout()
    request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "detail": "The service is temporarily busy. Please retry shortly.",
            "request_id": request_id,
        },
        headers={"Retry-After": "3"},
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Docker runs Alembic before Uvicorn. Keep app startup free of DB work so
    # health checks and normal requests cannot be blocked by optional repairs.
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/docs" if settings.enable_docs else None,
        redoc_url="/redoc" if settings.enable_docs else None,
        lifespan=lifespan,
    )

    app.add_middleware(TenantContextMiddleware)
    app.add_middleware(ObservabilityMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Tenant-ID", "Retry-After"],
    )
    app.add_middleware(SecurityHeadersMiddleware)

    app.add_exception_handler(SQLAlchemyTimeoutError, database_pool_timeout_handler)

    @app.get("/", tags=["platform"])
    def root() -> dict[str, str]:
        return {
            "status": "ok",
            "docs": "/docs",
            "health": f"{settings.api_prefix}/health",
        }

    app.add_api_route(
        "/health",
        health,
        methods=["GET"],
        response_model=HealthResponse,
        tags=["platform"],
    )
    app.add_api_route(
        "/readiness",
        readiness,
        methods=["GET"],
        response_model=ReadinessResponse,
        tags=["platform"],
    )
    app.include_router(api_router, prefix=settings.api_prefix)

    # Local development assets use the legacy static path. S3-backed
    # environments must never expose a leftover container upload directory;
    # private objects are read only through authenticated or signed endpoints.
    if settings.file_storage_backend == "local":
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

    return app


app = create_app()
