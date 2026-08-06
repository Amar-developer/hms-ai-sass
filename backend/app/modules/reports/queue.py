from datetime import datetime, timezone

from app.core.config import get_settings
from app.infrastructure.integrations.factories import get_cache_store


def _dedupe_key(queue_name: str, job_id: str) -> str:
    return f"{queue_name}:dedupe:{job_id}"


def enqueue_monthly_report_job(job_id: str) -> bool:
    """Publish a wake-up hint for a durable database-backed report job.

    The short-lived key prevents ordinary duplicate queue entries. ReportJob is
    still the source of truth, so a Redis restart cannot lose the job.
    """
    settings = get_settings()
    client = get_cache_store(settings)
    dedupe_key = _dedupe_key(settings.report_queue_name, job_id)
    acquired = client.set(
        dedupe_key,
        "1",
        ex=settings.report_queue_dedupe_ttl_seconds,
        nx=True,
    )
    if not acquired:
        return False
    try:
        client.lpush(settings.report_queue_name, job_id)
    except Exception:
        client.delete(dedupe_key)
        raise
    return True


def dequeue_monthly_report_job(timeout: int = 5) -> str | None:
    settings = get_settings()
    client = get_cache_store(settings)
    item = client.brpop(settings.report_queue_name, timeout=timeout)
    if not item:
        return None
    _queue_name, job_id = item
    client.delete(_dedupe_key(settings.report_queue_name, job_id))
    return job_id


def scheduler_lock(seconds: int = 55) -> bool:
    settings = get_settings()
    client = get_cache_store(settings)
    return bool(
        client.set(settings.report_scheduler_lock_key, "1", ex=seconds, nx=True)
    )


def record_worker_heartbeat() -> None:
    settings = get_settings()
    client = get_cache_store(settings)
    client.set(
        settings.report_worker_heartbeat_key,
        datetime.now(timezone.utc).isoformat(),
        ex=settings.report_worker_heartbeat_ttl_seconds,
    )


def read_worker_heartbeat() -> str | None:
    settings = get_settings()
    # This runs inside an operator-facing HTTP endpoint. Redis health must not
    # inherit an unbounded network timeout and slow the API when Redis is down.
    return get_cache_store(
        settings,
        socket_connect_timeout=1,
        socket_timeout=1,
    ).get(settings.report_worker_heartbeat_key)
