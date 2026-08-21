# Product and Roadmap

## Product Vision

MedizinHub HMS is a SaaS healthcare management platform for clinics, hospitals, diagnostics, pharmacies, care teams, and healthcare administrators. It should feel operationally fast for daily staff while preserving strong clinical, billing, audit, and tenant controls.

## Product Principles

- One patient record connects all care and revenue workflows.
- Every module respects tenant, branch, role, and entitlement boundaries.
- Operational users should reach common actions quickly.
- Clinical and financial records must be trustworthy and auditable.
- Workflows should scale from a small clinic to a multi-branch hospital network.
- SaaS packaging must allow modules to be enabled, disabled, and monetized.

## Primary Personas

| Persona | Primary needs |
| --- | --- |
| Platform owner | Tenant management, subscription packaging, support visibility |
| Tenant admin | Clinic setup, users, roles, branches, departments, settings |
| Reception | Patient registration, appointment booking, queue, payments |
| Doctor | Patient context, consultation notes, prescriptions, lab referrals |
| Lab staff | Orders, sample status, results, reports |
| Pharmacy staff | Prescriptions, medicine stock, issues |
| Billing staff | Invoices, payments, credits, settlements |
| IP staff | Admission, inpatient records, charges, discharge |
| Physiotherapy staff | Cases, plans, sessions, progress, billing |
| Home care staff | Visit booking, scheduling, service delivery |

## Module Catalog

| Module | Scope |
| --- | --- |
| Dashboard | Operational overview and quick navigation |
| Patients | Patient master, Patient 360, history, memberships |
| OPD Workspace | Appointments, schedule, consultation, lab referral, prescription, billing queues |
| Queue | Doctor and reception queue operations |
| Practitioners | Doctor and practitioner profiles |
| Scheduling | Practitioner availability and branch schedule |
| Consultation | Clinical notes, vitals, diagnosis, prescription, lab referral, sign-off |
| Lab | Test catalog, orders, samples, results, reports |
| Pharmacy | Medicine catalog, batches, stock, prescriptions, issues |
| Billing | Invoices, payments, credit notes, settlements |
| IP Admission | Inpatient admissions, treatment, charges, discharge |
| Physiotherapy | Cases, treatment plans, sessions, packages |
| Home Care | Visit booking, staff assignment, home care workflow |
| Reports | Operational, revenue, lab, and management reports |
| Error Logs | Client and server issue visibility |
| Admin | Users, roles, permissions, settings, templates, modules |
| Super Admin | Tenants, platform roles, platform users, cross-tenant administration |
| Notifications | In-app, WhatsApp, SMS and delivery status |
| Files | Uploads, protected documents, invoice and report storage |

## Patient Journey

1. Patient is registered.
2. Appointment is booked.
3. Patient enters queue.
4. Doctor opens consultation.
5. Doctor records clinical information and signs consultation.
6. Consultation may generate lab referral, prescription, invoice, follow-up, or IP conversion.
7. Lab, pharmacy, and billing complete their respective workflows.
8. Patient 360 shows complete history.
9. Notifications and reports support follow-up and operations.

## Differentiators

### Patient 360

Patient 360 should show linked clinical and financial context:

- Profile and demographics.
- Consultations.
- Appointments.
- Lab orders and reports.
- Pharmacy issues.
- Invoices and payments.
- IP admissions.
- Physiotherapy cases.
- Home care visits.
- Membership benefits.
- Patient intelligence where enabled.

### Unified OPD Workspace

OPD should combine:

- Appointments.
- Doctor schedule.
- Consultation.
- Lab referrals.
- Prescriptions.
- Billing queue.
- Payments queue.
- Templates.

The explicit consultation route is `/opd/consultation`.

### Configurable Revenue

Billing should support:

- Consultation fees.
- Service and item billing.
- Lab and pharmacy charges.
- Membership benefits.
- Discounts and offers.
- Payments and dues.
- Credit notes.
- Doctor settlement.

### Communication Layer

Communication should support:

- Operational in-app alerts.
- Appointment and billing messages.
- Invoice and receipt delivery.
- WhatsApp and SMS provider boundaries.
- Retry and delivery status.

## SaaS Packaging

Suggested packages:

| Plan | Target | Typical modules |
| --- | --- | --- |
| Starter | Small clinic | Patients, appointments, consultation, billing basics |
| Clinic | Growing clinic | Starter plus lab, pharmacy, reports |
| Hospital | Multi-department clinic or hospital | Clinic plus IP, advanced billing, settlements |
| Network | Multi-branch organization | Hospital plus platform controls, analytics, automation |
| Add-ons | Optional | Patient intelligence, WhatsApp/SMS, advanced storage, custom integrations |

Packaging rules:

- Module entitlements must affect UI and backend access.
- Trial tenants should have clear expiry and conversion path.
- Add-ons should not break base workflows when disabled.

## Roadmap

### Phase 1: Core Clinic MVP

- Tenant setup.
- Users, roles, permissions.
- Patients.
- Appointments.
- OPD consultation.
- Basic billing and payments.
- Basic reports.

### Phase 2: Real Clinic Operations

- Lab workflow.
- Pharmacy workflow.
- Queue maturity.
- Practitioner scheduling.
- Patient 360.
- In-app notifications.

### Phase 3: Revenue and Automation

- Advanced invoices.
- Credit notes.
- Settlements.
- Memberships and subscriptions.
- WhatsApp and SMS delivery.
- Scheduled reports.

### Phase 4: Hospital and Multi-Branch

- IP admission.
- Branch controls.
- Department controls.
- Multi-branch reporting.
- Production document storage.
- Stronger observability.

### Phase 5: Smart Healthcare Platform

- Patient intelligence.
- Automation insights.
- Advanced analytics.
- External ERP/accounting integration.
- AI-assisted but clinician-reviewed workflows.

## Production Readiness Priorities

1. Critical frontend and backend test expansion.
2. Production environment verification.
3. Backup and restore rehearsal.
4. Document storage production verification.
5. Release acceptance checklist.
6. Incident response and logging workflow.
7. Performance baseline and PgBouncer review.
8. Security and compliance review.

## Testing Roadmap

Priority 1:

- Critical frontend E2E for login, patients, OPD, billing, lab, pharmacy, home care, and admin.
- Backend permission and tenant isolation coverage.

Priority 2:

- Extended workflows for physiotherapy, IP, reports, communication, files, and subscriptions.
- Responsive and accessibility coverage.

Priority 3:

- Concurrency and database integrity tests.
- Provider integration tests with fakes.
- Backup and restore drills.

## Refactoring Priorities

Refactoring must preserve behavior and permissions.

Recommended order:

1. Low-risk structure cleanup.
2. Domain service extraction where routes are too heavy.
3. Shared billing and notification boundaries.
4. Storage and document delivery boundary hardening.
5. Clinical workflow and inventory logic cleanup.
6. Reporting and analytics extraction only after core workflows stabilize.

Stop conditions:

- Tenant isolation risk.
- Billing calculation risk without tests.
- Clinical record mutation risk.
- Migration uncertainty.
- No rollback path for production-sensitive changes.

## Product Acceptance Checklist

A module is production ready when:

- Main workflow is complete.
- List, create, edit, detail, empty, loading, and error states are handled.
- Permissions and module entitlement are enforced.
- Tenant and branch isolation are tested.
- Audit events exist for sensitive changes.
- Billing and notifications are integrated when needed.
- Documentation is updated.
- Operational support path is known.
