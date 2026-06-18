from app.core.config import get_settings


def enqueue_monthly_report_job(job_id: str) -> None:
    settings = get_settings()
    try:
        from redis import Redis
    except ImportError as exc:
        raise RuntimeError(
            "Redis client is not installed. Install backend requirements."
        ) from exc

    client = Redis.from_url(settings.redis_url, decode_responses=True)
    client.lpush(settings.report_queue_name, job_id)


def dequeue_monthly_report_job(timeout: int = 5) -> str | None:
    settings = get_settings()
    from redis import Redis

    client = Redis.from_url(settings.redis_url, decode_responses=True)
    item = client.brpop(settings.report_queue_name, timeout=timeout)
    if not item:
        return None
    _queue_name, job_id = item
    return job_id


def scheduler_lock(seconds: int = 55) -> bool:
    settings = get_settings()
    from redis import Redis

    client = Redis.from_url(settings.redis_url, decode_responses=True)
    return bool(
        client.set(settings.report_scheduler_lock_key, "1", ex=seconds, nx=True)
    )
