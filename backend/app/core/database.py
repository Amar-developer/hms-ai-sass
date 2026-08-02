from collections.abc import Generator
import time

from sqlalchemy import event
from sqlalchemy.pool import QueuePool
from sqlmodel import SQLModel, Session, create_engine

from app.core.config import get_settings
from app.core.runtime_metrics import (
    record_database_query,
    record_pool_checkout_wait,
)

# Ensure models are registered
import app.models  # noqa: F401


class InstrumentedQueuePool(QueuePool):
    """Measure checkout acquisition, including time waiting for pool capacity."""

    def _do_get(self):
        started = time.perf_counter()
        try:
            return super()._do_get()
        finally:
            record_pool_checkout_wait((time.perf_counter() - started) * 1000)


def _connect_args(database_url: str) -> dict:
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}
    if get_settings().db_disable_prepared_statements:
        # Named prepared statements are unsafe when PgBouncer assigns a
        # different server connection for every transaction.
        return {"prepare_threshold": None}
    return {}


def _engine_options(database_url: str) -> dict:
    if database_url.startswith("sqlite"):
        return {}
    settings = get_settings()
    return {
        "poolclass": InstrumentedQueuePool,
        "pool_pre_ping": True,
        "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        "pool_timeout": settings.db_pool_timeout,
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


@event.listens_for(engine, "before_cursor_execute")
def _start_query_timer(connection, _cursor, statement, _parameters, _context, _many):
    timers = connection.info.setdefault("medizinhub_query_timers", [])
    timers.append(time.perf_counter())


@event.listens_for(engine, "after_cursor_execute")
def _finish_query_timer(connection, _cursor, statement, _parameters, _context, _many):
    timers = connection.info.get("medizinhub_query_timers", [])
    if not timers:
        return
    started = timers.pop()
    duration_ms = (time.perf_counter() - started) * 1000
    operation = statement.lstrip().split(None, 1)[0] if statement.strip() else "OTHER"
    record_database_query(operation=operation, duration_ms=duration_ms)


@event.listens_for(engine, "handle_error")
def _discard_failed_query_timer(exception_context) -> None:
    connection = exception_context.connection
    if connection is None:
        return
    timers = connection.info.get("medizinhub_query_timers", [])
    if timers:
        timers.pop()


if engine.dialect.name == "postgresql":

    @event.listens_for(engine, "begin")
    def _set_transaction_timeouts(connection) -> None:
        """Bound each transaction without relying on pooled server session state."""
        settings = get_settings()
        if settings.db_statement_timeout_ms:
            connection.exec_driver_sql(
                f"SET LOCAL statement_timeout = {settings.db_statement_timeout_ms}"
            )
        if settings.db_lock_timeout_ms:
            connection.exec_driver_sql(
                f"SET LOCAL lock_timeout = {settings.db_lock_timeout_ms}"
            )
        if settings.db_idle_transaction_timeout_ms:
            connection.exec_driver_sql(
                "SET LOCAL idle_in_transaction_session_timeout = "
                f"{settings.db_idle_transaction_timeout_ms}"
            )


def database_pool_status() -> dict[str, int | str | None]:
    """Return connection-free pool telemetry safe for readiness and logs."""
    pool = engine.pool

    def read_value(name: str) -> int | None:
        value = getattr(pool, name, None)
        return value() if callable(value) else None

    size = read_value("size")
    checked_out = read_value("checkedout")
    overflow = read_value("overflow")
    if isinstance(overflow, int):
        overflow = max(0, overflow)
    capacity = size + get_settings().db_max_overflow if isinstance(size, int) else None
    return {
        "type": type(pool).__name__,
        "size": size,
        "checked_out": checked_out,
        "overflow": overflow,
        "capacity": capacity,
    }


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


# Dependency for FastAPI
def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise
