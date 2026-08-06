"""Summarize structured API logs into deployment-wide latency percentiles."""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]


def parse_lines(lines) -> dict[str, dict[str, object]]:
    durations: dict[str, list[float]] = defaultdict(list)
    errors: dict[str, int] = defaultdict(int)
    for raw_line in lines:
        start = raw_line.find("{")
        if start < 0:
            continue
        try:
            row = json.loads(raw_line[start:])
        except (TypeError, json.JSONDecodeError):
            continue
        if row.get("logger") != "medizinhub.request":
            continue
        if row.get("event") not in {"request.completed", "request.slow"}:
            continue
        duration = row.get("duration_ms")
        if not isinstance(duration, (int, float)):
            continue
        key = f"{row.get('method', '?')} {row.get('path', '?')}"
        durations[key].append(float(duration))
        if int(row.get("status") or 0) >= 400:
            errors[key] += 1

    return {
        key: {
            "count": len(values),
            "average_ms": round(sum(values) / len(values), 2),
            "p50_ms": round(percentile(values, 0.50), 2),
            "p95_ms": round(percentile(values, 0.95), 2),
            "p99_ms": round(percentile(values, 0.99), 2),
            "max_ms": round(max(values), 2),
            "errors": errors[key],
            "error_rate_percent": round(errors[key] * 100 / len(values), 2),
        }
        for key, values in durations.items()
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Calculate API p50/p95/p99 from MedizinHub JSON logs"
    )
    parser.add_argument("files", nargs="*", help="Log files; omit to read stdin")
    parser.add_argument("--json", action="store_true", help="Print JSON")
    parser.add_argument("--limit", type=int, default=30)
    args = parser.parse_args()

    if args.files:
        lines = (
            line
            for name in args.files
            for line in Path(name)
            .read_text(encoding="utf-8", errors="replace")
            .splitlines()
        )
    else:
        lines = sys.stdin
    summary = parse_lines(lines)
    ranked = sorted(
        summary.items(), key=lambda item: float(item[1]["p95_ms"]), reverse=True
    )[: args.limit]
    if args.json:
        print(json.dumps(dict(ranked), indent=2))
        return
    print("COUNT  AVG_MS   P50_MS   P95_MS   P99_MS   MAX_MS   ERR%   ENDPOINT")
    for endpoint, row in ranked:
        print(
            f"{row['count']:>5}  {row['average_ms']:>7.2f}  {row['p50_ms']:>7.2f}  "
            f"{row['p95_ms']:>7.2f}  {row['p99_ms']:>7.2f}  {row['max_ms']:>7.2f}  "
            f"{row['error_rate_percent']:>5.2f}  {endpoint}"
        )


if __name__ == "__main__":
    main()
