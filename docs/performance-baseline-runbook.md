# Performance baseline runbook

Use this runbook before and after every performance phase. Never put login
credentials, API keys, patient data, query parameters, or request bodies in the
captured logs.

## 1. Deployment readiness

Backend startup now performs both checks before Uvicorn starts:

```bash
alembic -c alembic/alembic.ini upgrade head
python scripts/verify_runtime_readiness.py --ensure-pg-stat-statements
```

The second command fails when the database Alembic revision differs from the
code head, or PostgreSQL has not preloaded and enabled `pg_stat_statements`.

## 2. Live metrics

A logged-in platform super administrator can read:

```text
GET /api/v1/platform/observability/metrics
```

It contains:

- Current worker request p50, p95, p99 and maximum duration for 15 minutes.
- Current worker SQL operation p50, p95 and p99.
- SQLAlchemy pool size, checked-out connections, overflow and capacity.
- Database pool checkout wait p50, p95 and p99.
- Pool timeout count.
- Notification, document delivery and report queue depth.
- Oldest queued-item age.

The endpoint contains no patient, recipient, tenant, document or SQL text.
Because Uvicorn uses multiple processes, use combined JSON logs for the
authoritative deployment-wide percentiles.

## 3. Deployment-wide API percentiles

Capture a fixed test window, then summarize all backend workers:

```bash
docker compose logs --since=15m backend --no-color \
  | python3 backend/scripts/summarize_api_metrics.py --limit 50
```

To save machine-readable output:

```bash
docker compose logs --since=15m backend --no-color \
  | python3 backend/scripts/summarize_api_metrics.py --json --limit 100
```

Run these workflows during the same window:

1. Login and load the dashboard.
2. Open Doctors and change pages.
3. Open Appointments and filter by date.
4. Open the invoice list and one paid invoice.
5. Record a test payment in a non-production tenant.
6. Send one test invoice notification.

Record count, average, p50, p95, p99, maximum and error rate. Use at least 100
requests for a useful percentile and compare identical datasets and concurrency.

## 4. PostgreSQL baseline

Run read-only query statistics as a database administrator:

```sql
SELECT calls,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       round(total_exec_time::numeric, 2) AS total_ms,
       rows,
       query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

Do not reset `pg_stat_statements` during a production incident. For a controlled
test window, an administrator may reset it immediately before the test and
capture the result immediately after.

Use `EXPLAIN (ANALYZE, BUFFERS)` only on staging with production-like data, or
after separately reviewing production risk. `ANALYZE` executes the query.

## 5. Initial alert thresholds

Start with these thresholds and tune them from real baselines:

- API p95 greater than 1,000 ms for 5 minutes: warning.
- API p95 greater than 3,000 ms for 5 minutes: critical.
- Database pool checked-out/capacity greater than 70%: warning.
- Any database pool timeout: critical.
- Oldest appointment/invoice notification over 5 minutes: warning.
- Oldest notification over 15 minutes: critical.
- Queue terminal failure rate over 10% with at least 20 attempts: warning.

Long-term retention and alerts should consume the structured logs and metrics in
the selected monitoring platform. The in-process snapshot is deliberately
bounded and is not a replacement for Prometheus/OpenTelemetry storage.

## 6. Pooler limits and contention

Sections 2 to 4 measure the application's own side of the pooler. They cannot
see the limit that actually bounds concurrent database work: PgBouncer's
`default_pool_size` server connections, shared by every API worker and the
report worker. `backend/scripts/pgbouncer_admin.py` reads that directly.

Confirm the running pooler matches the declared limits. Configuration changes
only take effect when the container is recreated, so a stale container keeps
its old values while the compose file says otherwise:

```bash
docker compose up -d pgbouncer
python3 backend/scripts/pgbouncer_admin.py verify
```

Use `--compose-file docker-compose.staging.yml` on staging, and
`--compose-command "sudo docker compose"` where elevation is required. A
non-zero exit means the pooler is not enforcing the limits this repository
declares. `query_wait_timeout` matters most: at PgBouncer's 120-second default
the API's `503` + `Retry-After` load shedding never triggers, because the wait
moves from the application pool into the pooler. Saturation then presents as a
hang, and `database_pool_timeouts` stays at zero while the system is failing.

Sample contention during the load window from section 3, in a second terminal:

```bash
python3 backend/scripts/pgbouncer_admin.py sample \
  --duration-seconds 300 \
  --interval-seconds 2 \
  --output artifacts/pool-samples.jsonl
```

Read the summary as follows:

| Field | Meaning |
| --- | --- |
| `peak_clients_waiting` | Above zero, the server pool was the binding constraint. |
| `peak_max_wait_seconds` | Approaching `query_wait_timeout`, requests are being cancelled rather than delayed. |
| `peak_server_connections_active` | At `default_pool_size`, the pool was fully committed. |
| `total_wait_time_us_delta` | Microseconds spent queued by clients that were **eventually served**. Waits that PgBouncer cancels at `query_wait_timeout` are not counted, so this reads 0 in a deliberate saturation test even while clients queue continuously. Use `peak_max_wait_seconds` to judge saturation; use this only for runs that stayed below the timeout. |

If `pool_was_the_constraint` is false, the run never reached the pooler's
limit; raise load, or look upstream at `web_thread_limit` and
`web_limit_concurrency`.

## 7. Throughput ceiling

Latency says whether the requests that ran were fast. Throughput says how many
the system can retire per second, which is what capacity planning needs.
`scripts/load_test_api.py` reports `requests_per_second` for the measured run.

Derive the theoretical ceiling and compare. From the observability endpoint in
section 2, total database milliseconds over the window is the sum across SQL
operations of `average_ms x total`. Divide by the number of requests in the same
window to get `D`, the mean database milliseconds per request. Then:

```text
ceiling (requests/second) = default_pool_size / (D / 1000)
```

At 20 server connections and `D` of 25 ms that is roughly 800 requests/second;
at 100 ms it is 200. Record `D`, the ceiling, and the measured
`requests_per_second` together — the gap between the last two is the headroom
before queueing begins, and a measured rate that stops rising as concurrency
increases confirms the pool is saturated rather than the application being slow.

Record the following, and treat it as the baseline every later change is
compared against:

| Measurement | Value | Source |
| --- | --- | --- |
| Read API p50 / p95 / p99 | | section 3 |
| Requests per second | | `load_test_api.py` |
| Database ms per request (`D`) | | section 2 |
| Theoretical ceiling | | `default_pool_size / (D / 1000)` |
| Peak clients waiting | | section 6 |
| Peak server connections active | | section 6 |
| Slowest query by total time | | section 4 |
