# MedizinHub HMS Developer Handover Pack

This pack is the starting point for any developer joining MedizinHub HMS. Read this before changing code.

## Project Snapshot

MedizinHub HMS is a smart healthcare SaaS platform for Indian clinics, polyclinics, multi-speciality hospitals, and multi-branch healthcare groups. It currently uses:

- Frontend: Next.js app router, React, Tailwind CSS, lucide-react icons.
- Backend: FastAPI, SQLModel, Alembic.
- Database: PostgreSQL for team development through Docker Compose.
- Local support services: Redis placeholder for queue/worker expansion.
- Architecture style: MedizinHub API is the application service layer. Frontend must not call ERPNext or external providers directly.

## Local Run

Use Docker for PostgreSQL/Redis and run backend/frontend normally on the Mac/Windows/Linux host.

```bash
cd /Users/balaji/dev/medizinhub_hms
docker compose up -d postgres redis

cd backend
source .venv/bin/activate

MEDIZINHUB_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms" .venv/bin/alembic upgrade head
MEDIZINHUB_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms" .venv/bin/python -m scripts.seed_demo
MEDIZINHUB_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms" .venv/bin/uvicorn app.main:app --reload --port 8000
```

To wipe local demo rows and rebuild the seeded MedizinHub HMS demo dataset from a clean database:

```bash
MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV MEDIZINHUB_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms" .venv/bin/python -m scripts.reset_demo_data
```

Frontend:

```bash
cd /Users/balaji/dev/medizinhub_hms
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open:

- Frontend: `http://127.0.0.1:3000`
- Backend Swagger: `http://localhost:8000/docs`

Important: Docker PostgreSQL is mapped to host port `5433` because many Macs already run local PostgreSQL on `5432`.

## Demo Credentials

After running `python -m scripts.seed_demo`:

| User | Email | Password |
| --- | --- | --- |
| Super Admin | `super.admin@demo.medizinhub.local` | `SuperPass123` |
| Tenant Admin | `tenant.admin@demo.medizinhub.local` | `DemoPass123` |
| Reception | `reception@demo.medizinhub.local` | `DemoUser123` |
| Doctor | `doctor@demo.medizinhub.local` | `DemoUser123` |
| Lab Technician | `lab@demo.medizinhub.local` | `DemoUser123` |
| Pharmacy | `pharmacy@demo.medizinhub.local` | `DemoUser123` |
| Billing | `billing@demo.medizinhub.local` | `DemoUser123` |
| Back Office | `backoffice@demo.medizinhub.local` | `DemoUser123` |

The login screen only needs email and password. Tenant, role, and privileges are detected from backend auth.

## Important Current Limitations

- Frontend feature screens, shell, shared constants, auth presets, backend row mappers, and app controller state are modularized.
- Consultation data now supports structured vitals, complaints, diagnosis rows, prescription items, lab/scan referrals, follow-up advice, doctor review, fitness certificate treatment type, immutable signing, and addendums. Diagnosis/procedure coding and richer clinical templates still need production depth.
- Lab now supports test catalog, packages, structured order items, sample barcode tracking, result templates, report URL/PDF, report-ready notification queueing, and consultation visibility. Device integration and abnormal-result acknowledgement are still pending.
- Pharmacy now supports medicine catalog, suppliers, GST-aware purchase workflow with purchase date, PO id, supplier and line discounts, CGST/SGST, batches/expiry, expired stock returns, stock ledger, structured issue items, substitutes, low-stock alerts, stock-safe dispensing, and billing invoice linkage. Controlled medicine restrictions and final statutory invoice formatting still need production policy depth.
- Billing now has GST/tax rules, discount approval, receipt PDF, credit notes, refund guardrails, due reports, doctor settlement finalization, payment references, and revenue reports. ERPNext accounting sync is still pending.
- Notifications are queued only; real WhatsApp/SMS/voice provider adapters are pending.
- ERPNext is not integrated yet; it should be added through adapter/sync-event modules.
- Production security needs backup/restore, monitoring, rate limits, deployment secrets, and compliance review.

## Codebase Map

Backend:

- `backend/app/main.py`: FastAPI app factory.
- `backend/app/api/router.py`: central router registration.
- `backend/app/api/v1/*`: API route modules.
- `backend/app/modules/*`: domain models, schemas, services.
- `backend/app/core/auth.py`: bearer session and RBAC dependencies.
- `backend/app/core/database.py`: SQLModel engine/session setup.
- `backend/alembic/versions/*`: migrations.
- `backend/scripts/seed_demo.py`: idempotent demo data.
- `backend/scripts/reset_demo_data.py`: guarded local demo-data reset and reseed command.
- `backend/tests/*`: backend contract tests.

Frontend:

- `app/page.tsx`: thin Next.js page that chooses login vs authenticated shell.
- `features/admin/TenantAdmin.tsx`: extracted tenant admin module for roles, users, and branch/tenant settings.
- `features/appointments/AppointmentCalendarBooking.tsx`: first extracted feature module; use this pattern for future frontend splits.
- `features/auth/AuthScreen.tsx`: extracted login screen with demo credential shortcuts.
- `features/auth/ChangePassword.tsx`: extracted change password modal.
- `features/billing/Billing.tsx`: extracted billing module for invoice generation and payment recording.
- `features/dashboard/Dashboard.tsx`: extracted dashboard cards and live backend summary.
- `features/doctor/DoctorConsultation.tsx`: extracted doctor consultation module for queue selection, draft save, and sign/lock.
- `features/ip/IPAdmission.tsx`: extracted IP admission module.
- `features/lab/Lab.tsx`: extracted lab module for catalog/tests, packages, templates, OP direct orders, consultation referrals, sample collection, result release, and report PDF access.
- `features/patients/Patient.tsx`: extracted Patient module for registry, summary, alerts, risk notes, and timeline.
- `features/pharmacy/Pharmacy.tsx`: extracted pharmacy module for OP direct issues, doctor prescriptions, and dispense workflow.
- `features/platform/SuperAdminDashboard.tsx`: extracted super admin tenant, plan dashboard, template assignment, and tenant onboarding wizard.
- `features/practitioners/Practitioners.tsx`: extracted practitioner listing module.
- `features/queue/TokenQueue.tsx`: extracted token queue module for call, skip/not available, requeue, and cancel actions.
- `features/reports/Reports.tsx`: extracted revenue and operational reports module.
- `features/scheduling/Scheduling.tsx`: extracted practitioner scheduling display module.
- `features/shell/AppShell.tsx`: extracted authenticated shell, sidebar, header selectors, change-password mount, and route switch.
- `features/shell/useAppController.ts`: shared app controller hook for auth/session state, tenant live-data loading, clinic/branch/department scope, and shell props.
- `features/shared/SimpleList.tsx`: shared fallback list component for mock-only screens.
- `features/shared/Info.tsx`: shared compact key/value display component.
- `features/subscriptions/Subscriptions.tsx`: extracted subscription plan display module.
- `components/ui.tsx`: shared Card/Input/Button/Badge UI.
- `lib/api.ts`: shared API base URL, session type, and authenticated fetch helper.
- `lib/authPresets.ts`: shared demo user labels and login presets.
- `lib/liveData.ts`: shared live summary type and backend row mapping helpers.
- `lib/moduleAccess.ts`: shared module access helper used by the shell controller.
- `lib/mockData.ts`: fallback demo data.
- `lib/navigation.ts`: shared navigation items and role-to-module access map.
- `lib/hmsLogic.ts`: frontend helper logic.

Docs:

- `docs/product-blueprint.md`: product behavior and scope.
- `docs/backend-architecture-spec.md`: architecture and integration rules.
- `docs/db-design-erd-production-gaps.md`: schema, ERD, and production gaps.
- `docs/api-permission-matrix.md`: endpoint and RBAC matrix.
- `docs/developer-setup.md`: OS-specific install/run guide.
- `docs/module-development-guide.md`: required module structure, tests, permissions, entitlement, audit, and PR checklist.

## Development Rules

- Every backend endpoint must enforce tenant isolation unless it is explicitly platform/public.
- Every protected endpoint must use a permission dependency or super admin dependency.
- `MedizinHub HMS` is the primary tenant. Super admin users belong to this primary tenant and can access all tenants; tenant users must only access their own tenant.
- The primary tenant cannot be deleted, suspended, renamed away from `MedizinHub HMS`, or changed from tenant type `primary`.
- Customer tenant types are `single_clinic`, `poly_clinic`, `hospital`, and `super_multi_speciality`.
- Platform tenant management stores tenant name, legal name, description, logo URL, email, phone, address, country, timezone, tenant type, and lifecycle status.
- Important patient data views must create audit events.
- Frontend must call MedizinHub HMS API, not ERPNext or provider APIs directly.
- Add or update tests when adding behavior. Minimum: one success path and one authorization/validation failure for new backend APIs.
- For schema changes, add Alembic migration and keep seed data working on PostgreSQL.
- Keep SaaS entitlements and admin settings connected to live workflows, not just stored.

## Verification Commands

Backend:

```bash
backend/.venv/bin/python -m pytest
backend/.venv/bin/ruff check backend/app backend/tests backend/scripts
```

Frontend:

```bash
npm test
npm run build
```

Database migration check:

```bash
MEDIZINHUB_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms" backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
```

## Recommended Next Tasks

This list contains pending recommended work only. Already completed foundation tasks are intentionally not repeated here.

1. Strengthen Patient, Appointment, and Queue production workflows.
   Core backend workflows are now in place for duplicate patient detection, duplicate appointment prevention by patient/doctor/slot, follow-up booking, doctor review/free-review tracking, fitness certificate visit tracking, emergency override audit, token display mode, and Tamil/English token calling. Remaining depth should focus on tablet reception UX polish, printed token slips, configurable free-review validity automation, and reporting dashboards by visit purpose.

2. Complete SaaS revenue operations.
   The foundation now supports custom plans, scheduled subscription assignment, upgrades, additional patient credits, subscription invoices, usage summaries, revenue summary, and tenant-facing announcements. Next, add paid invoice settlement, payment gateway reconciliation, failed payment recovery, GST/tax reporting, plan-wise MRR charts, and exportable revenue reports.

3. Build multilingual and regionalization foundation.
   Add English/Tamil launch support, patient/user preferred language, tenant/branch default language settings, language-aware notification templates, consent language/version tracking, Tamil token calling, and PAN India language-pack architecture.

4. Polish tablet, mobile, and PWA experience.
    Add installable PWA support, compact mobile navigation, touch-friendly action bars, responsive card layouts for tables, doctor tablet mode, reception tablet mode, and resilient queue/appointment views.

5. Add ERPNext adapter through backend integration layer.
    Add integration sync events and adapters for accounting ledger, sales invoice sync, payment entry sync, pharmacy inventory/purchase sync, and optional HR/payroll. ERPNext must not own clinical records.

6. Add production readiness hardening.
    Follow `docs/production-readiness-plan.md` to add complete tenant/role/module automated tests, PostgreSQL CI, Alembic migration safety tests, deployment config, monitoring, backup/restore runbooks, consent, retention, audit export, breach workflow, ABDM readiness, load tests, and tablet/mobile responsive QA gates.
