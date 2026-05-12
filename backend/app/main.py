from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.api.router import api_router
from app.api.v1.health import HealthResponse, ReadinessResponse, health, readiness
from app.core.config import get_settings
from app.core.database import engine, get_session
from app.core.middleware import TenantContextMiddleware
from app.modules.subscriptions.service import ensure_default_plans


@asynccontextmanager
async def lifespan(app: FastAPI):
    #Keep business initialization only
    override = app.dependency_overrides.get(get_session)
    if override:
        session_generator = override()
        session = next(session_generator)
        try:
            ensure_default_plans(session)
        finally:
            try:
                next(session_generator)
            except StopIteration:
                pass
    else:
        with Session(engine) as session:
            ensure_default_plans(session)

    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/docs" if settings.enable_docs else None,
        redoc_url="/redoc" if settings.enable_docs else None,
        lifespan=lifespan,
    )

    app.add_middleware(TenantContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_api_route("/health", health, methods=["GET"], response_model=HealthResponse, tags=["platform"])
    app.add_api_route("/readiness", readiness, methods=["GET"], response_model=ReadinessResponse, tags=["platform"])
    app.include_router(api_router, prefix=settings.api_prefix)

    return app


app = create_app()
