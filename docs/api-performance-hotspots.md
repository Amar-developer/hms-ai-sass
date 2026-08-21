# Backend API Performance Hotspots

This document lists backend APIs most likely to produce slow responses based on static code review. It is not a replacement for production measurements. Confirm with live request metrics before optimizing.

## How To Measure Real Slow APIs

Current-process live metrics:

```bash
curl -H "Authorization: Bearer <SUPER_ADMIN_TOKEN>" \
  http://localhost:8000/api/v1/platform/observability/metrics
```

Deployment-wide log summary:

```bash
python backend/scripts/summarize_api_metrics.py backend-api.log
python backend/scripts/summarize_api_metrics.py --json backend-api.log
```

Staging read-only load gate:

```bash
python backend/scripts/load_test_api.py \
  --base-url http://127.0.0.1:8081 \
  --path /api/v1/health \
  --path /api/v1/readiness \
  --requests 30 \
  --concurrency 5 \
  --max-p95-ms 1000
```

The backend emits structured request logs through `medizinhub.request` with `duration_ms`. Slow-request logging is controlled by `MEDIZINHUB_SLOW_REQUEST_MS`.

## Highest Risk Endpoints

| Priority | API | Why it may be slow | First check |
| --- | --- | --- | --- |
| P1 | `GET /api/v1/patient-intelligence/dashboard` | Dashboard aggregation, metrics, filters, loops, DB reads, potential broad patient intelligence scans | Inspect p95 in observability metrics; verify indexes for patient intelligence tables |
| P1 | `POST /api/v1/patient-intelligence/engagement-actions/bulk-queue` | Bulk queue creation, loops, WhatsApp/action preparation, DB writes | Check rows processed per request; prefer batch size limits and background jobs |
| P1 | `GET /api/v1/platform/observability/metrics` | Aggregates runtime metrics, DB pool, queues, worker health | Keep super-admin only; avoid calling too frequently from UI |
| P1 | `GET /api/v1/subscription-plans/reports/revenue` | Revenue report/export style aggregation over subscription invoices | Check date range limits and indexes |
| P1 | `POST /api/v1/reports/monthly-snapshots/archive` | Monthly snapshot archive/recompute work | Run as admin/controlled job; avoid UI repeated clicks |

## File And Document APIs

| API | Why it may be slow |
| --- | --- |
| `GET /api/v1/files/page` | File metadata list with filters and pagination |
| `GET /api/v1/files` | Older list endpoint; can be heavier than page-based API if used broadly |
| `POST /api/v1/files` | Upload path; storage write and metadata create |
| `POST /api/v1/files/sync-uploads` | Scans local upload folder and reconciles metadata |
| `GET /api/v1/files/{file_id}/download` | Authorization plus storage read/signed URL behavior |
| `GET /api/v1/files/{file_id}/renditions` | Optimization/rendition metadata |
| `GET /api/v1/files/{file_id}/optimization-status` | Optimization state checks |
| `POST /api/v1/files/{file_id}/optimize` | Optimization trigger; should avoid doing heavy work inline |
| `GET /api/v1/files/invoice-logo` | File lookup for invoice branding |
| `GET /api/v1/lab/orders/{order_id}/files/{file_id}/download` | Lab document authorization and storage read |
| `POST /api/v1/lab/orders/{order_id}/files` | Multi-file upload |
| `POST /api/v1/ip/admissions/{admission_id}/documents` | Multi-document upload |
| `POST /api/v1/ip/admissions/{admission_id}/document` | Document upload |
| `POST /api/v1/physiotherapy/cases/{case_id}/consent` | Consent upload |
| `POST /api/v1/patients/{patient_id}/photo` | Image upload |
| `POST /api/v1/tenants/{tenant_id}/logo` | Logo upload |

## Reports, Billing, And Invoices

| API | Why it may be slow |
| --- | --- |
| `GET /api/v1/reports/monthly-snapshots` | Snapshot list/query |
| `GET /api/v1/reports/monthly-snapshots/{snapshot_id}` | Snapshot detail payload |
| `GET /api/v1/reports/monthly-email/jobs` | Job list and status |
| `GET /api/v1/reports/monthly-email/jobs/{job_id}/download` | Report artifact download |
| `POST /api/v1/reports/monthly-email/send` | Queues report generation/send |
| `POST /api/v1/reports/profit-email/send` | Queues profit report send |
| `POST /api/v1/reports/monthly-email/jobs/{job_id}/resend` | Reuses or regenerates report delivery |
| `GET /api/v1/subscription-plans/invoices` | Subscription invoice list |
| `POST /api/v1/subscription-plans/invoices/{invoice_id}/settle` | Settlement write workflow |
| `POST /api/v1/subscription-plans/invoices/{invoice_id}/payment-failed` | Payment failure workflow |
| `POST /api/v1/home-care/bookings/{booking_id}/invoice` | Invoice generation from care booking |
| `POST /api/v1/ip/admissions/{admission_id}/invoice` | IP invoice generation across admission stay/items |
| `POST /api/v1/physiotherapy/cases/{case_id}/invoice` | Physio invoice generation |
| `GET /api/v1/communications/public/invoice-receipts/{invoice_id}.pdf` | Public signed invoice PDF delivery |

## List/Page APIs To Watch

These are expected to be called often by frontend grids. They should stay paginated and index-backed.

| API |
| --- |
| `GET /api/v1/patients/page` |
| `GET /api/v1/practitioners/page` |
| `GET /api/v1/practitioners/schedules/page` |
| `GET /api/v1/appointments/page` |
| `GET /api/v1/consultations/page` |
| `GET /api/v1/expenses` |
| `GET /api/v1/pharmacy/medicines/page` |
| `GET /api/v1/pharmacy/suppliers/page` |
| `GET /api/v1/pharmacy/issues/page` |
| `GET /api/v1/lab/orders/page` |
| `GET /api/v1/lab/catalog/tests/page` |
| `GET /api/v1/lab/catalog/packages/page` |
| `GET /api/v1/physiotherapy/equipment/page` |
| `GET /api/v1/home-care/services/page` |
| `GET /api/v1/tenants/{tenant_id}/branches/page` |
| `GET /api/v1/tenants/{tenant_id}/departments/page` |
| `GET /api/v1/client-logs` |

## Communications And Queue APIs

| API | Why it may be slow |
| --- | --- |
| `GET /api/v1/communications/whatsapp/queue` | Queue list with filters |
| `POST /api/v1/communications/whatsapp/test` | Provider boundary call if not mocked |
| `POST /api/v1/communications/whatsapp/queue/{event_id}/retry` | Queue state mutation |
| `POST /api/v1/communications/whatsapp/queue/{event_id}/cancel` | Queue state mutation |
| `POST /api/v1/patient-intelligence/engagement-actions/{action_id}/send` | Engagement action queue/send workflow |
| `POST /api/v1/lab/orders/{order_id}/send-report` | Report delivery queue workflow |

## Optimization Checklist

1. Measure first with `/platform/observability/metrics` or `summarize_api_metrics.py`.
2. Check p95 and p99, not only average.
3. Confirm endpoint is paginated and has a hard max `limit`.
4. Verify tenant, branch, date, status, and foreign-key filters are indexed.
5. Move report generation, bulk queueing, file optimization, and provider calls to background jobs when response time matters.
6. For dashboard/report endpoints, cache tenant-scoped summaries where data freshness allows it.
7. Add performance regression tests only for business-critical queries, like invoice list batching.
