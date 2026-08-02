from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.auth import require_super_admin
from app.core.database import database_pool_status, get_session
from app.core.runtime_metrics import snapshot
from app.modules.identity.models import User
from app.modules.notifications.services.operational_metrics import read_queue_metrics


router = APIRouter(prefix="/platform/observability")


@router.get("/metrics", summary="Read platform operational metrics")
def operational_metrics(
    _current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "runtime": snapshot(),
        "database_pool": database_pool_status(),
        "queues": read_queue_metrics(session),
        "notes": [
            "Runtime percentiles cover the current API worker and last 15 minutes.",
            "Use scripts/summarize_api_metrics.py on combined JSON logs for deployment-wide percentiles.",
        ],
    }
