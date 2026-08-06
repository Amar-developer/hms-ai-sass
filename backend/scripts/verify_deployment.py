"""Verify a deployed release through its public, read-only contracts."""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


@dataclass(frozen=True)
class Probe:
    name: str
    url: str
    status: int
    duration_ms: float
    body: Any


def validate_origin(value: str) -> str:
    origin = value.rstrip("/")
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("URL must be an absolute HTTP(S) origin")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError("URL must be an origin without a path, query, or fragment")
    if parsed.hostname not in LOCAL_HOSTS and parsed.scheme != "https":
        raise ValueError("remote deployment verification requires HTTPS")
    return origin


def fetch(name: str, url: str, *, timeout_seconds: float, json_body: bool) -> Probe:
    started = time.perf_counter()
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "medizinhub-release-gate/1",
        },
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            content = response.read()
            status = int(response.status)
    except HTTPError as exc:
        exc.read()
        raise RuntimeError(f"{name} returned HTTP {exc.code}") from exc
    except (TimeoutError, URLError, OSError) as exc:
        raise RuntimeError(f"{name} is unreachable") from exc
    body: Any = content.decode("utf-8", errors="replace")
    if json_body:
        try:
            body = json.loads(body)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"{name} did not return JSON") from exc
    return Probe(
        name=name,
        url=url,
        status=status,
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
        body=body,
    )


def contract_issues(
    health: dict[str, Any],
    readiness: dict[str, Any],
    *,
    expected_version: str | None,
    expected_commit: str | None,
    expected_environment: str | None,
) -> list[str]:
    issues: list[str] = []
    if health.get("status") != "ok":
        issues.append("API health status is not ok")
    if readiness.get("status") != "ready":
        issues.append("API readiness status is not ready")
    dependencies = readiness.get("dependencies")
    if not isinstance(dependencies, dict):
        issues.append("readiness dependencies are missing")
    elif dependencies.get("database") != "configured":
        issues.append("database readiness is not configured")
    for field, expected in (
        ("version", expected_version),
        ("build_commit", expected_commit),
        ("environment", expected_environment),
    ):
        if expected and health.get(field) != expected:
            issues.append(f"deployed {field} does not match expected value")
    if expected_environment in {"staging", "production", "prod"} and not health.get(
        "built_at"
    ):
        issues.append("deployed build timestamp is missing")
    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-origin", required=True)
    parser.add_argument("--frontend-origin")
    parser.add_argument("--expected-version")
    parser.add_argument("--expected-commit")
    parser.add_argument("--expected-environment")
    parser.add_argument("--timeout-seconds", type=float, default=10)
    parser.add_argument("--max-probe-ms", type=float, default=3000)
    args = parser.parse_args()
    if args.timeout_seconds <= 0 or args.max_probe_ms <= 0:
        parser.error("timeouts must be greater than zero")
    try:
        api_origin = validate_origin(args.api_origin)
        frontend_origin = (
            validate_origin(args.frontend_origin) if args.frontend_origin else None
        )
    except ValueError as exc:
        parser.error(str(exc))

    probes: list[Probe] = []
    issues: list[str] = []
    targets = [
        ("root health", f"{api_origin}/health", True),
        ("API health", f"{api_origin}/api/v1/health", True),
        ("API readiness", f"{api_origin}/api/v1/readiness", True),
    ]
    if frontend_origin:
        targets.append(("frontend", frontend_origin, False))
    for name, url, json_body in targets:
        try:
            probes.append(
                fetch(
                    name,
                    url,
                    timeout_seconds=args.timeout_seconds,
                    json_body=json_body,
                )
            )
        except RuntimeError as exc:
            issues.append(str(exc))

    by_name = {probe.name: probe for probe in probes}
    health_probe = by_name.get("API health")
    readiness_probe = by_name.get("API readiness")
    if health_probe and readiness_probe:
        if not isinstance(health_probe.body, dict) or not isinstance(
            readiness_probe.body, dict
        ):
            issues.append("health contracts must be JSON objects")
        else:
            issues.extend(
                contract_issues(
                    health_probe.body,
                    readiness_probe.body,
                    expected_version=args.expected_version,
                    expected_commit=args.expected_commit,
                    expected_environment=args.expected_environment,
                )
            )
    for probe in probes:
        if not 200 <= probe.status < 300:
            issues.append(f"{probe.name} returned non-success status")
        if probe.duration_ms > args.max_probe_ms:
            issues.append(f"{probe.name} exceeded {args.max_probe_ms:g} ms")

    report = {
        "ready": not issues,
        "expected": {
            "version": args.expected_version,
            "build_commit": args.expected_commit,
            "environment": args.expected_environment,
        },
        "probes": [
            {
                "name": probe.name,
                "status": probe.status,
                "duration_ms": probe.duration_ms,
            }
            for probe in probes
        ],
        "issues": issues,
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if not issues else 1


if __name__ == "__main__":
    raise SystemExit(main())
