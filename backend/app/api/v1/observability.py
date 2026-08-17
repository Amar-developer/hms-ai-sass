from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.auth import require_super_admin
from app.core.config import get_settings
from app.core.database import database_pool_status, get_session
from app.core.runtime_metrics import snapshot
from app.modules.identity.models import User
from app.modules.notifications.services.operational_metrics import (
    read_queue_metrics,
    read_worker_metrics,
)


router = APIRouter(prefix="/platform/observability")


@router.get("/metrics", summary="Read platform operational metrics")
def operational_metrics(
    _current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    settings = get_settings()
    database_connections_per_worker = settings.db_pool_size + settings.db_max_overflow
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "runtime": snapshot(),
        "database_pool": database_pool_status(),
        "queues": read_queue_metrics(session),
        "workers": {"report_worker": read_worker_metrics()},
        "capacity": {
            "scope": "configured_api_container",
            "api_workers": settings.web_concurrency,
            "request_limit_per_worker": settings.web_limit_concurrency,
            "request_limit_per_container": (
                settings.web_concurrency * settings.web_limit_concurrency
            ),
            # Sync handlers execute here, so this — not the admission limit
            # above — bounds how many requests are doing work at once.
            "thread_limit_per_worker": settings.web_thread_limit,
            "thread_limit_per_container": (
                settings.web_concurrency * settings.web_thread_limit
            ),
            "database_connections_per_worker": database_connections_per_worker,
            "database_connections_per_container": (
                settings.web_concurrency * database_connections_per_worker
            ),
            "backlog": settings.web_backlog,
            "graceful_shutdown_seconds": settings.web_graceful_shutdown_seconds,
        },
        "notes": [
            "Runtime percentiles cover the current API worker and last 15 minutes.",
            "Use scripts/summarize_api_metrics.py on combined JSON logs for deployment-wide percentiles.",
        ],
    }
