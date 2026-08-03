# Scalability and capacity runbook

This runbook defines how MedizinHub HMS is measured and scaled. User accounts,
daily active users, open browser sessions, and simultaneous API requests are
different numbers. Capacity decisions must use measured request concurrency,
p95/p99 latency, error rate, database saturation, and queue age.

## Implemented scaling controls

- Production and staging API startup runs Alembic and readiness verification
  under a PostgreSQL advisory lock. Multiple replicas can start together
  without racing migrations.
- Uvicorn has configurable worker count, concurrency admission, TCP backlog,
  keep-alive timeout, and graceful shutdown timeout.
- Docker gives API and report-worker processes 45 seconds to stop cleanly.
- API database pools are bounded per process and use PgBouncer transaction
  pooling. PostgreSQL and PgBouncer limits are deployment configuration rather
  than hard-coded application assumptions.
- Production files use private S3, so API replicas do not depend on shared
  local disk.
- Report, email, and notification work is claimed from durable database rows;
  multiple workers use leases/row locks and Redis only for coordination or
  wake-up hints.
- The super-admin observability endpoint reports configured API admission and
  database-connection capacity alongside live pool and queue metrics.

## Capacity formula

For one API container:

```text
request admission = WEB_CONCURRENCY × WEB_LIMIT_CONCURRENCY
possible PgBouncer clients = WEB_CONCURRENCY × (DB_POOL_SIZE + DB_MAX_OVERFLOW)
```

Across replicas, multiply the second value by API replica count, then add worker
and operational clients. Keep that total below `PGBOUNCER_MAX_CLIENT_CONN` with
at least 25% headroom. PgBouncer's server pools must remain below PostgreSQL
`max_connections` after reserving connections for migrations, monitoring,
backups, and administrators. Raising every limit together is not a performance
fix; first identify the saturated layer.

The default production container is:

```text
2 API workers × 80 admitted requests = 160 admitted/in-flight requests
2 API workers × 20 possible pool clients = 40 PgBouncer client connections
```

## Validation targets

Use these as initial release gates and replace them with measured baselines:

| Signal | Initial gate |
| --- | --- |
| Read API p95 | below 1,000 ms |
| Read API p99 | below 2,000 ms |
| Error rate | below 1% |
| Database pool timeouts | zero |
| Pool checked out / capacity | below 70% sustained |
| Oldest normal notification | below 5 minutes |
| API container CPU | below 70% sustained |
| API container memory | stable, without monotonic growth |

## Safe load gate

Run only against local or an approved staging tenant with synthetic data. Never
use production patient data. Credentials are accepted only through environment
variables so they do not appear in shell history or process arguments.

Local health baseline:

```bash
backend/.venv/bin/python backend/scripts/load_test_api.py \
  --base-url http://127.0.0.1:8080 \
  --requests 500 \
  --concurrency 25
```

Authenticated staging read baseline:

```bash
export MEDIZINHUB_LOAD_TEST_BEARER_TOKEN='temporary-test-session-token'
export MEDIZINHUB_LOAD_TEST_TENANT_ID='synthetic-load-test-tenant'

backend/.venv/bin/python backend/scripts/load_test_api.py \
  --base-url https://devclinic.medizinhub.com \
  --allow-remote \
  --path /api/v1/patients \
  --path /api/v1/appointments \
  --path /api/v1/billing/invoices \
  --requests 1000 \
  --concurrency 50 \
  --max-p95-ms 1000 \
  --max-error-rate 0.01

unset MEDIZINHUB_LOAD_TEST_BEARER_TOKEN
unset MEDIZINHUB_LOAD_TEST_TENANT_ID
```

The tool performs GET requests only, rejects query strings to prevent patient
search data entering commands/logs, requires HTTPS for remote targets, and
fails the command when latency or error thresholds are exceeded. Increase load
in stages—10, 25, 50, 100—while watching the observability endpoint, combined
backend logs, `docker stats`, PostgreSQL statistics, and queue age.

## Deployment sizes

### Around 100 concurrent users

The current single-host topology can be sufficient after staging proves the
targets above. Start with two API workers, PgBouncer, one durable background
worker, private S3, and monitored PostgreSQL. Scale workers only when CPU has
headroom and the connection formula remains safe.

### Around 1,000 concurrent users

Use multiple API containers behind a health-checking load balancer, managed
PostgreSQL with tested IOPS, managed Redis, private S3, and at least two
background-worker replicas. Deploy immutable images and drain replicas using
the graceful-shutdown window. The repository's single-host Compose file is a
deployment reference, not the final 1,000-concurrent-user orchestrator.

### Around 10,000 concurrent users

Use multi-availability-zone orchestration, autoscaling based on request latency
and saturation, managed database failover, managed Redis failover, CDN/static
asset offload, tested backup/restore, centralized metrics/traces, and provider
rate-limit capacity planning. Separate heavy reporting from interactive API
capacity. Read replicas may serve explicitly read-only analytics after replica
lag and tenant consistency are designed and tested; normal transactional reads
must not be moved blindly.

No tier is approved by configuration alone. Promote only after production-like
data-volume tests and a sustained staging load window meet the gates.
