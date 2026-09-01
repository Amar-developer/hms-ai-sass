# Complete Project Documentation

## 1. Project Summary

MedizinHub HMS is a multi-tenant healthcare management system for clinics, hospitals, and healthcare service teams. It covers the patient journey from registration to appointments, OPD consultation, diagnostics, prescriptions, billing, payments, inpatient care, physiotherapy, home care, communication, audit, and platform administration.

The application is built as:

- Frontend: Next.js, React, TypeScript, Tailwind CSS, Vitest, Playwright.
- Backend: FastAPI, Python, SQLAlchemy, Alembic, PostgreSQL, pytest, ruff.
- Runtime: Docker Compose for local, staging, and production-like deployments.
- Storage: local filesystem in development, S3-compatible object storage in production.
- Notifications: in-app notifications, WhatsApp, SMS provider boundaries.
- Tenancy: every clinical and operational record is tenant scoped, and most branch-sensitive records are also branch scoped.

## 2. Primary Goals

1. Give clinics one operational workspace for registration, consultation, diagnostics, medicines, billing, and follow-up.
2. Keep patient data isolated by tenant and protected by role-based permissions.
3. Make daily workflows fast for reception, doctors, lab, pharmacy, billing, administrators, and support teams.
4. Support SaaS packaging with tenant-level modules, subscriptions, and feature entitlements.
5. Provide production runbooks for backup, restore, deployment, incident response, and scaling.

## 3. Main User Roles

- Platform super admin: manages tenants, platform users, platform settings, templates, observability, and cross-tenant support.
- Tenant admin: manages clinic users, roles, branches, departments, settings, templates, communication, plans, and module configuration.
- Reception: registers patients, books appointments, manages queues, collects payments, and starts billing workflows.
- Doctor: reviews queue, opens consultation workspace, records clinical notes, medicines, lab referrals, and signs consultations.
- Lab staff: converts consultation referrals into lab orders, tracks samples, records results, and manages reports.
- Pharmacy staff: converts prescriptions into medicine issues, manages stock and medicine catalog.
- Billing staff: creates invoices, records payments, handles credit notes and settlements.
- Physiotherapy staff: manages physio cases, sessions, plans, invoices, and progress.
- Home care staff: books home visits, tracks visit workflow, captures care records, and handles service billing.

## 4. Repository Map

```text
backend/
  app/
    api/                 FastAPI router registration
    api/v1/              HTTP route modules
    core/                config, security, database, shared platform rules
    infrastructure/      external integration adapters
    modules/             domain modules and services
  alembic/               database migrations
  e2e/                   backend end-to-end tests
  scripts/               seed, readiness, storage, deployment helpers
  tests/                 backend unit and integration tests

frontend/
  app/                   Next.js routes and app shell entry points
  app/components/        shared UI components
  features/              feature modules and screens
  hooks/                 shared React hooks
  lib/                   API client, contracts, navigation, helper libraries
  e2e/                   Playwright tests
  utils/                 shared frontend utilities

docs/                    canonical documentation
scripts/                 repo-level helper scripts
docker-compose*.yml      local, staging, and production-like compose stacks
```

## 5. Runtime Architecture

1. Browser loads the Next.js frontend.
2. Frontend calls the FastAPI backend through `NEXT_PUBLIC_MEDIZINHUB_API_URL` or the local API proxy.
3. FastAPI validates authentication, tenant context, branch context, role permissions, and module access.
4. Domain services run business logic and use SQLAlchemy models/repositories.
5. PostgreSQL stores transactional data.
6. Local storage or S3 stores documents, invoice PDFs, reports, and uploaded files.
7. Notifications are created by domain services and delivered through in-app, WhatsApp, or SMS channels.
8. Background workers handle scheduled reporting and async delivery workflows where configured.

## 6. Core Workflows

### Patient Registration

1. Reception opens Patients.
2. User creates a patient record with identity, mobile, demographics, branch, and optional membership details.
3. Backend validates tenant, branch, duplicate mobile rules, and required fields.
4. Patient appears in Patient 360 with linked consultations, invoices, lab, pharmacy, membership, IP, physio, and home care history.

### OPD Appointment and Consultation

1. Reception opens OPD Workspace.
2. Appointment tab creates or edits an appointment.
3. Queue and doctor schedule views manage waiting, called, and in-consultation states.
4. Doctor opens the consultation tab at `/opd/consultation`.
5. Doctor records diagnosis, vitals, notes, prescriptions, lab referrals, follow-up, and signs the consultation.
6. Signed consultation can feed billing, lab, pharmacy, patient history, and notifications.

### Lab Workflow

1. Lab opens direct lab orders or OPD consultation referrals.
2. Staff creates an order, adds tests, collects samples, records results, and uploads reports.
3. Billing can invoice lab services.
4. Patient 360 shows linked lab orders and reports.

### Pharmacy Workflow

1. Pharmacy opens medicine issues or OPD prescriptions.
2. Staff creates an issue from a signed prescription or directly from inventory.
3. Stock and batch controls are enforced by pharmacy services.
4. Billing and Patient 360 receive linked issue information.

### Billing and Payments

1. Billing creates invoices from source workflows or directly.
2. Invoice lines are calculated with taxes, discounts, membership benefits, credits, and due amounts.
3. Payments are recorded against invoices.
4. Receipts and invoice documents are stored and can be delivered through communication channels.
5. Settlement workflows support doctor revenue sharing and payment reconciliation.

### IP Admission

1. Staff creates an inpatient admission from a patient or OP appointment.
2. Treatment, consultation, charges, consent, discharge, and billing data are tracked under the admission.
3. IP invoices, payments, and patient history are linked by admission and patient.

### Physiotherapy

1. Staff creates a physiotherapy case and plan.
2. Sessions are scheduled and tracked.
3. Case progress, package usage, invoices, and payments are linked to Patient 360.

### Home Care

1. Staff creates a home care visit booking.
2. Visit details include patient, location, schedule, staff, service, and status.
3. Edit and create routes use breadcrumb labels such as `Create Visit` and `Edit Visit`.
4. Home care records can feed billing and patient history.

## 7. Module Catalog

| Area | Modules |
| --- | --- |
| Platform | tenants, platform admins, observability, error logs |
| Identity | users, roles, permissions, sessions, tenant access |
| Clinic admin | branches, departments, practitioners, schedules, item catalog, settings |
| Patient | patient master, Patient 360, patient intelligence, memberships |
| OPD | appointments, queue, doctor schedule, consultations, templates |
| Revenue | billing, invoices, payments, credit notes, settlements |
| Diagnostics | lab tests, lab orders, reports, referrals |
| Pharmacy | medicine catalog, stock, batches, prescriptions, issues |
| Hospital | IP admission, inpatient care, discharge, IP billing |
| Care programs | physiotherapy, home care |
| Communications | in-app notifications, WhatsApp, SMS boundaries, email reports |
| Operations | audit events, files, document storage, logs, backups, readiness scripts |

## 8. Local Setup

### 8.1 Prerequisites

- Node.js 24.x.
- npm 10+.
- Python 3.10+.
- PostgreSQL 15+ or Docker.
- Docker and Docker Compose.

### 8.2 Install Frontend

```bash
cd frontend
npm install
```

### 8.3 Install Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

### 8.4 Configure Environment

1. Copy `.env.example` to `.env` at the repo root when running Docker.
2. Set database credentials.
3. Set frontend API URL:

```bash
NEXT_PUBLIC_MEDIZINHUB_API_URL=http://127.0.0.1:8000/api/v1
```

4. Set backend database URL when running backend directly:

```bash
MEDIZINHUB_DATABASE_URL=postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms
```

### 8.5 Run With Docker

```bash
docker compose -f docker-compose.local.yml up --build
```

Typical local URLs:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8080/api/v1/health`
- PostgreSQL: container network through compose, or mapped local port if enabled.

### 8.6 Run Without Docker

Backend:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm run dev
```

## 9. Database Workflow

1. SQLAlchemy models live under backend modules.
2. Alembic migrations live in `backend/alembic/versions`.
3. Every schema change must have a migration.
4. Migrations must be reversible unless a documented data migration makes downgrade unsafe.
5. Tenant and branch isolation must be preserved in new tables.

Commands:

```bash
cd backend
source .venv/bin/activate
alembic revision --autogenerate -m "describe_change"
alembic upgrade head
```

## 10. API and Permission Workflow

1. Add or update the FastAPI route in `backend/app/api/v1`.
2. Put business logic in the owning `backend/app/modules/<module>/services` package.
3. Require authentication unless the route is intentionally public.
4. Validate tenant, branch, module entitlement, and permission.
5. Add or update the permission key in identity permissions where needed.
6. Update [API Permission Matrix](api-permission-matrix.md).
7. Add tests for access allowed, access denied, tenant isolation, and expected behavior.

## 11. Frontend Workflow

1. Add or update the route under `frontend/app/(shell)/(app)`.
2. Put feature UI under `frontend/features/<module>`.
3. Keep API calls in feature `api/` files or shared `frontend/lib/api.ts` helpers.
4. Use shell navigation and breadcrumbs for module routes.
5. Use shared table, filter, sort, pagination, toast, modal, and form patterns.
6. Add Vitest tests for helpers and critical components.
7. Add Playwright coverage for critical user journeys.

## 12. Testing

Frontend:

```bash
cd frontend
npm test
npm run typecheck
npm run build
```

Backend:

```bash
cd backend
source .venv/bin/activate
ruff check app tests e2e scripts
pytest tests -q
```

Critical frontend e2e:

```bash
cd frontend
npm run test:e2e
```

Full quality gate:

```bash
cd frontend
npm run quality:frontend
npm run quality:backend
```

CI/CD summary:

1. Run focused tests while developing.
2. Run the local quality gate before push.
3. Pull request CI runs backend lint, backend tests, API docs route coverage, frontend tests, typecheck, and build.
4. Staging deployment applies migrations and runs smoke tests.
5. Production deployment happens only after staging evidence and backup confirmation.

Full CI/CD details are in [Development Workflow](development-workflow.md) and [Operations Runbook](operations-runbook.md).

## 13. Deployment Overview

1. Confirm branch and version.
2. Run frontend and backend quality gates.
3. Build Docker images.
4. Confirm a recent PostgreSQL dump exists and is restorable for production changes.
5. Apply migrations.
6. Start or update compose stack.
7. Run health checks.
8. Run smoke tests for login, tenant switching, patient list, OPD, billing, files, and notifications.
9. Record release evidence.

Staging:

```bash
docker compose -f docker-compose.staging.yml up -d --build
```

Production-like:

```bash
docker compose up -d --build
```

PostgreSQL dump and restore commands are maintained in [Operations Runbook](operations-runbook.md). Read that section before refreshing staging, restoring production, or copying data into development.

## 14. Operations Checklist

- Backups are encrypted and tested by restore.
- Document storage verification passes before production file delivery.
- Logs are available for backend, frontend, database, proxy, workers, and failed jobs.
- Runtime readiness scripts pass before release.
- PgBouncer pool settings are reviewed before high load.
- Incident workflow is known by the team.
- Rollback plan is documented for every release.

## 15. Security Checklist

- No patient data in logs unless explicitly approved and masked.
- No credentials in git.
- Production uses HTTPS-only CORS origins.
- Production auth cookies are secure.
- Every protected API enforces tenant and permission checks.
- Audit events are recorded for sensitive actions.
- File access checks tenant, branch, and signed delivery rules.
- Backups, S3 buckets, and secrets follow least privilege.

## 16. Definition of Done

A feature is done only when:

1. Product behavior is implemented.
2. Backend validation and permissions are enforced.
3. Frontend routes, forms, lists, loading, empty, and error states are complete.
4. Database migration is present when schema changes.
5. Tests cover the behavior and important denial paths.
6. Documentation is updated.
7. Quality commands pass.
8. Deployment or rollback impact is known.

## 17. Where To Update Docs

- Project overview or user flow: this document.
- Technical details: [Architecture and Data Reference](architecture-and-data.md).
- Local setup or contribution steps: [Development Workflow](development-workflow.md).
- Deployment or production support: [Operations Runbook](operations-runbook.md).
- Security rules: [Security and Compliance](security-compliance.md).
- Product packaging or roadmap: [Product and Roadmap](product-and-roadmap.md).
- Endpoint permission changes: [API Permission Matrix](api-permission-matrix.md).
