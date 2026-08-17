"""Read PgBouncer's admin console: verify pooler limits, and sample contention.

The application measures its own side of the pooler thoroughly — query
duration and pool checkout wait are both instrumented in
``app/core/runtime_metrics.py``. Nothing measured the pooler itself, so the
one limit that actually bounds throughput (``default_pool_size`` server
connections shared by every API worker and the report worker) could only be
inferred. ``SHOW POOLS`` reports it directly: ``cl_waiting`` is how many
clients are queued for a server connection right now, and ``maxwait`` is how
long the one waiting longest has been waiting.

Two subcommands:

``verify``  Assert the running pooler's configuration matches what the compose
            files declare. Config changes only take effect when the container
            is recreated, so a stale container silently keeps old limits.

``sample``  Poll SHOW POOLS/SHOW STATS on an interval and summarise the peak
            contention seen. Run it alongside a load test.

Access notes. The pooler publishes no host port, so it is reached with
``docker compose exec`` rather than a direct connection. The container has
``psql`` but no Python, which is why this shells out rather than using
psycopg — and psycopg's extended query protocol is rejected by the admin
console anyway. Credentials are never passed as arguments: the command
references the container's own ``$DB_PASSWORD``, the same approach the
PgBouncer healthcheck already uses.

Reaching the admin console requires the connecting user to be listed in the
pooler's ``admin_users``; the compose files set ``ADMIN_USERS``. A
``FATAL: notallowed`` error means the container predates that setting.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import shlex
import subprocess
import time
from pathlib import Path


# Phase 0 defaults, mirroring the compose files. Overridable so the script
# stays useful after the numbers are retuned from a measured baseline.
EXPECTED_CONFIG: dict[str, str] = {
    "pool_mode": "transaction",
    "default_pool_size": "20",
    "query_wait_timeout": "10",
    "reserve_pool_size": "5",
    "reserve_pool_timeout": "3",
}

ADMIN_DATABASE = "pgbouncer"


def parse_csv_rows(output: str) -> list[dict[str, str]]:
    """Parse ``psql --csv`` output into rows keyed by column name.

    Column sets differ between PgBouncer versions, so nothing here may depend
    on column position. Reading the header keeps the parser working when a
    release adds or reorders fields.
    """
    reader = csv.DictReader(io.StringIO(output.strip()))
    return [
        {(key or "").strip(): (value or "").strip() for key, value in row.items()}
        for row in reader
    ]


def parse_show_config(output: str) -> dict[str, str]:
    """Reduce SHOW CONFIG rows to a key -> value mapping."""
    config: dict[str, str] = {}
    for row in parse_csv_rows(output):
        key = row.get("key")
        if key:
            config[key] = row.get("value", "")
    return config


def config_issues(config: dict[str, str], expected: dict[str, str]) -> list[str]:
    """Return one human-readable issue per setting that is missing or wrong."""
    issues: list[str] = []
    for key, want in sorted(expected.items()):
        if key not in config:
            issues.append(
                f"{key} is absent from SHOW CONFIG — this PgBouncer build does "
                "not recognise the setting, so a mounted pgbouncer.ini is needed"
            )
        elif config[key] != want:
            issues.append(f"{key} is {config[key]!r}, expected {want!r}")
    return issues


def _to_int(value: str | None) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return 0


def summarize_samples(samples: list[dict]) -> dict[str, object]:
    """Reduce a run of samples to the numbers worth acting on.

    ``peak_clients_waiting`` above zero means clients queued for a server
    connection: the pool is the binding constraint at that moment.
    ``peak_max_wait_seconds`` approaching ``query_wait_timeout`` means requests
    are being cancelled rather than merely delayed.
    """
    peak_waiting = 0
    peak_wait_seconds = 0.0
    peak_server_active = 0
    saturated_samples = 0

    for sample in samples:
        sample_waiting = 0
        for pool in sample.get("pools", []):
            sample_waiting += _to_int(pool.get("cl_waiting"))
            peak_server_active = max(peak_server_active, _to_int(pool.get("sv_active")))
            try:
                wait_seconds = float(pool.get("maxwait") or 0)
            except (TypeError, ValueError):
                wait_seconds = 0.0
            peak_wait_seconds = max(peak_wait_seconds, wait_seconds)
        peak_waiting = max(peak_waiting, sample_waiting)
        if sample_waiting:
            saturated_samples += 1

    total_wait_us = 0
    if samples:
        first = samples[0].get("stats", [])
        last = samples[-1].get("stats", [])
        total_wait_us = sum(_to_int(row.get("total_wait_time")) for row in last) - sum(
            _to_int(row.get("total_wait_time")) for row in first
        )

    return {
        "samples": len(samples),
        "peak_clients_waiting": peak_waiting,
        "peak_max_wait_seconds": round(peak_wait_seconds, 3),
        "peak_server_connections_active": peak_server_active,
        "samples_with_clients_waiting": saturated_samples,
        "total_wait_time_us_delta": max(total_wait_us, 0),
        "pool_was_the_constraint": peak_waiting > 0,
    }


def _compose_prefix(
    compose_command: str, compose_file: str, env_file: str | None
) -> list[str]:
    """Build the compose invocation, including --env-file when supplied.

    Compose files that declare required variables (``${POSTGRES_USER:?...}``)
    cannot even be parsed without the env file that defines them, and Compose
    only reads ``.env`` by default. Omitting this made every subcommand fail on
    a host whose environment lives in ``.env.staging``.
    """
    prefix = shlex.split(compose_command)
    if env_file:
        prefix += ["--env-file", env_file]
    return prefix + ["-f", compose_file]


def _admin_command(
    query: str,
    *,
    compose_command: str,
    compose_file: str,
    service: str,
    env_file: str | None = None,
) -> list[str]:
    inner = (
        'PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p 5432 '
        f'-U "$DB_USER" -d {ADMIN_DATABASE} --csv -c "{query}"'
    )
    return [
        *_compose_prefix(compose_command, compose_file, env_file),
        "exec",
        "-T",
        service,
        "sh",
        "-c",
        inner,
    ]


def run_admin_query(
    query: str,
    *,
    compose_command: str,
    compose_file: str,
    service: str,
    env_file: str | None = None,
    timeout_seconds: float = 20.0,
) -> str:
    command = _admin_command(
        query,
        compose_command=compose_command,
        compose_file=compose_file,
        service=service,
        env_file=env_file,
    )
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"could not run {command[0]!r}: {exc}. Check --compose-command."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        # Output is captured, so an interactive prompt is invisible: a sudo
        # password request looks identical to a hang. sudo caches credentials
        # for a few minutes, so refreshing first is enough.
        raise RuntimeError(
            f"admin query timed out after {timeout_seconds:g}s ({query}). "
            "If --compose-command uses sudo, run `sudo -v` first — the "
            "password prompt cannot be shown while output is captured."
        ) from exc
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        if "is missing a value" in detail or "interpolating" in detail:
            detail += (
                "\nHint: this compose file needs its env file to resolve "
                "required variables. Pass --env-file (for example "
                "--env-file .env.staging)."
            )
        if "notallowed" in detail:
            detail += (
                "\nHint: the pooler grants admin access only to users in "
                "ADMIN_USERS. If the compose files set it, the running "
                "container predates that change — recreate it with "
                "`docker compose up -d pgbouncer`."
            )
        raise RuntimeError(f"admin query failed ({query}): {detail}")
    return completed.stdout


def _holder_command(
    *,
    compose_command: str,
    compose_file: str,
    service: str,
    holders: int,
    hold_seconds: int,
    env_file: str | None = None,
) -> list[str]:
    """Build the command that occupies every server connection in the pool.

    Each holder runs a single ``pg_sleep`` statement, which under transaction
    pooling keeps one server connection assigned for its whole duration. Run
    detached so the caller can probe the API while they are held. Credentials
    come from the container's own environment, never from arguments.
    """
    inner = (
        f"for i in $(seq 1 {holders}); do "
        'PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p 5432 -U "$DB_USER" '
        f'-d "$DB_NAME" -c "SELECT pg_sleep({hold_seconds})" >/dev/null 2>&1 & '
        "done; wait"
    )
    return [
        *_compose_prefix(compose_command, compose_file, env_file),
        "exec",
        "-d",
        service,
        "sh",
        "-c",
        inner,
    ]


def probe_http(url: str, *, payload: str | None, timeout_seconds: float) -> dict:
    """Issue one request and report what the API did, without raising."""
    import urllib.error
    import urllib.request

    data = payload.encode() if payload else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method="POST" if data else "GET",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            body = response.read().decode(errors="replace")
            status: int | None = int(response.status)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        status = int(exc.code)
    except Exception as exc:  # network error, timeout, refused
        body = f"{type(exc).__name__}: {exc}"
        status = None
    return {
        "status": status,
        "seconds": round(time.perf_counter() - started, 3),
        "body": body[:400],
    }


def _pool_pressure(
    *, compose_command: str, compose_file: str, service: str, env_file: str | None
) -> tuple[int, int]:
    pools = parse_csv_rows(
        run_admin_query(
            "SHOW POOLS",
            compose_command=compose_command,
            compose_file=compose_file,
            service=service,
            env_file=env_file,
        )
    )
    waiting = sum(_to_int(pool.get("cl_waiting")) for pool in pools)
    active = sum(_to_int(pool.get("sv_active")) for pool in pools)
    return active, waiting


def command_saturate(args: argparse.Namespace) -> int:
    print(
        f"Occupying the pool with {args.holders} connections for "
        f"{args.hold_seconds}s. Local or staging only — this deliberately "
        "exhausts the pooler."
    )
    holder = subprocess.run(
        _holder_command(
            compose_command=args.compose_command,
            compose_file=args.compose_file,
            service=args.service,
            holders=args.holders,
            hold_seconds=args.hold_seconds,
            env_file=args.env_file,
        ),
        capture_output=True,
        text=True,
        timeout=30,
    )
    if holder.returncode != 0:
        # Most often the compose file's env file is absent because the command
        # is being run from a workstation rather than the host that owns it.
        print(
            "Could not start the holder connections:\n  "
            + (holder.stderr or holder.stdout).strip().replace("\n", "\n  ")
        )
        return 1

    # Probing before the holders have taken every server connection measures a
    # healthy pool and proves nothing, so wait for observed contention first.
    deadline = time.monotonic() + args.saturation_timeout_seconds
    active = waiting = 0
    while time.monotonic() < deadline:
        active, waiting = _pool_pressure(
            compose_command=args.compose_command,
            compose_file=args.compose_file,
            service=args.service,
            env_file=args.env_file,
        )
        print(f"  server_active={active} clients_waiting={waiting}", flush=True)
        if waiting > 0:
            break
        time.sleep(1)

    if waiting == 0:
        print(
            "\nNo client ever queued, so the pool was never the constraint and "
            "any probe result would be meaningless. Raise --holders above "
            "default_pool_size + reserve_pool_size, and confirm the holders "
            "actually started."
        )
        return 1

    print(f"\nPool is saturated ({waiting} client(s) queued).")
    if not args.probe_url:
        return 0

    result = probe_http(
        args.probe_url,
        payload=args.probe_json,
        timeout_seconds=args.probe_timeout_seconds,
    )
    print(
        f"\n  HTTP {result['status']} in {result['seconds']}s\n" f"  {result['body']}"
    )
    if result["status"] == 503:
        print("\nLoad shedding works: saturation returns 503 to the client.")
        return 0

    # A fast, ordinary response means the request never queued behind the
    # exhausted pool, so it says nothing about overload behaviour. Reporting it
    # as a load-shedding failure would be wrong: the likely causes are that the
    # API reaches PostgreSQL without passing through this pooler, or that it
    # uses a different user/database pair and therefore a different pool.
    if result["status"] is not None and result["seconds"] < args.hold_seconds / 4:
        print(
            f"\nInconclusive: the probe returned {result['status']} in "
            f"{result['seconds']}s without waiting, even though "
            f"{waiting} client(s) were queued. It did not contend for this "
            "pool. Check that the API actually connects through PgBouncer "
            "(`exec backend printenv MEDIZINHUB_DATABASE_URL` should show "
            "@pgbouncer) and that it uses the same user and database as the "
            "holders — SHOW POOLS reports one pool per user/database pair."
        )
        return 1

    print(
        f"\nExpected 503 under saturation, got {result['status']} after "
        f"{result['seconds']}s. A request that waited and then failed points "
        "at PgBouncer closing the queued connection, which raises "
        "OperationalError — not the SQLAlchemyTimeoutError that the handler "
        "in app/main.py catches."
    )
    return 1


def _expected_from_args(overrides: list[str]) -> dict[str, str]:
    expected = dict(EXPECTED_CONFIG)
    for item in overrides:
        key, separator, value = item.partition("=")
        if not separator:
            raise ValueError(f"--expect must be key=value, got {item!r}")
        expected[key.strip()] = value.strip()
    return expected


def command_verify(args: argparse.Namespace) -> int:
    output = run_admin_query(
        "SHOW CONFIG",
        compose_command=args.compose_command,
        compose_file=args.compose_file,
        service=args.service,
        env_file=args.env_file,
    )
    config = parse_show_config(output)
    expected = _expected_from_args(args.expect)
    issues = config_issues(config, expected)

    for key in sorted(expected):
        print(f"  {key} = {config.get(key, '<absent>')}")

    if issues:
        print("\nPgBouncer configuration does not match the declared limits:")
        for issue in issues:
            print(f"  - {issue}")
        return 1
    print("\nPgBouncer limits match the declared configuration.")
    return 0


def command_sample(args: argparse.Namespace) -> int:
    samples: list[dict] = []
    deadline = time.monotonic() + args.duration_seconds

    while True:
        sample = {
            "captured_at": time.time(),
            "pools": parse_csv_rows(
                run_admin_query(
                    "SHOW POOLS",
                    compose_command=args.compose_command,
                    compose_file=args.compose_file,
                    service=args.service,
                    env_file=args.env_file,
                )
            ),
            "stats": parse_csv_rows(
                run_admin_query(
                    "SHOW STATS",
                    compose_command=args.compose_command,
                    compose_file=args.compose_file,
                    service=args.service,
                    env_file=args.env_file,
                )
            ),
        }
        samples.append(sample)
        waiting = sum(_to_int(pool.get("cl_waiting")) for pool in sample["pools"])
        active = sum(_to_int(pool.get("sv_active")) for pool in sample["pools"])
        print(f"  server_active={active} clients_waiting={waiting}", flush=True)
        if time.monotonic() >= deadline:
            break
        time.sleep(args.interval_seconds)

    summary = summarize_samples(samples)

    if args.output:
        destination = Path(args.output)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("w", encoding="utf-8") as handle:
            for sample in samples:
                handle.write(json.dumps(sample, sort_keys=True) + "\n")
        print(f"\nWrote {len(samples)} samples to {destination}")

    print("\n" + json.dumps(summary, indent=2, sort_keys=True))
    if not summary["pool_was_the_constraint"]:
        print(
            "\nNo client ever queued for a server connection during this "
            "window, so the pooler was not the limiting factor. Raise load, or "
            "look upstream at the thread pool and admission limits."
        )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--compose-command",
        default="docker compose",
        help='Override when elevation is needed, e.g. "sudo docker compose".',
    )
    parser.add_argument("--compose-file", default="docker-compose.yml")
    parser.add_argument("--service", default="pgbouncer")
    parser.add_argument(
        "--env-file",
        help="Compose env file, e.g. .env.staging. Required whenever the "
        "compose file declares variables with no default.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    verify = subparsers.add_parser(
        "verify", help="Assert the running pooler matches the declared limits"
    )
    verify.add_argument(
        "--expect",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="Override an expected setting; repeatable.",
    )
    verify.set_defaults(handler=command_verify)

    sample = subparsers.add_parser(
        "sample", help="Poll SHOW POOLS/SHOW STATS and summarise contention"
    )
    sample.add_argument("--duration-seconds", type=float, default=60.0)
    sample.add_argument("--interval-seconds", type=float, default=2.0)
    sample.add_argument("--output", help="Write raw samples as JSONL to this path")
    sample.set_defaults(handler=command_sample)

    saturate = subparsers.add_parser(
        "saturate",
        help="Exhaust the pool, then probe the API to see how overload surfaces",
    )
    saturate.add_argument("--holders", type=int, default=30)
    saturate.add_argument("--hold-seconds", type=int, default=45)
    saturate.add_argument("--saturation-timeout-seconds", type=float, default=20.0)
    saturate.add_argument(
        "--probe-url",
        help="Request this URL once the pool is saturated, e.g. "
        "http://127.0.0.1:8080/api/v1/auth/login",
    )
    saturate.add_argument(
        "--probe-json",
        help="JSON body; sends POST when given, GET otherwise.",
    )
    saturate.add_argument("--probe-timeout-seconds", type=float, default=60.0)
    saturate.set_defaults(handler=command_saturate)

    return parser


def main() -> None:
    args = build_parser().parse_args()
    try:
        raise SystemExit(args.handler(args))
    except RuntimeError as exc:
        # These are operator-facing conditions — a missing env file, an
        # unreachable pooler, an admin console that refuses the connection —
        # not defects. A stack trace buries the one line that explains what to
        # do, so report the message and exit non-zero.
        print(f"\n{exc}")
        if "env file" in str(exc) and "not found" in str(exc):
            print(
                "\nThis compose file's env file exists only on the host that "
                "runs that environment. Run this command there over SSH, not "
                "from a workstation checkout."
            )
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
