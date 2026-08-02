"""Low-overhead, process-local operational metrics.

Request percentiles are also derivable across every API worker from the JSON
request logs with ``scripts/summarize_api_metrics.py``.  This in-memory view is
intentionally bounded and is meant for live diagnosis, not long-term storage.
"""

from __future__ import annotations

import math
import threading
from collections import defaultdict, deque
from dataclasses import dataclass
from time import monotonic


MAX_SAMPLES_PER_KEY = 2_000
WINDOW_SECONDS = 15 * 60


@dataclass(frozen=True)
class _TimedValue:
    recorded_at: float
    value: float


_lock = threading.Lock()
_request_samples: dict[str, deque[_TimedValue]] = defaultdict(
    lambda: deque(maxlen=MAX_SAMPLES_PER_KEY)
)
_database_samples: dict[str, deque[_TimedValue]] = defaultdict(
    lambda: deque(maxlen=MAX_SAMPLES_PER_KEY)
)
_request_totals: dict[tuple[str, int], int] = defaultdict(int)
_database_totals: dict[str, int] = defaultdict(int)
_pool_checkout_wait_samples: deque[_TimedValue] = deque(maxlen=MAX_SAMPLES_PER_KEY)
_pool_timeouts = 0


def _prune(samples: deque[_TimedValue], now: float) -> None:
    cutoff = now - WINDOW_SECONDS
    while samples and samples[0].recorded_at < cutoff:
        samples.popleft()


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = max(0, math.ceil(percentile * len(ordered)) - 1)
    return round(ordered[rank], 2)


def _summary(samples: deque[_TimedValue], now: float) -> dict[str, float | int | None]:
    _prune(samples, now)
    values = [sample.value for sample in samples]
    return {
        "samples": len(values),
        "average_ms": round(sum(values) / len(values), 2) if values else None,
        "p50_ms": _percentile(values, 0.50),
        "p95_ms": _percentile(values, 0.95),
        "p99_ms": _percentile(values, 0.99),
        "max_ms": round(max(values), 2) if values else None,
    }


def record_request(
    *, route: str, method: str, status_code: int, duration_ms: float
) -> None:
    key = f"{method.upper()} {route}"
    now = monotonic()
    with _lock:
        _request_samples[key].append(_TimedValue(now, duration_ms))
        _request_totals[(key, status_code // 100)] += 1


def record_database_query(*, operation: str, duration_ms: float) -> None:
    normalized = operation.upper() if operation else "OTHER"
    now = monotonic()
    with _lock:
        _database_samples[normalized].append(_TimedValue(now, duration_ms))
        _database_totals[normalized] += 1


def record_pool_timeout() -> None:
    global _pool_timeouts
    with _lock:
        _pool_timeouts += 1


def record_pool_checkout_wait(duration_ms: float) -> None:
    with _lock:
        _pool_checkout_wait_samples.append(_TimedValue(monotonic(), duration_ms))


def snapshot() -> dict[str, object]:
    now = monotonic()
    with _lock:
        requests = {
            key: {
                **_summary(samples, now),
                "total": sum(
                    count
                    for (request_key, _status_class), count in _request_totals.items()
                    if request_key == key
                ),
                "errors_4xx": _request_totals.get((key, 4), 0),
                "errors_5xx": _request_totals.get((key, 5), 0),
            }
            for key, samples in _request_samples.items()
        }
        database = {
            operation: {
                **_summary(samples, now),
                "total": _database_totals.get(operation, 0),
            }
            for operation, samples in _database_samples.items()
        }
        return {
            "window_minutes": WINDOW_SECONDS // 60,
            "scope": "current_api_process",
            "requests": requests,
            "database_queries": database,
            "database_pool_checkout_wait": _summary(_pool_checkout_wait_samples, now),
            "database_pool_timeouts": _pool_timeouts,
        }


def reset_for_tests() -> None:
    global _pool_timeouts
    with _lock:
        _request_samples.clear()
        _database_samples.clear()
        _request_totals.clear()
        _database_totals.clear()
        _pool_checkout_wait_samples.clear()
        _pool_timeouts = 0
