"""Short-TTL Redis cache for the auth hot path.

`get_current_user` and the permission dependencies run on almost every API
call and each do several Postgres round trips (AuthSession lookup, User
lookup, role/permission resolution, tenant lookup). Under a burst of
concurrent requests (many users logging in, a dashboard firing several
parallel calls) that multiplies fast and is what exhausts the DB connection
pool. Caching the read-mostly parts here — tenant status and a user's
resolved permission/role keys — removes most of that load.

This is deliberately TTL-based rather than fully invalidation-driven: a few
call sites invalidate proactively on the write paths that matter most
(direct role/permission assignment, tenant status changes), but the TTL is
the real safety net and bounds worst-case staleness (e.g. a just-revoked
permission can remain effective for up to `auth_cache_ttl_seconds`). Redis
errors always fail open to a normal DB read — caching must never be able to
turn into an outage of its own.
"""

import json
from functools import lru_cache

from app.core.config import get_settings
from app.infrastructure.integrations.factories import get_cache_store

_PREFIX = "medizinhub:authcache"


@lru_cache
def _client():
    return get_cache_store()


def _ttl() -> int:
    return get_settings().auth_cache_ttl_seconds


def _get_json(key: str):
    if _ttl() <= 0:
        return None
    try:
        raw = _client().get(key)
    except Exception:
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _set_json(key: str, value) -> None:
    ttl = _ttl()
    if ttl <= 0:
        return
    try:
        _client().set(key, json.dumps(value), ex=ttl)
    except Exception:
        pass


def _delete(*keys: str) -> None:
    if not keys:
        return
    try:
        _client().delete(*keys)
    except Exception:
        pass


def get_permission_keys(user_id: str) -> list[str] | None:
    return _get_json(f"{_PREFIX}:perm:{user_id}")


def set_permission_keys(user_id: str, keys: list[str]) -> None:
    _set_json(f"{_PREFIX}:perm:{user_id}", keys)


def get_role_keys(user_id: str) -> list[str] | None:
    return _get_json(f"{_PREFIX}:role:{user_id}")


def set_role_keys(user_id: str, keys: list[str]) -> None:
    _set_json(f"{_PREFIX}:role:{user_id}", keys)


def invalidate_user(user_id: str) -> None:
    """Call after a user's role or permission assignment changes."""
    _delete(f"{_PREFIX}:perm:{user_id}", f"{_PREFIX}:role:{user_id}")


def get_tenant_status(tenant_id: str) -> dict | None:
    return _get_json(f"{_PREFIX}:tenant:{tenant_id}")


def set_tenant_status(tenant_id: str, *, exists: bool, status: str | None) -> None:
    _set_json(f"{_PREFIX}:tenant:{tenant_id}", {"exists": exists, "status": status})


def invalidate_tenant(tenant_id: str) -> None:
    """Call after a tenant's status changes (suspend/reactivate/delete)."""
    _delete(f"{_PREFIX}:tenant:{tenant_id}")
