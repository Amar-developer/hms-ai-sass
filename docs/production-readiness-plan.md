# Production Readiness Plan

This plan defines the remaining hardening work needed before MedizinHub HMS can be treated as a production enterprise SaaS platform. It focuses on automated confidence, safe deployment, healthcare compliance, and device-quality UX.

## 1. Automated Test Expansion

Goal: every module must be tested across tenant scope, branch scope, role permissions, module entitlements, and subscription limits.

Required test layers:

- Unit tests for services, validators, fee rules, entitlement checks, and compliance policy helpers.
- API integration tests for every endpoint with super admin, tenant admin, doctor, staff, lab, pharmacy, billing, branch-scoped, and read-only roles.
- Tenant isolation tests proving one tenant cannot read, update, delete, export, or report another tenant data.
- Branch isolation tests for branch-assigned users across patients, appointments, queue, billing, lab, pharmacy, practitioners, schedules, and reports.
- Module entitlement tests proving disabled modules return a clear `402` or `403` response before workflow execution.
- Permission action tests for `manage`, `create`, `read`, `edit`, `delete`, `approve`, `sign`, `export`, `refund`, and `settle`.
- Audit tests proving sensitive reads, writes, status changes, exports, emergency overrides, refunds, subscription changes, and support access create audit events.
- Regression tests for tenant onboarding wizard, template assignment, module registry entitlements, default roles, default departments, branches, and tenant admin creation.
- Performance tests for appointment search, patient search, queue list, calendar slots, invoice list, reports, and tenant-wide dashboards.
- Frontend tests for login, logout, tenant onboarding, appointment booking, queue actions, patient management, practitioner management, scheduling, consultation, billing, lab, pharmacy, subscriptions, and settings.

Minimum test matrix:

| Axis | Required Cases |
| --- | --- |
| Tenant | Primary tenant, customer tenant, suspended tenant, trial tenant, expired subscription tenant |
| Role | Super admin, tenant admin, branch admin, doctor, reception, nurse, lab, pharmacy, billing, back office, read-only |
| Branch | All branches, assigned branch, wrong branch, no branch assigned |
| Module | Enabled, disabled, dependency missing, plan upgraded, plan expired |
| Action | Create, read, edit, delete, manage, sign, approve, export, refund, settle |
| Data sensitivity | Normal record, clinical record, financial record, report export, cross-tenant support access |

Acceptance gates:

- Backend unit/integration tests run in CI against PostgreSQL.
- Alembic migration tests run from empty database and from previous release snapshot.
- Frontend type check and component/flow tests pass.
- Critical workflow E2E tests pass on desktop, tablet, and mobile viewport sizes.
- Load tests have baseline targets and published results for pilot launch.

## 2. Production Deployment And Operations

Goal: deploy safely, monitor continuously, recover quickly, and protect customer data.

Required deployment components:

- Docker images for backend and frontend with production build steps.
- Environment-specific configuration for local, staging, pilot, and production.
- PostgreSQL production configuration with connection pooling.
- Redis/background worker configuration for notifications, reports, exports, and future integrations.
- Object storage for prescriptions, lab reports, receipts, exports, and uploaded files.
- Strict CORS, secure headers, HTTPS, cookie/session policy, and API rate limits.
- Secrets management through cloud secret manager or equivalent, never committed `.env` values.
- Health, readiness, and liveness probes for backend, worker, database, and storage dependencies.
- Structured JSON logs with request ID, tenant ID, user ID, branch ID, action, latency, and error code.
- Metrics dashboards for API latency, error rate, queue depth, failed jobs, database connections, slow queries, storage failures, notification failures, and login failures.
- Alerts for downtime, high error rate, failed migrations, backup failures, failed payment jobs, high queue delay, suspicious auth activity, and storage access errors.

Backup and restore:

- Daily encrypted database backups.
- Point-in-time recovery where supported.
- Encrypted object storage backup or versioning.
- Monthly restore drill to a separate environment.
- Backup access limited to production operations users.
- Backup retention policy aligned with customer contract and healthcare retention rules.

Migration safety:

- Every schema change must have an Alembic migration.
- Migration should be tested from an empty database and from a production-like snapshot.
- Long-running migrations require a rollback plan and maintenance window.
- Destructive migrations require data export, approval, and customer-impact note.
- Add indexes for high-volume reports/search before enabling large customers.

## 3. Compliance Workflows

Goal: make compliance an operational workflow, not only a document.

Consent workflows:

- Capture patient consent for registration, communication, teleconsultation, lab report sharing, prescription sharing, family/guardian access, marketing, and ABDM/ABHA linking where applicable.
- Store consent type, language, version, captured_by, captured_at, source, expiry/revocation status, and audit trail.
- Support consent withdrawal and enforce it in notifications and sharing.
- Use language-specific consent text for Tamil/English launch and future PAN India languages.

Retention workflows:

- Define retention policy by data type: patient profile, consultation, prescription, lab report, invoice, payment, audit log, support access, exports, uploaded files, and notification logs.
- Add legal hold support for disputes or regulatory requirements.
- Tenant cancellation must not immediately delete legally required clinical/billing data.
- Non-required demo/test data should support secure purge.
- Exported files and signed links must expire.

Audit export:

- Add exportable audit logs for tenant admins and super admins with strict permission checks.
- Filter by tenant, branch, user, module, action, resource, date range, and sensitive-access reason.
- Export formats: CSV first, then PDF/XLS where needed.
- Every audit export must itself create an audit event.

Breach workflow:

- Incident record with severity, affected tenant, affected records, timeline, owner, status, and mitigation.
- Lockdown actions: revoke tokens, rotate secrets, disable user, disable provider, suspend integration, force password reset.
- Evidence export for audit/legal review.
- Customer/patient notification checklist based on final legal guidance.
- Post-incident review and preventive action tracking.

ABDM readiness:

- Keep ABDM/ABHA integration behind explicit module entitlement and tenant setting.
- Add patient consent before ABHA linking or health record exchange.
- Store ABDM identifiers separately from normal patient search display where possible.
- Add adapter boundary for ABDM APIs, retries, consent artifacts, callback verification, and audit events.
- Do not make ABDM mandatory for clinics that do not need it.

## 4. Tablet And Mobile Responsive QA

Goal: the app should be usable at reception, doctor desk, lab/pharmacy counters, and owner dashboard on tablet, mobile, and web.

Required viewport QA:

- Mobile: 360x800 and 390x844.
- Tablet portrait: 768x1024.
- Tablet landscape: 1024x768 and 1180x820.
- Desktop: 1366x768 and 1440x900.

Critical screens:

- Login, change password, logout.
- Super Admin: overview, tenants, create tenant wizard, roles, users, departments, branches, subscriptions, reports.
- Tenant Admin: users, roles, departments, branches, settings.
- Appointment listing, book OP appointment, generated slots, patient search/new patient, duplicate appointment warning.
- Token queue, token display mode, emergency override, requeue/no-show/cancel.
- Patient management and patient details.
- Doctor management and scheduling.
- Doctor consultation, structured prescription, lab referral, signing, addendum.
- Billing, payment, receipt, refund/credit note.
- Lab orders/results and pharmacy inventory/dispense.
- Reports and exports.

QA rules:

- No text overflow inside buttons, cards, tables, or modal windows.
- Row-based listing pages must collapse into readable card rows on mobile/tablet.
- Primary actions should be visible without horizontal scrolling.
- Forms should use large touch targets and predictable Save/Cancel placement.
- Long workflows should preserve user input across validation errors.
- Empty, loading, error, and offline states must be readable and actionable.
- Screens should not expose other tenant data in dropdowns, default selections, or cached local state.

## Recommended Implementation Order

1. Build the automated test matrix for RBAC, tenant isolation, branch isolation, module entitlements, and audit events.
2. Add PostgreSQL CI, Alembic migration safety tests, and seeded production-like test fixtures.
3. Add production deployment templates, environment configuration, structured logging, and health checks.
4. Add backup/restore scripts and a restore drill runbook.
5. Build consent, retention, audit export, breach workflow, and ABDM readiness foundations.
6. Run full tablet/mobile responsive QA and fix all critical screens.
7. Add performance/load tests and publish pilot launch baselines.

## Release Gate

Do not mark MedizinHub HMS production-ready until:

- Automated test matrix covers every critical tenant/role/module combination.
- Production deployment runbook is rehearsed in staging.
- Restore drill succeeds from latest backup.
- Compliance workflows exist for consent, retention, audit export, breach response, and ABDM readiness.
- Tablet/mobile QA passes critical workflows.
- Performance baselines are documented and monitored.
