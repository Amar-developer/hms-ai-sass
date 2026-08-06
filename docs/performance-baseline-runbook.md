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
