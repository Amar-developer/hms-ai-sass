# Logging, Tracing, And Observability

## Purpose

This document explains logging, tracing-style correlation, error logs, audit events, runtime readiness, and production investigation workflows.

## Observability Surfaces

- Backend application logs.
- Frontend/client error logs.
- Error Logs module.
- Audit events.
- Activity/comments.
- Docker service logs.
- PostgreSQL logs.
- PgBouncer logs.
- Notification delivery queues.
- Runtime readiness scripts.
- Platform observability metrics.

## Logging Rules

Log:

- request path
- status code
- safe error category
- correlation/request id where available
- tenant id when needed for operations
- provider delivery status

Do not log:

- passwords
- tokens
- cookies
- full patient records
- prescriptions
- lab report content
- invoice PDF content
- raw provider secrets

## Client Error Logs

Frontend errors can be sent to:

- `/api/v1/error-logs/client`
- legacy `/api/v1/client-logs`

The Error Logs UI is hidden from sidebar and available through search for users with `error_logs.read` or `error_logs.manage`.

## Audit Events

Audit events answer:

- who acted
- tenant
- branch when applicable
- action
- target
- timestamp
- safe metadata

Audit sensitive changes:

- role/permission updates
- patient changes
- consultation signing
- invoice/payment/credit/refund actions
- file delivery
- provider settings
- production support access

## Tracing Style

When debugging a user issue:

1. Capture time window.
2. Capture user id or tenant id if safe.
3. Check client error logs.
4. Check backend logs.
5. Check audit events.
6. Check provider queues.
7. Check database logs for locks/connections.

## Runtime Readiness

```bash
cd backend
source .venv/bin/activate
python scripts/verify_runtime_readiness.py
python scripts/verify_production_environment.py
```

Document storage:

```bash
python scripts/verify_document_storage.py
```

## Docker Log Commands

```bash
docker compose logs backend --since 15m --no-color
docker compose logs frontend --since 15m --no-color
docker compose logs postgres --since 15m --no-color
docker compose logs pgbouncer --since 15m --no-color
```

## Incident Investigation

1. Triage severity.
2. Preserve logs.
3. Stabilize service.
4. Identify affected tenants and records.
5. Mitigate.
6. Verify recovery.
7. Add test or alert coverage.
8. Update docs/runbook.
