# Frontend and Backend Testing — Pending Checklist

This document tracks work that is not yet fully implemented or verified. Mark
an item complete only after its test passes locally or in the intended CI job.

## Priority 1 — Complete Critical Frontend E2E Coverage

- [ ] Verify appointment doctor, department, date, time, token, confirmation,
  list visibility, and persisted API record.
- [ ] Verify consultation prescription and referral entry through the browser.
- [ ] Verify signed consultation fields are immutable in the UI and API.
- [ ] Verify paid-invoice cancellation is blocked with a friendly message.
- [ ] Verify authorized invoice-ID copy writes the exact hidden ID.
- [ ] Add a complete receptionist patient and appointment browser workflow.
- [ ] Trigger a denied action through the UI and verify that the friendly
  permission message does not expose the route or request ID.
- [ ] Run the critical Chromium suite in CI and keep its runtime below ten
  minutes.

## Priority 2 — Complete Extended Frontend Module Workflows

### Platform and Administration

- [ ] Onboard a tenant through the Super Admin browser workflow.
- [ ] Assign a subscription plan and verify tenant isolation.
- [ ] Create a tenant role and select exact permissions through the UI.
- [ ] Create a tenant user with that role.
- [ ] Log in as the created user and verify exact sidebar/global-search access.
- [ ] Create and edit a doctor with multiple departments.
- [ ] Verify all assigned doctor departments in the profile menu.
- [ ] Create a schedule and verify resulting appointment availability.

### Operational Modules

- [ ] Items: create, edit, filter, and validate a service item.
- [ ] Lab: order, collect sample, add result, generate invoice, and open billing.
- [ ] Pharmacy: create medicine and purchase, dispense stock, invoice, and verify
  stock status.
- [ ] Home Care: create service, booking, completed visit, invoice, and payment
  navigation.
- [ ] IP: admit patient, add charge, verify running bill, create discharge
  summary, and invoice.
- [ ] Physiotherapy: create case, record session/equipment/charge, and invoice.
- [ ] Reports: apply filters, verify payment/membership values, and open invoice.

### Isolation, Responsive UI, and Accessibility

- [ ] Verify branch switching reloads only branch-scoped records.
- [ ] Verify tenant switching reloads only tenant-scoped records.
- [ ] Verify disabled entitlements hide every affected module.
- [ ] Verify plan upgrades expose affected modules after refresh.
- [ ] Expand mobile/tablet checks from shell smoke tests to major workflows.
- [ ] Add accessibility checks for all major forms and detail pages.
- [ ] Run full Chromium E2E on `main` and `develop`.
- [ ] Run nightly critical Firefox and WebKit suites.
- [ ] Verify Playwright failure reports, traces, screenshots, and videos upload.

## Priority 3 — Backend Database and Concurrency Coverage

- [ ] Test Alembic upgrade from a previous production release snapshot.
- [ ] Test migration downgrade for revisions that promise downgrade support.
- [ ] Add PostgreSQL variants for database-specific constraints currently
  exercised only with SQLite fixtures.
- [ ] Add concurrent appointment-slot booking tests.
- [ ] Add concurrent queue-token allocation tests.
- [ ] Add concurrent payment-recording and invoice-balance tests.
- [ ] Add concurrent pharmacy stock-dispensing tests.
- [ ] Add idempotency tests for retried commands and future callbacks.

## Priority 4 — Backend External Integration E2E

- [ ] Add Redis and background-worker E2E coverage.
- [ ] Add monthly-report worker E2E coverage.
- [ ] Add SMTP/email delivery integration tests.
- [ ] Add notification-provider adapter tests.
- [ ] Add file/object-storage integration tests.
- [ ] Add ERPNext adapter tests when that integration is implemented.
- [ ] Add payment-gateway reconciliation tests when implemented.
- [ ] Add retry, timeout, and duplicate-callback tests for external integrations.

## Priority 5 — Performance, Security, and Recovery

- [ ] Add load tests for patient search, appointments, queue, billing, and
  reports.
- [ ] Publish baseline response-time and concurrency targets.
- [ ] Add production-like database-volume tests.
- [ ] Automate backup creation and restore verification.
- [ ] Run and document a restore drill using a recent production-like backup.
- [ ] Add rate-limiting security tests.
- [ ] Add malicious file-upload and content-type tests.
- [ ] Add session-abuse, repeated-login, and permission-escalation tests.

## Current Verified Baseline

- [x] Backend Ruff checks pass.
- [x] Backend unit/integration/API suite: 276 tests pass.
- [x] Alembic revision graph has one valid head.
- [x] Frontend TypeScript check passes.
- [x] Frontend Vitest suite: 20 tests pass.
- [x] Frontend production build passes.
- [x] Frontend dependency audit reports zero known vulnerabilities.
- [x] Playwright discovers 108 configured tests across Chromium, Firefox, and
  WebKit.
- [x] CI/CD workflows and Docker Compose configurations validate.

## Completion Rule

For each completed workflow:

1. Perform the user behavior through the browser or live API as appropriate.
2. Verify the visible response or status.
3. Verify the persisted result through a public API read.
4. Ensure the test can run independently with uniquely named data.
5. Avoid fixed sleeps; use Playwright assertions, response waits, or backend
   state polling.
6. Update this checklist in the same pull request.
