"""Small dependency-free API load gate for staging and local baselines.

The tool performs GET requests only, never accepts credentials on the command
line, and refuses remote targets unless the operator explicitly opts in.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


@dataclass(frozen=True)
class RequestResult:
    path: str
    status: int | None
    duration_ms: float
    error: str | None = None


def percentile(values: list[float], percentile_value: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(
        0,
        min(len(ordered) - 1, math.ceil(len(ordered) * percentile_value) - 1),
    )
    return round(ordered[index], 2)


def validate_target(base_url: str, paths: list[str], *, allow_remote: bool) -> str:
    normalized = base_url.rstrip("/") + "/"
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("base URL must be an absolute HTTP(S) URL")
    is_local = parsed.hostname in LOCAL_HOSTS
    if not is_local and not allow_remote:
        raise ValueError("remote load tests require --allow-remote")
    if not is_local and parsed.scheme != "https":
        raise ValueError("remote load tests require HTTPS")
    for path in paths:
        if not path.startswith("/") or "?" in path or "#" in path:
            raise ValueError("paths must start with '/' and cannot contain query data")
    return normalized


def _request(
    base_url: str,
    path: str,
    *,
    timeout_seconds: float,
    headers: dict[str, str],
) -> RequestResult:
    started = time.perf_counter()
    request = Request(urljoin(base_url, path.lstrip("/")), headers=headers)
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            response.read()
            status = int(response.status)
        return RequestResult(
            path=path,
            status=status,
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )
    except HTTPError as exc:
        exc.read()
        return RequestResult(
            path=path,
            status=int(exc.code),
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
            error="http_error",
        )
    except (TimeoutError, URLError, OSError):
        return RequestResult(
            path=path,
            status=None,
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
            error="network_error",
        )


def summarize(results: list[RequestResult]) -> dict[str, object]:
    durations = [result.duration_ms for result in results]
    failures = [
        result
        for result in results
        if result.status is None or not 200 <= result.status < 400
    ]
    status_counts: dict[str, int] = {}
    for result in results:
        key = str(result.status) if result.status is not None else "network_error"
        status_counts[key] = status_counts.get(key, 0) + 1
    return {
        "requests": len(results),
        "failures": len(failures),
        "error_rate": round(len(failures) / len(results), 4) if results else 1.0,
        "average_ms": round(statistics.fmean(durations), 2) if durations else None,
        "p50_ms": percentile(durations, 0.50),
        "p95_ms": percentile(durations, 0.95),
        "p99_ms": percentile(durations, 0.99),
        "max_ms": round(max(durations), 2) if durations else None,
        "statuses": status_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run a bounded read-only API load gate"
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--path", action="append", default=[])
    parser.add_argument("--requests", type=int, default=100)
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--timeout-seconds", type=float, default=10)
    parser.add_argument("--max-p95-ms", type=float, default=1000)
    parser.add_argument("--max-error-rate", type=float, default=0.01)
    parser.add_argument("--allow-remote", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    paths = args.path or ["/api/v1/health"]
    if not 1 <= args.requests <= 100_000:
        parser.error("--requests must be between 1 and 100000")
    if not 1 <= args.concurrency <= 1_000:
        parser.error("--concurrency must be between 1 and 1000")
    try:
        base_url = validate_target(args.base_url, paths, allow_remote=args.allow_remote)
    except ValueError as exc:
        parser.error(str(exc))

    headers = {"Accept": "application/json", "User-Agent": "medizinhub-load-gate/1"}
    bearer_token = os.getenv("MEDIZINHUB_LOAD_TEST_BEARER_TOKEN", "").strip()
    tenant_id = os.getenv("MEDIZINHUB_LOAD_TEST_TENANT_ID", "").strip()
    branch_id = os.getenv("MEDIZINHUB_LOAD_TEST_BRANCH_ID", "").strip()
    if bearer_token:
        headers["Authorization"] = f"Bearer {bearer_token}"
    if tenant_id:
        headers["X-Tenant-ID"] = tenant_id
    if branch_id:
        headers["X-Branch-ID"] = branch_id

    started = time.perf_counter()
    worker_count = min(args.concurrency, args.requests)

    def run_worker(offset: int) -> list[RequestResult]:
        return [
            _request(
                base_url,
                paths[index % len(paths)],
                timeout_seconds=args.timeout_seconds,
                headers=headers,
            )
            for index in range(offset, args.requests, worker_count)
        ]

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        results = [
            result
            for worker_results in executor.map(run_worker, range(worker_count))
            for result in worker_results
        ]
    elapsed_seconds = time.perf_counter() - started
    summary = summarize(results)
    summary["wall_seconds"] = round(elapsed_seconds, 2)
    # Latency says whether the requests that ran were fast; throughput says how
    # many the system can retire per second, which is what capacity planning
    # needs. Both were already being collected here — only the division was
    # missing. Compare it against the concurrency used: a throughput that stops
    # rising as concurrency increases means a saturated layer downstream.
    summary["requests_per_second"] = (
        round(len(results) / elapsed_seconds, 2) if elapsed_seconds > 0 else None
    )
    summary["concurrency"] = worker_count
    summary["paths"] = paths

    if args.json:
        print(json.dumps(summary, sort_keys=True))
    else:
        print(
            "requests={requests} failures={failures} error_rate={error_rate:.2%} "
            "p50={p50_ms}ms p95={p95_ms}ms p99={p99_ms}ms max={max_ms}ms "
            "wall={wall_seconds}s rps={requests_per_second}".format(**summary)
        )
        print(f"statuses={json.dumps(summary['statuses'], sort_keys=True)}")

    p95 = summary["p95_ms"]
    if (
        not isinstance(p95, (int, float))
        or p95 > args.max_p95_ms
        or summary["error_rate"] > args.max_error_rate
    ):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
