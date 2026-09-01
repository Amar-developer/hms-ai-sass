# MedizinHub HMS Backend

FastAPI backend scaffold for MedizinHub HMS.

This backend is the application service layer between the frontend, mobile/PWA, WhatsApp/voice automation, and optional ERPNext/Frappe integration. The frontend should call this API, not ERPNext directly.

## Database

Local quick-start uses SQLite when `MEDIZINHUB_DATABASE_URL` is not set:

```text
sqlite:///./medizinhub_hms.db
```

Team development should use PostgreSQL through Docker Compose:

```bash
docker compose up -d postgres redis
cd backend
source .venv/bin/activate
export MEDIZINHUB_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms"
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Alembic migrations live in `backend/alembic`.

## Current Scope

- FastAPI application factory.
- Versioned API under `/api/v1`.
- Health and readiness endpoints.
- Super-admin operational metrics and a repeatable performance baseline runbook.
- Tenant context middleware using `X-Tenant-ID`.
- Module manifest endpoint for plug-and-play module visibility.
- Tenant, branch, subscription plan, audit, patient, appointment, and queue APIs.
- OP, walk-in, follow-up, online, home visit, and emergency appointment foundations.
- Token queue status transitions for call, not available, requeue, cancel, no-show, and start consultation.
- Doctor consultation workflow with draft edits, prescription/referral placeholders, signed-record immutability, and addendums.
- Billing foundation with doctor fee rules, invoice generation from signed consultations, and doctor/clinic split calculation.
- Payment foundation with cash/card/UPI/GPay/Paytm methods, partial payments, refunds, invoice cancellation guardrails, and settlement summary.
- Doctor settlement finalization stores settlement snapshots and prevents duplicate finalization by calculating only remaining payable doctor share.
- Lab, pharmacy, IP, and physiotherapy service invoices are separately linked so billing screens can filter and display source-specific invoices.
- IP running bill and final invoice include room rent, signed IP consultation fees, manual charges, medication administrations, and lab/scan care-entry referrals.
- Redis-backed monthly email report jobs generate Excel-compatible revenue, doctor settlement, department revenue, and paid invoice profit reports through SMTP.
- SaaS subscription enforcement with seeded Free Trial and Starter plans, automatic trial subscription on tenant creation, and patient-limit enforcement.
- Module entitlement enforcement with plan-enabled modules such as billing, lab, pharmacy, WhatsApp, voice, AI, and IP.
- Admin settings foundation for tenant/branch configuration of queue rules, payment methods, invoice prefix, follow-up validity, token language, and communication providers.
- Runtime settings integration for invoice prefix, queue requeue offset, and no-show missed-call threshold.
- Communication notification queue for WhatsApp, SMS, and voice events, gated by module entitlements and `communication.providers_enabled`.
- Automatic notification triggers for appointment booking, token calling, payment pending, and follow-up reminders.
- Identity foundation with super admin bootstrap, login, logout/session revocation, bearer sessions, password change, tenant roles, tenant users, role assignment, and identity audit events.
- RBAC enforcement across tenant, patient, appointment, queue, consultation, billing, payment, settlement, settings, notification, audit, and subscription APIs.
- Practitioner master foundation with branch assignment, department/specialty mapping, weekly schedules, leave blocks, room assignment, timed appointment availability checks, demo doctor mapping, and RBAC enforcement.
- Generated practitioner calendar API that turns schedules, leave, room assignments, and booked appointments into frontend-ready available/booked/leave slots.
- Initial pytest contract tests.

Background report worker:

```bash
docker compose -f docker-compose.local.yml up -d redis report-worker
```

Monthly report email requires `MEDIZINHUB_SMTP_*` values in `.env`. Keep `.env.example` tracked as the template and never commit real credentials.

## Run Locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Open:

- `http://localhost:8000/api/v1/health`
- `http://localhost:8000/api/v1/readiness`
- `http://localhost:8000/api/v1/modules`

## Before Pushing Backend Changes

Run these checks from the project root before pushing to GitHub:

```bash
backend/.venv/bin/ruff check backend/app backend/tests backend/e2e
backend/.venv/bin/pytest backend/tests -q
```

Run the PostgreSQL-backed live API E2E suite separately:

```bash
PGPASSWORD=medizinhub_dev createdb \
  -h 127.0.0.1 -p 5433 -U medizinhub medizinhub_e2e
MEDIZINHUB_E2E_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@127.0.0.1:5433/medizinhub_e2e" \
  bash backend/scripts/run_backend_e2e.sh
```

The E2E runner intentionally drops and recreates the `public` schema. As a
safety guard, it refuses any database whose name does not end in `_e2e`. It
runs Alembic, starts a real Uvicorn process, calls the API through `httpx`, and
stops the process when the suite finishes.

## Fresh SaaS Data

A fresh local database should contain only platform setup records:

- Primary tenant: `MedizinHub HMS`
- Super admin user
- `super_admin` role
- Global `tenant_admin` role template
- Default subscription plans

Start from an empty database by running migrations, then bootstrap the first super admin:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head

curl -X POST http://localhost:8000/api/v1/auth/bootstrap-super-admin \
  -H "Content-Type: application/json" \
  -d '{"name":"Platform Super Admin","email":"admin@medizinhub.local","password":"ChangeMe@123"}'
```

For a clean local development reset, delete all rows and recreate only the fresh SaaS setup:

```bash
MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV python -m database.reset_demo_data
```

The reset scripts live in `database/`. They do not hardcode a super admin email or password. They prompt for the email/password during interactive runs. For non-interactive Docker/CI usage, pass `MEDIZINHUB_SUPER_ADMIN_EMAIL` and `MEDIZINHUB_SUPER_ADMIN_PASSWORD` explicitly. `MEDIZINHUB_SUPER_ADMIN_NAME` remains optional. The reset script does not create demo tenants, branches, patients, doctors, appointments, invoices, or staff users.

## Useful API Groups

- `POST /api/v1/auth/bootstrap-super-admin`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/change-password`
- `POST /api/v1/identity/roles`
- `GET /api/v1/identity/roles`
- `POST /api/v1/identity/users`
- `GET /api/v1/identity/users`
- `POST /api/v1/practitioners`
- `GET /api/v1/practitioners`
- `GET /api/v1/practitioners/{practitioner_id}`
- `PATCH /api/v1/practitioners/{practitioner_id}`
- `GET /api/v1/practitioners/{practitioner_id}/eligibility`
- `GET /api/v1/practitioners/{practitioner_id}/availability`
- `GET /api/v1/practitioners/{practitioner_id}/calendar`
- `POST /api/v1/practitioners/{practitioner_id}/schedules`
- `GET /api/v1/practitioners/{practitioner_id}/schedules`
- `POST /api/v1/practitioners/{practitioner_id}/leaves`
- `GET /api/v1/practitioners/{practitioner_id}/leaves`
- `POST /api/v1/practitioners/{practitioner_id}/room-assignments`
- `GET /api/v1/practitioners/{practitioner_id}/room-assignments`
- `POST /api/v1/tenants`
- `POST /api/v1/tenants/{tenant_id}/branches`
- `POST /api/v1/patients`
- `GET /api/v1/patients?q=search`
- `GET /api/v1/patients/{patient_id}/360`
- `POST /api/v1/appointments`
- `GET /api/v1/queue`
- `POST /api/v1/queue/{entry_id}/call`
- `POST /api/v1/queue/{entry_id}/mark-not-available`
- `POST /api/v1/queue/{entry_id}/requeue`
- `POST /api/v1/queue/{entry_id}/cancel`
- `POST /api/v1/queue/{entry_id}/no-show`
- `POST /api/v1/queue/{entry_id}/start-consultation`
- `POST /api/v1/consultations`
- `PATCH /api/v1/consultations/{consultation_id}`
- `POST /api/v1/consultations/{consultation_id}/sign`
- `POST /api/v1/consultations/{consultation_id}/addendums`
- `POST /api/v1/billing/doctor-fee-rules`
- `GET /api/v1/billing/doctor-fee-rules`
- `POST /api/v1/billing/invoices/from-consultation`
- `POST /api/v1/billing/invoices/from-lab-order`
- `POST /api/v1/billing/invoices/from-pharmacy-issue`
- `GET /api/v1/billing/invoices`
- `GET /api/v1/billing/invoices/{invoice_id}`
- `POST /api/v1/billing/invoices/{invoice_id}/payments`
- `POST /api/v1/billing/payments/{payment_id}/refund`
- `POST /api/v1/billing/invoices/{invoice_id}/cancel`
- `GET /api/v1/billing/doctor-settlements/summary`
- `POST /api/v1/billing/doctor-settlements/finalize`
- `GET /api/v1/reports/monthly-email/config`
- `PUT /api/v1/reports/monthly-email/config`
- `POST /api/v1/reports/monthly-email/send`
- `GET /api/v1/reports/monthly-email/jobs`
- `GET /api/v1/subscription-plans`
- `POST /api/v1/subscription-plans/tenant-subscriptions`
- `GET /api/v1/subscription-plans/tenant-subscriptions/active`
- `GET /api/v1/subscription-plans/entitlements`
- `PUT /api/v1/settings`
- `GET /api/v1/settings`
- `GET /api/v1/settings/resolve`
- `GET /api/v1/settings/bundle`
- `POST /api/v1/notifications`
- `GET /api/v1/notifications`

Default module entitlements:

- Free Trial: patients, appointments, queue, consultations, basic billing.
- Starter: Free Trial modules plus advanced billing.

## Test

```bash
cd backend
pytest
```

Test layers:

- `backend/tests`: unit, service integration, and FastAPI API contract tests.
- `backend/e2e`: critical workflows against live Uvicorn and real PostgreSQL.

The E2E tests do not import application services, override dependencies, or
query the database directly. They verify behavior only through public HTTP
endpoints. Current live coverage includes authentication, tenant RBAC and
isolation, subscription entitlements, patient membership, appointments,
queue, consultations, advanced billing, lab, pharmacy, home care, inpatient
care, physiotherapy, audit events, and backend error-log permissions.

## Architecture Rule

All future modules must follow:

```text
Frontend / Mobile / WhatsApp / Voice
  -> MedizinHub HMS API
  -> PostgreSQL / Redis / Workers
  -> Integration Adapters
  -> ERPNext / Payments / WhatsApp / Voice / ABDM
```

Do not connect UI screens directly to external back-office systems.
