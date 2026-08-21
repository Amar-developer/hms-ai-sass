# Architecture and Data Reference

## Purpose

This is the technical source of truth for MedizinHub HMS architecture, data model, API patterns, tenancy, authorization, storage, notifications, and external integration boundaries.

Use the focused architecture files for implementation details:

- [Frontend Architecture](frontend-architecture.md)
- [Backend Architecture](backend-architecture.md)
- [API Design And Request Lifecycle](api-design-and-request-lifecycle.md)
- [Database Connection And Data](database-connection-and-data.md)
- [External Integrations](external-integrations.md)
- [Authentication And Authorization](authentication-and-authorization.md)
- [Design Patterns And SOLID Principles](design-patterns-and-solid.md)
- [Logging, Tracing, And Observability](logging-tracing-observability.md)

## System Shape

MedizinHub HMS is a modular monolith with separate frontend and backend applications.

- Frontend: Next.js app router, React feature modules, shared shell, shared UI components.
- Backend: FastAPI API layer, domain modules, services, SQLAlchemy models, Alembic migrations.
- Database: PostgreSQL.
- Deployment: Docker Compose with backend, frontend, PostgreSQL, PgBouncer, workers, and support services where configured.
- File storage: local storage in development; S3-compatible object storage in production.
- Observability: backend logs, client error logs, audit events, readiness scripts, and database checks.

## Request Lifecycle

1. User interacts with a Next.js page under `frontend/app/(shell)/(app)`.
2. Feature component calls an API helper from `frontend/features/<module>/api` or `frontend/lib/api.ts`.
3. Backend route in `backend/app/api/v1` receives request.
4. FastAPI dependencies resolve session, tenant, user, role, and permission context.
5. Route calls domain services in `backend/app/modules/<module>`.
6. Service validates business rules, permissions, tenant, branch, workflow state, and database consistency.
7. Service reads or writes SQLAlchemy models and emits audit or notification side effects when needed.
8. Response is normalized for the frontend.

## Backend Structure

```text
backend/app/
  api/router.py               API router aggregation
  api/v1/*.py                 Versioned HTTP routes
  core/                       settings, auth, db, shared utilities
  infrastructure/             adapters for external systems
  modules/
    <module>/
      models.py               SQLAlchemy tables
      schemas.py              Pydantic contracts where used
      services/               domain logic
      repository.py           query helpers where used
      permissions.py          module permission helpers where used
```

Rules:

- Routes stay thin.
- Services own business logic.
- Models own persistence shape only.
- Shared logic belongs in `core` only when it is genuinely cross-cutting.
- External systems are accessed through adapters, not directly from route handlers.
- A module should not bypass another module's public service boundary for business behavior.

## Frontend Structure

```text
frontend/app/
  (shell)/(app)/              authenticated app routes
  components/common/          shared controls, tables, filters, shell widgets

frontend/features/
  <module>/
    api/                      feature API calls and query hooks
    components/               feature-specific UI
    forms/                    create and edit forms
    *.tsx                     feature workspace or page component
```

Rules:

- Pages derive route state and pass it to feature components.
- Feature components own module-specific UI state.
- Shared shell owns navigation, breadcrumbs, tenant/branch/department controls, and global command search.
- Critical list pages use shared pagination, filter, sort, skeleton, empty, and error patterns.
- Create and edit URL segments use `new-<entity>` and `edit-<entity>` for clear route and breadcrumb labels.

## Tenancy Model

Every tenant-owned table must include `tenant_id` unless it is a platform-global lookup or explicitly public. Branch-scoped workflows must also include `branch_id`.

Tenant rules:

- Never trust tenant ids from request bodies when tenant context already exists.
- Platform users may query across tenants only through explicit platform routes.
- Tenant admins operate inside their assigned tenant.
- Branch access must be checked on branch-sensitive records.
- Query filters must include tenant constraints before applying user-provided filters.

## Core Data Areas

| Area | Main tables or concepts |
| --- | --- |
| Platform | tenants, tenant modules, platform users, subscription plans |
| Identity | users, roles, permissions, role assignments, sessions |
| Clinic | branches, departments, practitioners, schedules, items |
| Patient | patients, patient memberships, patient intelligence records |
| OPD | appointments, queue entries, consultations, clinical templates |
| Revenue | invoices, invoice items, payments, credit notes, settlements |
| Lab | lab tests, lab orders, samples, results, reports |
| Pharmacy | medicines, batches, stock, medicine issues |
| IP | admissions, treatments, consultations, charges, discharge |
| Physio | cases, plans, sessions, invoices |
| Home care | visit bookings, staff assignments, visit status records |
| Files | file metadata, storage keys, delivery records |
| Communications | notifications, WhatsApp queue, SMS queue boundaries |
| Audit | audit events, activity feed, error logs |

## Relationship Map

```text
tenant
  branch
    department
    practitioner
      schedule
    patient
      appointment
        queue entry
        consultation
          lab referral
          prescription
          invoice source
      lab order
      pharmacy issue
      invoice
        payment
      ip admission
      physiotherapy case
      home care visit
```

## Workflow State Machines

Appointment states commonly include:

- scheduled
- waiting
- called
- in_consultation
- completed
- cancelled

Consultation states commonly include:

- draft
- in_progress
- signed
- completed

Invoice states commonly include:

- draft
- issued
- partially_paid
- paid
- void
- cancelled

Rules:

- State transitions must be explicit in service code.
- Billing must not assume a clinical source is billable unless the source workflow says it is ready.
- Signed clinical records should be treated as immutable except for explicitly audited corrections.

## API Design Rules

- All authenticated APIs live under `/api/v1`.
- Public routes must be intentionally documented.
- Use plural resources where possible: `/patients`, `/appointments`, `/billing/invoices`.
- Use action routes only when the operation is not a normal CRUD update: `/consultations/{id}/sign`.
- Return stable IDs and human display fields when the frontend needs both.
- Do not leak internal exception text to end users.
- Access errors should produce clean permission messages.
- Keep API permission changes synchronized with `api-permission-matrix.md`.

## Permission Model

Permissions are string keys such as:

- `patients.read`
- `patients.create`
- `appointments.read`
- `consultations.sign`
- `billing.manage`
- `communications.sms.manage`

Rules:

- Read, create, edit, manage, sign, export, and delete permissions should be distinct when risk differs.
- Tenant admins can be granted broad tenant rights, but platform-only actions stay platform scoped.
- A backend route must check permissions even when the frontend hides the UI.
- New APIs must update [API Permission Matrix](api-permission-matrix.md).

## Module Entitlements

Tenants can have modules enabled or disabled. Module availability affects:

- Sidebar navigation.
- API access.
- Admin configuration.
- Workflow triggers.
- Subscription packaging.

Do not rely only on frontend hiding. Backend must enforce entitlement where a disabled module would expose data or perform work.

## Files and Document Storage

Development can store files locally. Production should use S3-compatible object storage.

Rules:

- Store metadata in the database.
- Store file content outside the database.
- Resolve file access through a backend route that checks tenant and branch authorization.
- Prefer signed or server-mediated document delivery for invoices, reports, and protected files.
- Never expose raw long-lived storage URLs for patient documents.
- S3 buckets must block public access and use least-privilege credentials.

## Notifications

Notification channels:

- In-app notifications.
- WhatsApp delivery.
- SMS delivery boundary.
- Email reports and scheduled report worker.

Rules:

- Domain services create notification intent.
- Provider adapters handle transport-specific behavior.
- Delivery queues must support retryable and terminal failure states.
- Message templates must avoid exposing unnecessary patient data.
- Delivery records must be tenant scoped and auditable.

## External Integration Boundaries

External systems must be behind adapters in `backend/app/infrastructure/integrations` or a module-owned integration boundary.

Current integration categories:

- Object storage: S3-compatible adapter.
- Messaging: WhatsApp and SMS provider boundaries.
- Reports: email/monthly report worker.
- Future ERP/accounting: keep behind a billing/accounting adapter, not direct route calls.

Rules:

- Never call provider SDKs directly from route handlers.
- Keep provider credentials in environment or secret manager only.
- Normalize provider errors before storing or returning them.
- Include dry-run or verification scripts for production integrations.

## Schema Change Checklist

1. Confirm owning module.
2. Add or update model.
3. Create Alembic migration.
4. Add indexes for tenant, branch, foreign keys, and common filters.
5. Add constraints for uniqueness and workflow safety.
6. Update service validation.
7. Update API response shape if needed.
8. Update frontend contracts.
9. Update tests.
10. Update this doc if the table is a new concept.

## Common Failure Patterns

Missing column:

1. Confirm migration exists.
2. Run `alembic current`.
3. Run `alembic upgrade head`.
4. Check model and migration names match the deployed database.

Unexpected 403:

1. Check user role permissions.
2. Check tenant and branch access.
3. Check module entitlement.
4. Check route permission matrix.

Wrong invoice totals:

1. Check source workflow readiness.
2. Check invoice line generation.
3. Check discount, membership, tax, and payment application order.
4. Verify rounded totals in backend tests.

Broken file download:

1. Check file metadata tenant and branch.
2. Check storage backend environment.
3. Run document storage verification.
4. Check signed delivery expiry and access route.

## Authoritative References

- Endpoint and permission details: [API Permission Matrix](api-permission-matrix.md).
- Daily development process: [Development Workflow](development-workflow.md).
- Production operations: [Operations Runbook](operations-runbook.md).
- Security rules: [Security and Compliance](security-compliance.md).
