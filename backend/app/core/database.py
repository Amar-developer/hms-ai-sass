from collections.abc import Generator

from sqlmodel import SQLModel, Session, create_engine

from app.core.config import get_settings

# Ensure models are registered
import app.models  # noqa


def _connect_args(database_url: str) -> dict:
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


def _engine_options(database_url: str) -> dict:
    if database_url.startswith("sqlite"):
        return {}
    return {
        "pool_pre_ping": True,
        "pool_size": 10,
        "max_overflow": 20,
        "pool_timeout": 10,
        "pool_recycle": 1800,
    }


def create_db_engine():
    settings = get_settings()
    database_url = settings.database_url

    if not database_url:
        raise ValueError("DATABASE_URL is not set")

    return create_engine(
        database_url,
        connect_args=_connect_args(database_url),
        **_engine_options(database_url),
        echo=False,
    )


engine = create_db_engine()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


# Dependency for FastAPI
def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
