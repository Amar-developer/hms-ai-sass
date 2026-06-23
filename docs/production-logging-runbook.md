# Production Logging Runbook

## Log types used by MedizinHub HMS

| Type | Purpose | Examples |
|---|---|---|
| Request | Every backend API request, status, tenant, and duration | `request.completed`, `request.slow` |
| Error | Unexpected backend exceptions with stack traces | `request.unhandled_error` |
| Security | Authentication and access failures without credentials | `auth.login_failed`, HTTP `401`/`403` request logs |
| Workflow | Business eligibility decisions needed to explain billing | `membership.consultation_benefit_evaluated` |
| Audit | Durable database history of user/business mutations | `identity.user_updated`, `invoice.created`, `payment.recorded` |
| Frontend | React crashes, unhandled promises, connection failures, API 5xx | `frontend.react_error_boundary`, `frontend.api_server_error` |
| Integration | Failures from external lab, medicine, messaging, and email systems | Module-specific warning/error events |

Backend operational and frontend diagnostic events are JSON on application stdout.
Audit events are stored in the `auditevent` table and exposed through the authorized
Audit API/reporting screen. Request bodies, passwords, access tokens, and clinical
content must never be added to operational logs.

## Production configuration

```env
MEDIZINHUB_LOG_LEVEL=INFO
MEDIZINHUB_SLOW_REQUEST_MS=1000
```

Use `INFO` normally, `WARNING` to reduce volume, and `DEBUG` only temporarily in a
controlled non-production investigation. Containers should forward stdout to a
central service such as CloudWatch Logs, Grafana Loki, or an OpenSearch/ELK pipeline.
Keep at least 30 days of operational logs and apply the organization's longer audit
retention policy to database audit events.

## How to check logs

Follow backend logs locally or on the Docker host:

```bash
docker compose logs -f --tail=200 backend
docker logs -f --tail=200 medizinhub-backend
```

Show only warnings/errors when `jq` is available:

```bash
docker logs medizinhub-backend 2>&1 | jq -R 'fromjson? | select(.level == "WARNING" or .level == "ERROR")'
```

Find one user-reported failure using the request ID displayed in the frontend error:

```bash
docker logs medizinhub-backend 2>&1 | grep 'REQUEST-ID-FROM-SCREEN'
```

Find slow requests, failed logins, frontend crashes, or membership decisions:

```bash
docker logs medizinhub-backend 2>&1 | grep 'request.slow'
docker logs medizinhub-backend 2>&1 | grep 'auth.login_failed'
docker logs medizinhub-backend 2>&1 | grep 'frontend\.'
docker logs medizinhub-backend 2>&1 | grep 'membership.consultation_benefit_evaluated'
```

For a systemd deployment:

```bash
journalctl -u medizinhub-backend -f -n 200
journalctl -u medizinhub-backend --since "1 hour ago" | grep 'REQUEST-ID'
```

## Incident investigation workflow

1. Copy the `[request …]` identifier from the UI error or browser Network response header `X-Request-ID`.
2. Search centralized/backend logs for that identifier.
3. Check `status`, `duration_ms`, `tenant_id`, and the associated security/workflow event.
4. For a data mutation, inspect the Audit screen/API using the resource ID and timestamp.
5. Reproduce only after recording the original request ID, tenant, time, user role, and module.
6. Never ask users to send passwords, tokens, full patient records, or browser local-storage contents.

## Choosing the correct log

- Use operational request/error logs for availability, exceptions, latency, and integrations.
- Use security logs for login, session, permission, and tenant-isolation failures.
- Use workflow logs for explainable decisions such as benefit eligibility or invoice adjustment.
- Use audit events for who changed business data and when; audit events are not debug logs.
- Use frontend logs only for actionable warnings/errors. Do not send routine clicks, form values, or patient content.
