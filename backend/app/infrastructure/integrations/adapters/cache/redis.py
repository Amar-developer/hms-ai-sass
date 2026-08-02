from app.core.config import Settings, get_settings
from app.infrastructure.integrations.ports.cache import KeyValueStore


def create_redis_client(
    settings: Settings | None = None, *, decode_responses: bool = True
) -> KeyValueStore:
    """Create the shared Redis adapter without leaking the Redis package to domains."""

    try:
        from redis import Redis
    except ImportError as exc:  # pragma: no cover - deployment guard
        raise RuntimeError(
            "Redis client is not installed. Install backend requirements."
        ) from exc
    resolved = settings or get_settings()
    return Redis.from_url(resolved.redis_url, decode_responses=decode_responses)
