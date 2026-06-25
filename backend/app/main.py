from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.api.v1.health import HealthResponse, ReadinessResponse, health, readiness
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.middleware import ObservabilityMiddleware, TenantContextMiddleware


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
        expose_headers=["X-Request-ID", "X-Tenant-ID"],
    )

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

    uploads_dir = Path("uploads")
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

    return app


app = create_app()
