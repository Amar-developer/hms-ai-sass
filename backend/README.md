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
- Tenant context middleware using `X-Tenant-ID`.
- Module manifest endpoint for plug-and-play module visibility.
- Tenant, branch, subscription plan, audit, patient, appointment, and queue APIs.
- OP, walk-in, follow-up, online, home visit, and emergency appointment foundations.
- Token queue status transitions for call, not available, requeue, cancel, no-show, and start consultation.
- Doctor consultation workflow with draft edits, prescription/referral placeholders, signed-record immutability, and addendums.
- Billing foundation with doctor fee rules, invoice generation from signed consultations, and doctor/clinic split calculation.
- Payment foundation with cash/card/UPI/GPay/Paytm methods, partial payments, refunds, invoice cancellation guardrails, and settlement summary.
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

## Seed Demo Data

Create a complete local demo dataset with one command:

```bash
cd backend
source .venv/bin/activate
python -m scripts.seed_demo
```

For a clean local development reset, delete existing seeded rows and recreate the demo dataset:

```bash
MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV python -m scripts.reset_demo_data
```

The seed command is idempotent for the demo tenant. It creates or reuses:

- Tenant: `MedizinHub Demo Clinic`
- Branch: `Main Demo Branch`
- Demo Growth subscription plan with billing, WhatsApp, SMS, voice, lab, pharmacy, AI, and IP modules enabled
- Tenant and branch settings for invoice prefix, queue rules, payment methods, and communication providers
- Tenant admin login: `tenant.admin@demo.medizinhub.local` / `DemoPass123`
- Super admin login: `super.admin@demo.medizinhub.local` / `SuperPass123`
- Staff demo password for reception, doctor, lab, pharmacy, billing, and back office: `DemoUser123`
- Demo practitioner master for `doctor_demo` mapped to the main branch, general/pediatrics/diabetology departments, weekday 09:00-13:00 schedules, and Consultation Room 1
- Patient with allergy alert
- OP appointment and queue token
- Signed consultation
- Doctor fee rule
- Invoice with `MHD` prefix
- Queued appointment, token call, payment pending, and follow-up notifications

Use the returned `tenant_id` as `X-Tenant-ID` in Swagger.
Use `POST /api/v1/auth/login` with the seeded tenant admin credentials to get a bearer token for protected module APIs.

Demo users:

| User | Email | Password | Tenant ID |
| --- | --- | --- | --- |
| Super Admin | `super.admin@demo.medizinhub.local` | `SuperPass123` | Not required for login |
| Tenant Admin | `tenant.admin@demo.medizinhub.local` | `DemoPass123` | Required |
| Reception | `reception@demo.medizinhub.local` | `DemoUser123` | Required |
| Doctor | `doctor@demo.medizinhub.local` | `DemoUser123` | Required |
| Lab Technician | `lab@demo.medizinhub.local` | `DemoUser123` | Required |
| Pharmacy | `pharmacy@demo.medizinhub.local` | `DemoUser123` | Required |
| Billing | `billing@demo.medizinhub.local` | `DemoUser123` | Required |
| Back Office | `backoffice@demo.medizinhub.local` | `DemoUser123` | Required |

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
- `GET /api/v1/billing/invoices`
- `GET /api/v1/billing/invoices/{invoice_id}`
- `POST /api/v1/billing/invoices/{invoice_id}/payments`
- `POST /api/v1/billing/payments/{payment_id}/refund`
- `POST /api/v1/billing/invoices/{invoice_id}/cancel`
- `GET /api/v1/billing/doctor-settlements/summary`
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
