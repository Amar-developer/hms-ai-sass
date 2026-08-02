from app.core.config import get_settings
from app.infrastructure.integrations.factories import get_cache_store


def enqueue_monthly_report_job(job_id: str) -> None:
    settings = get_settings()
    client = get_cache_store(settings)
    client.lpush(settings.report_queue_name, job_id)


def dequeue_monthly_report_job(timeout: int = 5) -> str | None:
    settings = get_settings()
    client = get_cache_store(settings)
    item = client.brpop(settings.report_queue_name, timeout=timeout)
    if not item:
        return None
    _queue_name, job_id = item
    return job_id


def scheduler_lock(seconds: int = 55) -> bool:
    settings = get_settings()
    client = get_cache_store(settings)
    return bool(
        client.set(settings.report_scheduler_lock_key, "1", ex=seconds, nx=True)
    )
