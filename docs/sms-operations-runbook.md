# SMS Operations Runbook

Covers the SMSCountry-backed SMS pipeline: the outbox worker, the delivery
receipt callback, and the tenant-facing queue controls. Read
[sms-integration-implementation-plan.md](sms-integration-implementation-plan.md)
for the phased design; this document is what you use when something is wrong.

## 1. How the pipeline works

```
domain event -> NotificationEvent (provider=sms, status=queued)
            -> worker claims the row (FOR UPDATE SKIP LOCKED + 5-minute lease)
            -> revalidates entitlement, integration, flow, consent, limits
            -> renders the DLT-registered template
            -> SmsGateway.send_sms  ->  status=sent, delivery_status=accepted
            -> provider callback    ->  delivery_status=delivered | undelivered | ...
```

Two states mean different things and are the source of most confusion:

| Field | Meaning |
|---|---|
| `status = sent` | SMSCountry **accepted** the message. It is not on a handset yet. |
| `delivery_status = accepted` | Awaiting a delivery receipt. |
| `delivery_status = delivered` | The operator confirmed handset delivery. |
| `delivery_status = undelivered/expired/rejected/blocked` | Final failure **after** acceptance. Never auto-retried. |

An accepted message that never receives a receipt stays `accepted`. That is a
provider-side problem, surfaced as `awaiting_receipt` in the health endpoint.

## 2. Where to look first

| Signal | Endpoint |
|---|---|
| Queue depth, stuck jobs, failure and delivery rates | `GET /api/v1/communications/sms/health` |
| Message and segment consumption this month | `GET /api/v1/communications/sms/usage` |
| Individual rows, filterable by status and flow | `GET /api/v1/communications/sms/queue` |
| Provider and DLT configuration completeness | `GET /api/v1/communications/sms/readiness` |

Usage and reconciliation count only messages SMSCountry accepted, using the
acceptance timestamp. Queued messages and gateway-rejected requests are not
billable; successful integration test sends are billable and are included.

Logs are on the `medizinhub.sms` logger:

- `sms.send_attempted` — one line per attempt, carries `gateway_status`, `attempt`, `segments`
- `sms.receipt_recorded` / `sms.receipt_unmatched`
- `sms.unexpected_delivery_error` — always a bug, never expected traffic

No log line contains credentials, the rendered body, or a full phone number.

## 3. Provider outage

**Symptoms:** `sms/health` shows `status: critical`, a climbing `queued` count,
`failure_rate_24h` rising, and `sms.send_attempted` lines with
`gateway_status: service_unavailable` or `rate_limited`.

The worker already handles this: both statuses are retryable and back off
`60s → 5m → 25m`, capped at one hour, until `max_attempts`. Nothing is lost —
messages accumulate as `queued` and drain when the provider recovers.

**Do:**

1. Confirm it is the provider, not us: check SMSCountry status and try one
   `POST /sms/test`. A `credential_rejected` result is *our* problem (see §5).
2. If the outage will outlast the retry budget, raise `max_attempts` in tenant
   SMS settings so messages are not burned before recovery.
3. If the outage is long and messages are time-sensitive (queue token alerts),
   cancel the stale rows rather than letting them deliver hours late:
   `POST /sms/queue/{id}/cancel`.
4. After recovery, watch `sent_24h` climb and `queued` fall. Do not mass-retry —
   the worker picks them up on its own.

**Do not** disable and re-enable the integration to "kick" it: disabling causes
the worker to cancel every queued row for that tenant.

## 4. Stuck queue

**Symptoms:** `stuck_processing > 0`, or `oldest_queued_age_minutes` above 15
while `sent_24h` is flat.

`stuck_processing` counts rows whose 5-minute processing lease expired — a
worker died mid-send. These recover automatically on the next pass, because
`_claim_next` re-claims any row whose `processing_started_at` is older than the
lease. If the count does not fall within ten minutes, the worker itself is down.

1. Check the report worker process is alive and its heartbeat is fresh.
2. Check `oldest_queued_age_minutes`. Above 60 minutes the health endpoint goes
   `critical` and patient-visible messages are already late.
3. Restart the worker. Claiming is idempotent, so a restart cannot double-send:
   a row is either leased (skipped by other workers) or committed as sent.

A row that is genuinely wedged can be released by cancelling and retrying it;
retry resets `attempt_count`, clears the previous provider state, and requeues.

## 5. Credential rejection

**Symptoms:** every send fails immediately with `gateway_status:
credential_rejected`; `failure_rate_24h` at or near 100%.

This is **not** retryable and the worker will not retry it — each affected row
goes straight to `failed`. Rotated or revoked SMSCountry credentials are the
usual cause.

1. Re-enter the auth key and token (or legacy username and password) in tenant
   SMS settings. Blank fields keep the stored secret, so you must type the new
   value.
2. Verify with `POST /sms/test` before retrying anything in bulk.
3. Retry the failed rows individually via `POST /sms/queue/{id}/retry`.

## 6. Delivery receipts not arriving

**Symptoms:** `awaiting_receipt` climbing; messages sit at
`delivery_status: accepted` for more than 30 minutes.

1. Confirm `public_api_base_url` is set and HTTPS. When it is unset the worker
   sends no callback URL at all and every message stays `accepted` forever —
   this is the single most common cause.
2. Confirm the tenant has a webhook secret saved (`has_webhook_secret: true`).
   Without it every callback is rejected with 401 before any lookup.
3. Check for `sms.receipt_unmatched` lines. Receipts arriving for unknown
   message ids mean the provider is not echoing `ClientReference`, or messages
   were sent from a different environment against the same account.
4. Verify the callback URL is reachable from the public internet and that
   SMSCountry is configured to POST to
   `/api/v1/communications/sms/delivery-receipt/{tenant_id}`.

Receipts are idempotent: a duplicate for a message that already has a final
state is acknowledged and discarded, so provider re-delivery is harmless.

## 7. Volume limits

A tenant that hits its configured daily message limit or monthly segment limit
gets sends **cancelled**, not queued — `enforce_sms_limits` raises and the
worker treats it as a permanent cancellation with the limit named in
`failure_reason`.

Raise the limit in tenant SMS settings, then retry the cancelled rows. Segment
counts matter more than message counts: a template that renders past 160 GSM-7
characters (or 70 Unicode) silently costs two segments. `sms/usage` reports both.

## 8. Kill switch

To stop all SMS for one tenant immediately: turn off `enabled` in tenant SMS
settings. The worker cancels every queued row for that tenant on its next pass
and sends nothing further.

To stop a single workflow, disable that flow in the SMS settings flow list. The
worker cancels queued rows for that flow only, leaving other flows running.

Neither switch touches messages already accepted by SMSCountry — those will
still deliver and still report receipts.

## 9. What never happens automatically

- A message the operator reported as `blocked` or `rejected` is never retried
  to the same number, including by an administrator: `POST /sms/queue/{id}/retry`
  refuses with 409. DND blocks are a regulator rule, not a transient error.
- Template or rendering faults are cancelled, not retried — a mismatch between
  the registered body and the variable keys fails identically every time.
- A cancelled row never re-enters the queue on its own. Retry is always a
  deliberate operator action.
