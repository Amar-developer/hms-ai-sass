# Backend Refactoring Implementation Strategy

## Purpose

This document converts the backend architecture assessment into an incremental
implementation strategy. The goal is to reduce file size, coupling, and
maintenance risk without changing existing API contracts or business behavior.

All refactoring work must preserve:

- Existing request and response schemas.
- Existing route paths and HTTP methods unless a compatibility route remains.
- Existing tenant, branch, RBAC, entitlement, audit, and workflow behavior.
- Existing database schema unless a migration is explicitly approved.
- Existing tests, with regression tests added before risky extractions.

## Refactoring Invariants

Every module refactor must pass these gates before merge:

1. No business rule changes are included in the refactor PR.
2. Current tests for the module pass unchanged before new tests are added.
3. New tests cover any extracted workflow path that was previously untested.
4. API route behavior is verified through existing integration tests.
5. Tenant isolation, branch scope, permission checks, and entitlement checks stay
   in the same execution path.
6. Audit and notification side effects remain in the same workflow position.
7. Transaction boundaries are documented before they are moved.
8. No cross-module import direction is worsened.

## Phase Ordering

The phases are ordered from low-risk modules to high-risk modules. Risk is based
on patient safety, revenue impact, transaction complexity, cross-module coupling,
and probability of API contract regression.

## Phase One: Low-Risk Structural Refactors

Phase one should only extract pure helpers, read mappers, repositories for simple
queries, and route grouping. It should not alter workflow decisions.

| Order | Module | Primary Files | Risk | Why First |
| --- | --- | --- | --- | --- |
| 1 | Modules manifest | `backend/app/modules/manifest.py` | Low | Mostly static registry data; can be split into data files without behavior changes. |
| 2 | Files | `backend/app/api/v1/files.py`, `backend/app/modules/files/service.py` | Low | Bounded CRUD/upload metadata workflow; good place to establish repository conventions. |
| 3 | Settings | `backend/app/api/v1/settings.py`, `backend/app/modules/settings/service.py`, `backend/app/modules/settings/numbering.py` | Low | Existing service layer exists; extraction can focus on clearer dependencies. |
| 4 | Notifications | `backend/app/api/v1/notifications.py`, `backend/app/modules/notifications/service.py` | Low | Natural adapter boundary for providers; mostly queue/read operations. |
| 5 | Audit | `backend/app/api/v1/audit.py`, `backend/app/modules/audit/service.py` | Low | Append/read behavior; can standardize repositories and keep audit contract stable. |
| 6 | Reports API shell | `backend/app/api/v1/reports.py` | Low-Medium | Route file can be separated from report generation before changing report internals. |

### Phase One Implementation Status

Implemented:

- Files: `FileDocumentRepository`.
- Settings: `AdminSettingRepository`, `DocumentSequenceRepository`.
- Notifications: `NotificationEventRepository`.
- Audit: `AuditEventRepository`.
- Reports API shell: `ReportJobRepository`,
  `MonthlyRevenueSnapshotRepository`.

Deferred:

- Modules manifest split. `backend/app/modules/manifest.py` is large but mostly
  static registry data. Splitting it is low risk, but it creates a broad diff
  with little runtime benefit, so it should be done only when module metadata is
  next edited or moved to a data file.

### Phase One Implementation Steps

For each module:

1. Add `repositories.py` only for database access already present in the route or
   service.
2. Add `services/` only when a function already performs a named use case.
3. Move response assembly helpers into `mappers.py` or a read service.
4. Keep route functions as thin wrappers around the extracted service.
5. Do not rename models, schemas, or public route handlers unless tests confirm
   OpenAPI output is stable.
6. Run the related module test file and the API docs test.

### Phase One Target Structure

```text
backend/app/modules/<module>/
  models.py
  schemas.py
  repositories.py
  service.py
  mappers.py

backend/app/api/v1/<module>.py
```

Use this simple structure before introducing nested route packages.

## Phase Two: Medium-Risk Domain Refactors

Phase two handles modules with real workflows but limited financial blast radius.
The goal is to separate controllers from business services while preserving
existing rules.

| Order | Module | Primary Files | Risk | Focus |
| --- | --- | --- | --- | --- |
| 1 | Patients | `backend/app/api/v1/patients.py` | Medium | Duplicate detection, search, alerts, patient summary read model. |
| 2 | Patient subscriptions | `backend/app/api/v1/patient_subscriptions.py`, `backend/app/modules/patient_subscriptions/service.py` | Medium | Plan/enrollment repositories, benefit preview service, usage sync audit. |
| 3 | Practitioners | `backend/app/api/v1/practitioners.py`, `backend/app/modules/practitioners/service.py` | Medium | Schedule, leave, room assignment, availability services. |
| 4 | Appointments | `backend/app/api/v1/appointments.py` | Medium | Booking command service, slot validation, queue integration boundary. |
| 5 | Consultations | `backend/app/api/v1/consultations.py` | Medium | Detail read service, sign command, addendum/template services. |
| 6 | Physiotherapy | `backend/app/api/v1/physiotherapy.py` | Medium | Case/session services, invoice integration adapter, consent upload. |
| 7 | Home care | `backend/app/api/v1/home_care.py` | Medium | Booking/visit services, invoice integration adapter. |

### Phase Two Implementation Status

Started:

- Patients: `PatientRepository`, `PatientAlertRepository`,
  `PatientSubscriptionReadRepository`, `PatientDuplicateService`,
  `PatientSearchService`, and patient read/search mappers.
- Patient subscriptions: `PatientSubscriptionPlanRepository`,
  `PatientSubscriptionEnrollmentRepository`, and
  `PatientSubscriptionSupportRepository`.
- Practitioners: `PractitionerRepository`, `PractitionerLinkRepository`,
  `PractitionerScheduleRepository`, `PractitionerReferenceRepository`,
  `PractitionerLeaveRepository`, `PractitionerRoomAssignmentRepository`, and
  `PractitionerAppointmentRepository`.
- Appointments: `AppointmentRepository`, `AppointmentReferenceRepository`, and
  `AppointmentGridRepository`.
- Consultations: `ConsultationRepository`, `ConsultationReferenceRepository`,
  `ConsultationDetailRepository`, `ConsultationStructuredRowRepository`,
  `ClinicalTemplateRepository`, and `ConsultationBillingReferenceRepository`.
- Physiotherapy: `PhysiotherapyEquipmentRepository`,
  `PhysiotherapyCaseRepository`, `PhysiotherapyReferenceRepository`,
  `PhysiotherapySessionRepository`, and `PhysiotherapyBillingRepository`.
- Home care: `HomeCareServiceRepository`, `HomeCareBookingRepository`,
  `HomeCareBookingItemRepository`, `HomeCareVisitLogRepository`,
  `HomeCareReferenceRepository`, and `HomeCareBillingRepository`.

Not started:

- None.

### Phase Two Implementation Steps

For each module:

1. Create repositories for aggregate roots and child collections.
2. Move one use case at a time into services, starting with read/detail methods.
3. Add command services for create/update/status workflows only after read
   services are stable.
4. Introduce adapters for billing, files, notifications, or audit when the module
   crosses a boundary.
5. Add tests around the old route before moving code if the workflow is not
   already covered.
6. Keep commits small: one route family or one use case per PR.

### Phase Two Target Structure

```text
backend/app/modules/<module>/
  models.py
  schemas.py
  repositories.py
  services/
    reads.py
    commands.py
    validation.py
  adapters.py
  mappers.py
```

## Phase Three: High-Risk Platform and Revenue Refactors

Phase three affects authorization, tenancy, subscription revenue, and operational
reports. These modules need stronger regression coverage before extraction.

| Order | Module | Primary Files | Risk | Focus |
| --- | --- | --- | --- | --- |
| 1 | Subscriptions | `backend/app/api/v1/subscriptions.py`, `backend/app/modules/subscriptions/service.py` | High | Tenant subscription lifecycle, credits, invoices, revenue reports. |
| 2 | Identity | `backend/app/api/v1/identity.py`, `backend/app/core/auth.py` | High | Auth, roles, permissions, session security, tenant admin guards. |
| 3 | Tenants | `backend/app/api/v1/tenants.py` | High | Onboarding, branch/department lifecycle, primary tenant bootstrap. |
| 4 | Reports service | `backend/app/modules/reports/service.py`, `backend/app/modules/reports/snapshots.py` | High | Long report builders, email attachments, revenue/profit correctness. |

### Phase Three Implementation Steps

1. Add characterization tests for every platform workflow before moving code.
2. Extract read services first.
3. Extract command services only with explicit transaction-boundary tests.
4. Move bootstrap and seeding-style helpers last.
5. Compare OpenAPI output before and after each route extraction.
6. Add authorization matrix tests when moving identity or tenant code.

## Phase Four: Highest-Risk Clinical, Inventory, and Billing Refactors

Phase four contains the workflows most likely to affect money, stock, or clinical
records. These modules should be refactored only after the previous phases prove
the extraction pattern.

| Order | Module | Primary Files | Risk | Focus |
| --- | --- | --- | --- | --- |
| 1 | Lab | `backend/app/api/v1/lab.py` | High | Catalog, packages, orders, samples, results, report PDFs, billing links. |
| 2 | Pharmacy | `backend/app/api/v1/pharmacy.py` | High | Purchases, returns, stock ledger, issues, billing links. |
| 3 | IP | `backend/app/api/v1/ip.py` | Very High | Admissions, treatments, medication, discharge, documents, invoice generation. |
| 4 | Billing | `backend/app/api/v1/billing.py`, `backend/app/modules/billing/service.py` | Very High | Invoice lifecycle, payments, refunds, adjustments, settlements, reports, PDFs. |

### Phase Four Implementation Steps

1. Add characterization tests around current business rules before extraction.
2. Extract read/detail assemblers first, because they have lower write risk.
3. Extract pricing and calculation helpers as pure functions with unit tests.
4. Introduce invoice source strategies behind existing endpoints.
5. Introduce repositories with explicit locking methods for stock, payments, and
   room/bed/invoice state.
6. Move transaction commits only after service methods have tests for partial
   failure and rollback expectations.
7. Keep old routes as compatibility wrappers until all tests pass.

## Business Logic Audit Checklist

Use this checklist for every extracted use case.

### Tenant and Access Logic

- Does every tenant-scoped query include `tenant_id`?
- Does every branch-scoped query include or validate `branch_id`?
- Does super admin behavior match the existing path?
- Does tenant admin behavior remain tenant-limited?
- Are RBAC permissions enforced before sensitive reads/writes?
- Are subscription entitlements enforced before module operations?

### Workflow Logic

- Are status transitions identical before and after extraction?
- Are duplicate checks preserved?
- Are validation error status codes and messages preserved where tests rely on
  them?
- Are audit events recorded for the same user/action/entity?
- Are notifications queued under the same conditions?
- Are generated document numbers unchanged?

### Financial Logic

- Are subtotal, discount, tax, total, paid, balance, doctor share, and clinic
  share calculations unchanged?
- Are membership benefits applied once and ledgered once?
- Are refunds and credit notes idempotency rules preserved?
- Are settlement calculations unchanged?
- Are invoice source links preserved for consultation, lab, pharmacy, IP,
  physiotherapy, home care, and subscriptions?

### Clinical and Inventory Logic

- Are consultation sign/addendum rules unchanged?
- Are lab result/sample/order status rules unchanged?
- Are pharmacy stock increments/decrements unchanged?
- Are IP room/bed locking and medication administration rules unchanged?
- Are patient alert and duplicate detection rules unchanged?

### Transaction Logic

- Does each command commit exactly once?
- Are multi-step workflows atomic where they were previously atomic?
- Are explicit row locks preserved?
- Are rollbacks preserved for failed downstream billing/file/report operations?

## Design Pattern Rollout

### Repository Pattern

Start in phase one with simple repositories:

```text
FileDocumentRepository
AdminSettingRepository
AuditEventRepository
NotificationRepository
```

Move to aggregate repositories later:

```text
PatientRepository
AppointmentRepository
InvoiceRepository
LabOrderRepository
PharmacyStockRepository
IPAdmissionRepository
```

### Service Pattern

Services should represent use cases:

```text
PatientSearchService
AppointmentBookingService
ConsultationSigningService
InvoiceCommandService
PaymentCommandService
```

### Factory Pattern

Use factories when building domain records with repeated defaulting:

```text
InvoiceFactory
NotificationEventFactory
ReportJobFactory
FileDocumentFactory
```

### Strategy Pattern

Use strategies for invoice creation sources:

```text
ConsultationInvoiceStrategy
LabOrderInvoiceStrategy
PharmacyIssueInvoiceStrategy
IPAdmissionInvoiceStrategy
PhysiotherapyCaseInvoiceStrategy
HomeCareBookingInvoiceStrategy
SubscriptionInvoiceStrategy
```

### Builder Pattern

Use builders for complex documents:

```text
ReceiptPdfBuilder
LabReportPdfBuilder
DischargeSummaryPdfBuilder
MonthlyRevenueReportBuilder
ProfitReportAttachmentBuilder
```

### Adapter Pattern

Use adapters for external or cross-boundary systems:

```text
StorageAdapter
NotificationProviderAdapter
EmailProviderAdapter
BillingAdapter
CatalogIntegrationAdapter
```

### Dependency Injection

Use FastAPI dependency providers for services:

```text
get_file_service
get_patient_service
get_invoice_service
```

Do not instantiate services directly inside route handlers once a module has
entered refactoring.

## Module-by-Module First Moves

### Files

- Current responsibilities: upload/download, metadata sync, file status.
- First extraction: `FileDocumentRepository`, `FileReadService`,
  `FileCommandService`.
- Business audit: authorization, tenant/branch filters, physical file path
  validation, inactive file behavior.

### Settings

- Current responsibilities: setting upsert, resolve, bundle, numbering.
- First extraction: `SettingsRepository`, `SettingsResolver`,
  `DocumentNumberService`.
- Business audit: scope precedence, branch fallback, module key behavior,
  numbering sequence locks.

### Patients

- Current responsibilities: CRUD, duplicate detection, search, alerts, summary.
- First extraction: `PatientRepository`, `PatientSearchService`,
  `PatientDuplicateService`.
- Business audit: duplicate matching, search filters, patient limit enforcement,
  alert visibility.

### Appointments

- Current responsibilities: booking, follow-up, listing, platform listing.
- First extraction: `AppointmentRepository`, `AppointmentReferenceRepository`,
  and `AppointmentGridRepository`.
- Business audit: slot availability, queue creation, no double booking,
  branch/doctor constraints.

### Consultations

- Current responsibilities: creation, detail reads, updates, signing,
  addendums, clinical templates, follow-up notification trigger, and
  membership auto-invoice trigger.
- First extraction: `ConsultationRepository`, `ConsultationReferenceRepository`,
  `ConsultationDetailRepository`, `ConsultationStructuredRowRepository`,
  `ClinicalTemplateRepository`, and `ConsultationBillingReferenceRepository`.
- Business audit: draft-to-signed immutability, appointment/queue completion,
  tenant isolation, structured clinical rows, addendum timing, and membership
  invoice creation.

### Physiotherapy

- Current responsibilities: equipment catalog, case lifecycle, consent upload,
  treatment sessions, invoice generation, and invoice status sync.
- First extraction: `PhysiotherapyEquipmentRepository`,
  `PhysiotherapyCaseRepository`, `PhysiotherapyReferenceRepository`,
  `PhysiotherapySessionRepository`, and `PhysiotherapyBillingRepository`.
- Business audit: module entitlement, branch access, patient/source/IP
  validation, physiotherapist validation, invoice-after-session lock,
  session numbering, tax calculation, fee sharing, and paid/completed status
  sync.

### Home Care

- Current responsibilities: service catalog, booking lifecycle, planned
  services, visit logs, invoice generation, and invoice status sync.
- First extraction: `HomeCareServiceRepository`, `HomeCareBookingRepository`,
  `HomeCareBookingItemRepository`, `HomeCareVisitLogRepository`,
  `HomeCareReferenceRepository`, and `HomeCareBillingRepository`.
- Business audit: module entitlement, branch access, patient/staff validation,
  locked booking states, planned-service replacement, visit billing rules,
  cancelled/refunded invoice handling, tax calculation, and paid/invoiced
  status sync.

### Billing

- Current responsibilities: rules, invoice generation, payments, refunds,
  adjustments, PDFs, settlements, reports.
- First extraction: read/detail service and PDF builder only.
- Business audit: every amount calculation, ledger entry, payment status,
  membership benefit, refund, credit note, and settlement.

## Verification Commands

Run targeted checks after each module:

```bash
backend/.venv/bin/ruff check backend/app backend/tests
backend/.venv/bin/pytest backend/tests/test_api_docs.py -q
backend/.venv/bin/pytest backend/tests/test_<module>.py -q
```

Run broader checks after each phase:

```bash
backend/.venv/bin/pytest backend/tests -q
npm test
```

## Stop Conditions

Pause refactoring and investigate if any of these occur:

- A route response shape changes unexpectedly.
- A permission or entitlement test fails.
- A billing, stock, clinical, or tenant isolation assertion changes.
- A service extraction requires changing a model/schema.
- A transaction boundary becomes unclear.
- A module import cycle is introduced.
