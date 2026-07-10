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

### Phase Three Implementation Status

Started:

- Subscriptions: `SubscriptionPlanRepository`,
  `SubscriptionTenantRepository`, `TenantSubscriptionRepository`,
  `SubscriptionCreditRepository`, `SubscriptionInvoiceRepository`, and
  `SubscriptionRevenueRepository`.
- Identity: `IdentityTenantRepository`, `IdentityUserRepository`,
  `IdentityPermissionRepository`, `IdentityRoleRepository`,
  `IdentityRolePermissionRepository`, `IdentityUserRoleRepository`, and
  `IdentityAuthSessionRepository`.
- Identity Slice 2: extracted permission, role, user, read-mapping, tenant
  bootstrap, and role-template helpers into
  `backend/app/modules/identity/services/helpers.py`, reducing the Identity
  router below 1000 lines while preserving route contracts.
- Tenants Slice 1: added `TenantRepository`, `BranchRepository`, and
  `DepartmentRepository`, and rewired the tenant router to use tenant,
  branch, department, audit, identity, and subscription repositories instead of
  direct session query primitives.
- Tenants Slice 2: extracted tenant access guards, unique-value validation,
  branch/department lookup helpers, tenant-admin role seeding, and role,
  branch, and department template-copy helpers into
  `backend/app/modules/tenants/services/helpers.py`.
- Tenants Slice 3: extracted `/tenants/onboard` orchestration into
  `backend/app/modules/tenants/services/onboarding.py`, keeping the API route
  as a thin delegation layer while preserving onboarding validation,
  subscription setup, branch creation, template assignment, admin-user seeding,
  and audit behavior.
- Tenants Slice 4: extracted branch create, update, template assignment,
  status-change, and soft-delete workflows into
  `backend/app/modules/tenants/services/branch_service.py`, reducing the
  tenant router below the 1000-line target.
- Reports service Slice 1: split the 1362-line report service into a stable
  `backend/app/modules/reports/service.py` facade plus focused modules for
  monthly revenue building, profit attachment building, shared financial
  calculations, invoice classification strategy, and XLS/HTML rendering. The
  public API imports and report business formulas are preserved.
- Reports service Slice 2: added `ReportDataRepository` and rewired monthly
  revenue and profit report builders to load tenants, invoices, invoice items,
  appointments, patients, practitioners, departments, lab catalog/package rows,
  suppliers, pharmacy issue items, and medicines through repository methods
  instead of direct SQLModel calls. Report formulas and attachment rendering are
  unchanged.

Not started:

- Reports service repository/query extraction for snapshot data loading.

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

### Phase Four Implementation Status

Started:

- Lab Slice 1: added `LabCatalogRepository`, `LabReferenceRepository`,
  `LabOrderRepository`, and `LabResultTemplateRepository`, then rewired low-risk
  read/data-loading paths for consultation referrals, catalog availability,
  popular tests, package reads, result template reads, order list/detail reads,
  patient/branch validation, and order lookup. Lab command workflows for
  order creation, sample collection, result release, status transitions,
  notifications, files, and audit remain on the existing execution path.
- Lab Slice 2: extended `LabCatalogRepository` with tenant-scoped test/package
  lookups plus package-item add/replace helpers, then rewired order item
  assembly, zero-price repricing, catalog test update/delete, package
  create/update/delete, and result-template test validation to use those
  helpers. Existing commits, audit recording, pricing rules, and command
  validation messages are preserved.
- Lab Slice 3: added consultation lookup and consultation-order lookup helpers,
  then rewired direct order creation, consultation-derived order creation,
  structured referral loading, sample/result item reads, and lab-result patient
  notification lookup through repositories. The Lab route no longer performs
  direct `session.get`, `session.exec`, or `select` calls; commits, audit,
  notification, file, pricing, and status-transition logic remain in the same
  route execution order.
- Lab Slice 4: extracted catalog matching, fallback referral parsing, PDF
  byte generation, patient/branch/order guards, catalog normalization, pricing
  payload helpers, order item assembly/repricing, and read mappers into
  `backend/app/modules/lab/services/helpers.py`. The API router now delegates
  helper work while keeping route paths, response models, commits, audit,
  notifications, and pricing behavior unchanged.
- Pharmacy Slice 1: added `PharmacyCatalogRepository`,
  `PharmacyReferenceRepository`, `PharmacySupplierRepository`,
  `PharmacyIssueRepository`, and `PharmacyStockRepository`, then rewired
  low-risk read/data-loading paths for medicine catalog lists, available and
  popular medicines, suppliers, issue detail/list reads, batches, stock ledger,
  low-stock reads, patient/branch validation, issue lookup, and stock balance.
  Purchase, return, dispense, billing-link, and issue command transaction logic
  remain on the existing execution path.
- Pharmacy Slice 2: extended pharmacy repositories with non-locking batch
  lookup, consultation lookup, consultation medicine reads, and existing issue
  lookup by consultation. Rewired issue item assembly, purchase medicine
  validation, direct issue consultation validation, and consultation-derived
  issue creation reads to use repositories. Return and dispense stock-locking
  queries remain in the route until a dedicated stock transaction slice.
- Pharmacy Slice 3: moved stock-locking batch reads and issue-item reloads into
  `PharmacyStockRepository` and `PharmacyIssueRepository`. Return and dispense
  routes now depend on repository methods for `FOR UPDATE` reads while
  preserving the existing validation, decrement, ledger, audit, and commit
  order in the route.
- Pharmacy Slice 4: extracted pharmacy helper/service concerns into
  `backend/app/modules/pharmacy/services/helpers.py`, including catalog item
  normalization, issue/detail mapping, purchase response building,
  consultation-derived issue item assembly, stock ledger recording, dispense
  item processing, and low-stock row construction. The pharmacy route is now
  below 1000 lines while preserving existing endpoints and transaction flow.
- IP Slice 1: added `IPAdmissionRepository`, `IPRoomRepository`,
  `IPReferenceRepository`, `IPBillingRepository`, and `IPCatalogRepository`,
  then rewired low-risk room/admission reads, admission lookup, room occupancy
  checks, locked room lookup, document reads, invoice-detail item reads,
  billing-item dedupe, medication/treatment billing source reads, and
  lab/pharmacy catalog price lookups. Clinical state transitions, discharge,
  medication administration, and invoice generation remain on the existing
  route execution path.
- IP Slice 2: added `IPClinicalRepository` and rewired clinical reads/lookups
  for treatment lists, consultation signing, consent signing, discharge summary
  finalization/PDF export, medication order lookup/listing, and medication
  administration listing. Existing clinical create/sign/finalize business
  rules, audit events, billing item side effects, and commits remain in the
  route execution path.
- IP Slice 3: extended `IPBillingRepository` with invoice lookup, charge
  listing, billing-item listing, and invoice-item cleanup helpers, then rewired
  discharge finalization invoice checks, charge/billing-item list endpoints,
  invoice detail reads, invoice generation source reads, existing-invoice
  lookup, room-rate lookup, and invoice-item cleanup. The IP route no longer
  performs direct `session.get`, `session.exec`, `select`, or `delete` calls;
  invoice calculations, invoice creation/update, audit events, and commits
  remain in the route execution path.
- IP Slice 4: extracted IP helper/service concerns into
  `backend/app/modules/ip/services/helpers.py`, including room availability
  mapping, admission create/update orchestration, document upload assembly,
  clinical create/sign/finalize helpers, invoice detail mapping, billing-item
  creation, care-item invoice discovery, and IP invoice generation. The IP
  route is now below 1000 lines while preserving existing endpoints,
  validations, audit events, and transaction order.
- Billing Slice 1: added `BillingReadRepository` and rewired low-risk billing
  read paths for invoice listing, invoice lookup, invoice detail child rows
  (items, payments, credit notes, ledger entries), adjustment request reads,
  actor/supplier name lookup, invoice payment methods, appointment type lookup,
  and consultation vendor lookup. Invoice creation, payment, refund,
  cancellation, amendment, membership benefit, settlement, and report
  calculations remain on the existing execution path.
- Billing Slice 2: extended `BillingReadRepository` with ledger-existence
  checks, payment aggregate totals, refundable payment totals, issued credit
  note totals, invoice payment rows locked for refund allocation, and direct
  payment lookup `FOR UPDATE`. Rewired invoice ledger guard checks,
  `update_invoice_payment_status`, `refundable_paid_total`, refund allocation,
  and direct payment refund lookup while preserving all payment/refund status
  calculations and mutations.
- Billing Slice 3: added `BillingReferenceRepository` for rule/catalog/reference
  reads and rewired fee-rule selection, tax-rule selection/list/update,
  discount-offer selection/list/update, doctor-fee duplicate detection,
  practitioner/department validation, lab catalog supplier option lookup, and
  supplier-name lookup. Existing rule scoring, discount calculation, endpoint
  validation, update behavior, and audit events remain unchanged.
- Billing Slice 4: added `BillingSourceRepository` for source invoice
  references and rewired consultation, lab-order, and pharmacy-issue invoice
  source reads, existing-source invoice lookup, source item listing, catalog
  price lookup, appointment/patient lookup, and invoice item sync reads. The
  API layer still owns validation, audit events, transaction boundaries,
  duplicate-consultation locking, and invoice creation calls.
- Billing Slice 5: added `BillingAdjustmentRepository` for invoice
  adjustment/cancel/amend reads and rewired amount-edit invoice lookup, first
  invoice-item lookup, fee-rule lookup, adjustment request lookup, locked
  adjustment execution lookup, locked cancel invoice lookup, and amend invoice
  lookup. Adjustment amount validation, refund/cancel execution, ledger writes,
  audit events, and commit order remain unchanged.
- Billing Slice 6: added `BillingPaymentRepository` for credit-note/payment
  source reads and rewired credit-note invoice lookup, payment-recording invoice
  lookup, payment-reminder patient lookup, direct payment refund locked-payment
  lookup, and refund invoice lookup. Payment validation, refund amount
  calculation, ledger writes, source sync, notification enqueueing, and audit
  behavior remain unchanged.
- Billing Slice 7: added `BillingInvoiceSupportRepository` for invoice support
  reads and rewired invoice-item supplier invoice/item lookup, supplier option
  invoice/item lookup, membership-benefit invoice lookup, membership lab/pharmacy
  source item reads, and receipt PDF tenant/branch/patient/item/payment loading.
  Supplier validation, membership preview/apply rules, PDF rendering, settings
  resolution, audit events, and commit order remain unchanged.
- Billing Slice 8: added `BillingSettlementReportRepository` for settlement
  and billing report queries, then rewired doctor-settlement invoice rows,
  finalized settlement rows, due-collection invoice rows, and revenue report
  invoice/appointment rows. Settlement calculations, report grouping, payable
  amount logic, settlement creation, audit events, and response shapes remain
  unchanged.
- Billing Slice 9: added `BillingSourceSyncRepository` for source reversal/sync
  lookups and rewired physiotherapy case status sync, home-care booking status
  sync, patient subscription payment sync, and pharmacy issue billing-link sync
  to load source records through repository methods. Status target rules,
  membership paid-amount rules, source mutations, commit order, and reversal
  behavior remain unchanged.
- Billing Slice 10: extracted receipt PDF rendering helpers into
  `backend/app/modules/billing/services/receipt_pdf.py` and rewired the receipt
  endpoint to call `build_receipt_pdf`. PDF layout, logo parsing, bank-details
  rendering, receipt filename generation, setting resolution, and route response
  behavior remain unchanged while reducing the Billing API module by roughly
  800 lines.
- Billing Slice 11: extracted invoice membership helper logic into
  `backend/app/modules/billing/services/membership.py` and rewired invoice detail
  membership preview, membership-benefit application, and revenue report
  membership service classification to call the service helpers. Subscription
  preview/apply calls, free-item consumption, tax recalculation, payment-status
  update, commits, and validation messages remain unchanged.
- Billing Slice 12: extracted invoice read/detail mapping into
  `backend/app/modules/billing/services/read_models.py`, including invoice read
  shaping, payment-method summary, adjustment request reads, invoice status
  normalization, invoice detail item/payment/credit-note/ledger assembly, vendor
  display fields, and membership preview attachment. Ledger safeguard callbacks
  still run before detail assembly, preserving side effects and response shapes.
- Billing Slice 13: extracted adjustment/refund helper logic into
  `backend/app/modules/billing/services/adjustments.py`, including adjustment
  amount validation, open-adjustment guard checks, refund payment allocation,
  cancel execution, refund credit-note creation, refund ledger calls, and refund
  audit emission. Existing route calls now pass ledger/source-sync callbacks so
  ledger writes, source reversal, commits, and audit payloads stay in the same
  order.
- Billing Slice 14: extracted generic service invoice creation into
  `backend/app/modules/billing/services/service_invoices.py` and kept the API
  route wrapper signature stable for lab/pharmacy callers. Offer/tax selection,
  membership preview and free-item consumption, invoice row creation, invoice
  item creation, ledger callbacks, membership-benefit ledger callbacks, commits,
  and refresh order remain unchanged.
- Billing Slice 15: extracted lab/pharmacy source invoice orchestration into
  `backend/app/modules/billing/services/source_invoices.py` while keeping route
  contracts stable. Source validation, cancelled-source conflict checks, branch
  access checks, lab catalog price sync, existing-invoice reuse, pharmacy
  billing-link sync, line-item building, membership benefit inputs, audit events,
  payment-status refresh, commits, and response shaping remain unchanged.
- Billing Slice 16: extracted non-OP consultation invoice amount editing into
  `backend/app/modules/billing/services/invoice_amounts.py` and added the
  required appointment read method to `BillingAdjustmentRepository`. The API
  route now only binds HTTP inputs and delegates to the service; entitlement,
  branch access, edit eligibility checks, offer/tax/doctor-share recalculation,
  invoice item update, appointment custom-fee sync, transaction handling, audit
  diff logging, payment-status refresh, and response shaping remain unchanged.
- Billing Slice 17: extracted invoice item supplier update and supplier-option
  lookup into `backend/app/modules/billing/services/invoice_items.py`. The API
  routes now only bind HTTP inputs and delegate to the service; lab-invoice
  eligibility checks, branch access, invoice-item lookup, external supplier
  option resolution, supplier validation, buying-price update, transaction
  handling, audit diff logging, and response shaping remain unchanged.
- Billing Slice 18: moved invoice membership-benefit application orchestration
  into `backend/app/modules/billing/services/membership.py`. The API route now
  only binds HTTP inputs and delegates to the service; entitlement, invoice
  lookup, branch access, membership apply rules, membership-benefit ledger
  ensure, audit diff logging, and response shaping remain unchanged.
- Billing Slice 19: moved receipt PDF data loading, settings resolution, PDF
  rendering orchestration, and receipt filename generation into
  `backend/app/modules/billing/services/receipt_pdf.py`. The API route now only
  binds HTTP inputs, calls the receipt service, and returns the FastAPI
  `Response`; invoice lookup, branch access, tenant/branch/patient/item/payment
  reads, invoice-logo and bank-details settings behavior, filename sanitization,
  PDF bytes, media type, and content-disposition contract remain unchanged.
- Billing Slice 20: extracted credit-note creation into
  `backend/app/modules/billing/services/credit_notes.py`. The API route now only
  binds HTTP inputs and delegates to the service; invoice lookup, branch access,
  closed-invoice and amount validations, credit-note number generation,
  transaction handling, payment-status refresh, billing-ledger write,
  source-reversal sync, audit event creation, and response model contract remain
  unchanged.
- Billing Slice 21: extracted payment recording into
  `backend/app/modules/billing/services/payments.py`. The API route now only
  binds HTTP inputs and delegates to the service; entitlement, invoice lookup,
  branch access, closed-invoice and balance validations, payment creation,
  transaction handling, payment-status refresh, billing-ledger write,
  physiotherapy/home-care/membership source sync, payment reminder notifications,
  audit diff logging, and response shaping remain unchanged.

Not started:

- Billing write/calculation/service extractions beyond receipt rendering.

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

### Reports Service

- Current responsibilities: monthly report configuration, report job
  processing, SMTP email delivery, revenue/profit calculation, invoice
  classification, HTML/XLS attachment rendering, and month-end snapshots.
- First extraction: `services/calculations.py`,
  `services/classification.py`, `services/monthly_revenue.py`,
  `services/profit.py`, and `services/rendering.py`.
- Business audit: paid-invoice qualification, settlement paid-basis formula,
  line-level revenue/discount allocation, lab/pharmacy purchase-cost
  allocation, home-visit classification, snapshot grace-window behavior, and
  report attachment names.

### Billing

- Current responsibilities: rules, invoice generation, payments, refunds,
  adjustments, PDFs, settlements, reports.
- First extraction: read/detail service and PDF builder only.
- Business audit: every amount calculation, ledger entry, payment status,
  membership benefit, refund, credit note, and settlement.

## Phase Five Progress

- Lab Slice 1: split reusable lab helper responsibilities into named service
  modules under `backend/app/modules/lab/services/`: `catalog.py` for catalog
  matching, local item normalization, and pricing payloads; `referrals.py` for
  consultation referral fallback parsing and read mapping; `documents.py` for
  simple PDF generation; `read_models.py` for package/template read builders;
  and `validation.py` for patient/branch/order guards. Existing helper imports
  remain compatible while the Lab API and billing source invoice pricing now use
  the named services directly.
- Lab Slice 2: extracted lab catalog write commands into
  `backend/app/modules/lab/services/catalog_service.py`, including lab test
  create/update/delete, lab package create/update/delete, and result-template
  creation. The Lab API now imports these commands directly while
  `helpers.py` keeps compatibility exports. Entitlement checks, branch access,
  package item validation/replacement, transaction boundaries, audit events, and
  read model responses remain unchanged.
- Lab Slice 3: extracted lab order creation/list/detail/status workflows into
  `backend/app/modules/lab/services/order_service.py`, including order item
  pricing, zero-price repricing, manual/referral item creation, consultation
  order generation, order detail assembly, list repricing, and status audit
  logging. The Lab API now imports order commands directly while `helpers.py`
  keeps compatibility exports for existing callers and tests.
- Lab Slice 4: extracted sample collection, result release, and lab report PDF
  rendering into `backend/app/modules/lab/services/results.py`. The Lab API now
  imports these directly; `helpers.py` is a pure compatibility re-export shim
  (47 lines) with no business logic of its own. Lab module large-file cleanup
  is complete — the largest remaining file is `order_service.py` at 611 lines.
- Subscriptions Slice 1: extracted low-risk helper responsibilities from
  `backend/app/modules/subscriptions/service.py` into named service modules:
  `services/catalog.py` for built-in plans, module entitlement normalization,
  and plan duration rules; `services/serialization.py` for enabled-module JSON
  conversion; `services/defaults.py` for built-in plan seeding;
  `services/read_models.py` for plan/invoice response builders; and
  `services/documents.py` for simple PDF bytes. The stable
  `subscriptions.service` facade still exports the same functions for existing
  API, tenant onboarding, identity, and test callers. The large service file is
  now below 1000 lines, with subscription workflows left intact for later
  command/query service slices.
- Subscriptions Slice 2: extracted subscription plan command/query workflows
  into `backend/app/modules/subscriptions/services/plans.py`, including plan
  create, list, lookup, update, and status changes. Platform audit tenant
  resolution moved to `services/platform_audit.py` so command services can log
  audit events without importing back from the facade. Existing API routes still
  call `subscriptions.service`, and validation, duplicate-key handling,
  entitlement-module normalization, transaction boundaries, audit events, and
  response builders remain unchanged.
- Subscriptions Slice 3: extracted tenant subscription lifecycle workflows into
  `backend/app/modules/subscriptions/services/tenant_subscriptions.py`, including
  default trial creation, scheduled subscription activation, active subscription
  lookup, tenant subscription assignment/list/active reads, and entitlement
  response assembly. Patient limit counters and credit-limit calculation moved
  to `services/usage_limits.py` for reuse by entitlement and enforcement logic.
  The `subscriptions.service` facade still exports the same names for tenant
  onboarding, branch validation, API routes, and tests. Subscription assignment
  validation, free-trial guard, date/duration rules, invoice creation, audit
  logging, and commits remain unchanged.
- Subscriptions Slice 4: extracted SaaS credit and invoice workflows into
  `backend/app/modules/subscriptions/services/invoices.py`, including invoice
  number generation, credit purchase/listing, manual invoice creation/listing,
  invoice lookup, payment settlement, and payment-failed marking. The facade
  still exports these functions for API and tenant onboarding callers. Tenant
  access checks, super-admin override, credit invoice creation, payment balance
  math, paid status/date updates, failure metadata updates, audit events,
  commits, refreshes, and read-model responses remain unchanged.
- Subscriptions Slice 5: extracted entitlement enforcement, usage reads, and
  announcements into `backend/app/modules/subscriptions/services/entitlements.py`
  and SaaS revenue reporting/export/summary logic into
  `backend/app/modules/subscriptions/services/reports.py`. The legacy
  `backend/app/modules/subscriptions/service.py` file is now a small
  compatibility facade that re-exports the named service functions for existing
  API, onboarding, access-control, notification, and module callers. Patient
  limit behavior, module entitlement bypass rules, usage alert thresholds,
  revenue row mapping, CSV/XLS/PDF export behavior, MRR grouping, and platform
  revenue summary calculations remain unchanged.
- Notifications Slice 1: split notification provider entitlement/settings
  validation into `backend/app/modules/notifications/services/providers.py` and
  queue/list workflows into `services/events.py`. The module-level
  `notifications.service` file is now a stable facade for existing callers.
  The Notifications API now keeps HTTP/auth/branch-access concerns in the
  router and delegates queue/list workflow, transaction handling, and audit
  logging to the service layer. Provider-module mapping, communication setting
  checks, silent failure behavior for background notification helpers, audit
  metadata, and response models remain unchanged.
- Tenants Department Slice 1: extracted department create/assign/list/get/update
  status/delete workflows from `backend/app/api/v1/tenants.py` into
  `backend/app/modules/tenants/services/department_service.py`. The router now
  keeps route declarations, permission dependencies, tenant header access
  checks, and response binding while the service owns branch validation,
  duplicate-scope conflict detection, template edit protection, department-code
  generation, audit events, transaction boundaries, and soft-delete behavior.
  Existing tenant department API contracts remain unchanged, and the tenants
  router dropped below 700 lines.
- Tenants Slice 2: extracted tenant create/list/get/update/logo upload/delete
  workflows into `backend/app/modules/tenants/services/tenant_service.py`. The
  router now delegates tenant CRUD and branding operations while keeping HTTP
  route declarations, dependencies, file binding, and branch-list header scope
  checks. Primary-tenant guards, duplicate tenant validation, trial subscription
  creation, invoice-logo setting sync, file-document registration, audit events,
  transaction boundaries, and soft-delete response shape remain unchanged.
- Tenants Slice 3: moved branch listing and cross-scope tenant header validation
  into `backend/app/modules/tenants/services/branch_service.py`. The tenant
  router now has no direct tenant/branch repository dependencies; it passes the
  HTTP-derived request tenant and actor into the service. Super-admin primary
  tenant cross-scope behavior, forbidden response detail, and branch ordering
  remain unchanged.
- Practitioners Slice 1: extracted practitioner eligibility, schedule
  availability, room assignment conflict checks, generated slot dataclasses,
  and calendar generation into
  `backend/app/modules/practitioners/services/availability.py`. The legacy
  `practitioners.service` module still re-exports these names for appointment
  scheduling and API callers. Branch/department assignment validation,
  schedule-slot alignment, leave and booked-appointment checks, room fallback
  selection, generated slot status mapping, and calendar range behavior remain
  unchanged.
- Practitioners Slice 2: extracted practitioner read-model helpers into
  `backend/app/modules/practitioners/services/read_models.py` and lookup/link
  validation helpers into `services/validation.py`. The legacy
  `practitioners.service` module still re-exports these functions for existing
  API and appointment callers. Branch/department id enrichment, department name
  and code fallback resolution, doctor-login user validation, schedule lookup,
  time-window validation, and branch/department link replacement behavior remain
  unchanged.
- Practitioners Slice 3: extracted schedule, leave, and room-assignment
  workflows into `backend/app/modules/practitioners/services/schedule_service.py`.
  The legacy `practitioners.service` module still re-exports these functions for
  existing API callers. Schedule filters, department fallback filters,
  practitioner eligibility checks, time-window validation, room conflict checks,
  audit events, soft-delete responses, commits, and response enrichment remain
  unchanged. The main practitioner service is now below 300 lines.
- Practitioners Slice 4: extracted core practitioner CRUD/list/get workflows into
  `backend/app/modules/practitioners/services/practitioner_service.py` and
  API-facing eligibility, availability, and calendar response builders into
  `backend/app/modules/practitioners/services/availability_service.py`. The
  legacy `practitioners.service` module is now a small facade that preserves
  existing imports. Doctor number generation, doctor-login validation,
  branch/department link replacement, audit events, soft-delete response shape,
  eligibility response shape, availability response shape, and calendar range
  validation remain unchanged.
- Home Care Slice 1: extracted home care catalog CRUD into
  `backend/app/modules/home_care/services/catalog_service.py` while keeping
  `home_care_service.py` as the stable import path for existing router callers.
  Module entitlement checks, branch scoping, generated service codes, audit
  actions, soft-delete behavior, transaction boundaries, and response models
  remain unchanged.
- Home Care Slice 2: extracted booking lookup, access guard, read-model
  assembly, patient/staff validation, and booking-item replacement into
  `backend/app/modules/home_care/services/booking_support_service.py`.
  `HomeCareBookingService` now coordinates lifecycle workflows while delegating
  reusable support logic to a focused service. Booking response shape, branch
  access enforcement, patient/staff validation errors, service item defaults,
  totals, and existing transaction boundaries remain unchanged.
- Billing Architecture Slice 1: extracted billing rule, catalog, practitioner,
  tax, discount, and supplier reference queries from the former monolithic
  billing repository module into
  `backend/app/modules/billing/repositories/reference_repository.py`.
  Configuration, rule selection, and invoice item supplier services now depend
  on the focused reference repository directly. Billing now uses one canonical
  `repositories/` package with `__init__.py` re-exports for compatibility.
  Fee-rule matching, tax-rule selection, discount lookup, supplier-name lookup,
  and catalog reference behavior remain unchanged.
- Billing Architecture Slice 2: extracted consultation, lab-order, pharmacy
  issue, source-invoice, and source item lookups into
  `backend/app/modules/billing/repositories/source_repository.py`.
  Source invoice services now depend on the focused source repository directly,
  while `billing.repositories` still re-exports the class. Consultation invoice
  reuse, lab/pharmacy invoice lookup, item ordering, catalog lookups, and
  source item matching behavior remain unchanged.
- Billing Architecture Slice 3: extracted invoice, invoice item, tenant,
  branch, patient, payment, lab item, and pharmacy item support reads into
  `backend/app/modules/billing/repositories/invoice_support_repository.py`.
  Receipt PDF, membership, and invoice item services now depend on the focused
  support repository directly, while `billing.repositories` still re-exports
  the class. Receipt detail reads, membership item lookups, invoice item update
  lookups, payment ordering, and source item lists remain unchanged.
- Billing Architecture Slice 4: extracted settlement, finalized-settlement,
  due-collection, and revenue report query reads into
  `backend/app/modules/billing/repositories/settlement_report_repository.py`.
  Settlement/report services now depend on the focused reporting repository
  directly, while `billing.repositories` still re-exports the class. Settlement
  invoice joins, finalized settlement scoping, due collection ordering, revenue
  date filtering, and cancelled/refunded invoice exclusions remain unchanged.
- Billing Architecture Slice 5: split the remaining monolithic repository
  repository classes into focused modules:
  `read_repository.py`, `adjustment_repository.py`, `payment_repository.py`, and
  `source_sync_repository.py`. Billing services now import these repositories
  directly, while `billing.repositories` remains the package-level compatibility
  facade. Invoice reads, payment totals, credit-note totals, ledger existence
  checks, adjustment row locking, payment row locking, patient lookups, and
  source sync lookups remain unchanged.
- Cleanup Slice: removed unused facade-only helper files from IP and Pharmacy
  service packages. Active helper modules in Identity, Tenants, and Lab remain
  because current application code or tests still import them. No business
  logic, route contract, or service behavior changed.
- Cleanup Slice: removed the unused integrations schemas module. The active
  integration model, service, and GraphQL catalog adapter remain because they
  are still used by catalog integration settings and pharmacy/lab tests.
- Billing Receipt PDF Slice 1: extracted PDF text, money, percentage, logo
  image loading, JPEG size parsing, and PNG decoding primitives into
  `backend/app/modules/billing/services/receipt_pdf_utils.py`. Receipt
  layout, data loading, filename generation, logo fallback behavior, and PDF
  response behavior remain unchanged.
- Billing Receipt PDF Slice 2: moved receipt amount-in-words formatting into
  `backend/app/modules/billing/services/receipt_pdf_utils.py`. Receipt total
  wording and layout behavior remain unchanged.
- Billing Receipt PDF Slice 3: moved receipt text width/wrapping helpers and
  invoice item amount display helpers into
  `backend/app/modules/billing/services/receipt_pdf_utils.py`. Receipt item
  pricing, discount display, and PDF layout behavior remain unchanged.
- Billing Invoice Query Slice: extracted invoice list/detail orchestration from
  `backend/app/api/v1/billing/invoices.py` into
  `backend/app/modules/billing/services/invoice_queries.py`. The router now
  handles only HTTP concerns for those endpoints, while the service owns
  entitlement checks, branch scoping/access, repository reads, status
  normalization, and read-model assembly. API paths, response schemas, and
  business behavior remain unchanged.
- Billing Configuration Query Slice: moved doctor-fee, tax-rule, and
  discount-offer list entitlement/scoping workflow from
  `backend/app/api/v1/billing/configuration.py` into
  `backend/app/modules/billing/services/configuration.py`. The router now
  delegates configuration query orchestration to service methods while keeping
  route contracts unchanged.
- Billing Service Dependency Slice: replaced application and billing-service
  imports from the legacy `app.modules.billing.service` facade with imports
  from the owning service modules (`invoice_status`, `numbering`, `rules`, and
  `consultation_invoice`). The facade remains as a compatibility layer, but
  active code now follows direct module ownership and cleaner dependency flow.
- Billing Source Sync Slice: extracted invoice source synchronization from
  `backend/app/modules/billing/services/ledger.py` into
  `backend/app/modules/billing/services/source_sync.py`. Ledger now focuses on
  ledger entries, invoice read assembly, service invoice delegation, and
  adjustment delegation, while source-status updates for physiotherapy, home
  care, memberships, and pharmacy reversal live in a dedicated service module.
- Billing Closure Slice: moved the discount-approval lookup behind
  `BillingReferenceRepository.get_discount_approval()` so configuration
  services no longer perform direct model reads for that workflow. This closes
  the remaining quick repository-boundary cleanup before moving to other
  modules.
- Patient Subscriptions Eligibility Slice: moved department, purchase invoice,
  appointment, and consultation lookups from
  `backend/app/modules/patient_subscriptions/services/eligibility.py` into
  `PatientSubscriptionSupportRepository`. Eligibility service now owns rules
  and repository owns persistence reads.
- Patient Subscriptions Usage Sync Slice: moved the direct benefit-invoice
  query out of
  `backend/app/modules/patient_subscriptions/services/usage_sync.py` into a
  new `PatientSubscriptionSupportRepository.list_benefit_invoices()` method,
  and replaced its inline `LabOrderItem`/`PharmacyIssueItem` queries with
  calls to the owning modules' existing repositories
  (`LabOrderRepository.list_order_items`,
  `PharmacyIssueRepository.list_items`) instead of duplicating those queries
  in patient_subscriptions. Usage-sync now contains only benefit-aggregation
  business rules; each module keeps ownership of persistence reads for its
  own entities. Note: the lab/pharmacy repository methods add an explicit
  `ORDER BY created_at` that the prior ad hoc queries lacked; this only
  affects tie-breaking among same-invoice items when a partial discount
  can't cover all of them, and now matches the ordering already used by
  those modules' own detail-read paths. `service.py` continues to re-export
  `sync_free_item_usage_from_invoices` unchanged.
- IP Billing Review: audited `backend/app/modules/ip/services/billing.py` for
  repository-boundary and dependency-direction violations; found none. All
  reads already go through `IPBillingRepository`/`IPCatalogRepository`/
  `IPRoomRepository`, and `clinical.py`/`medication.py` correctly depend on
  `billing.create_billing_item` rather than touching billing entities
  directly. A full scan of `ip/services/*.py` found zero remaining direct
  `session.exec`/`session.get` calls outside repositories.
- IP Billing Pricing Slice: extracted the catalog fuzzy-match pricing helpers
  (`_medicine_catalog_price`, `_lab_catalog_price`, `_catalog_key`) from
  `backend/app/modules/ip/services/billing.py` into a new
  `backend/app/modules/ip/services/pricing.py`, mirroring the earlier Lab
  module `pricing.py` extraction. `billing.py` now owns only billing-item/
  charge CRUD and invoice generation orchestration; catalog price resolution
  is its own concern. No behavior change — same matching algorithm, same
  call sites, only the module boundary moved. These helpers were private and
  only used within `billing.py`, so no external import paths were affected.
- Home Care Billing/Booking Ownership Slice: fixed
  `backend/app/modules/home_care/services/billing_service.py`'s
  `_sync_booking_status_from_invoice` reaching through
  `booking_support.bookings` (another service's internal repository
  attribute) to persist a booking status change. `HomeCareBillingService` now
  holds its own `HomeCareBookingRepository` instance, matching the pattern
  already used by its sibling `booking_service.py`/`visit_service.py`, so
  each service owns the writes for the entities it mutates directly.
  `booking_support` remains correctly used across all three services only for
  its actual shared responsibility (`get_or_404`, `read_booking`,
  `validate_patient_and_staff`, `replace_booking_items`). Confirmed zero raw
  `session.exec`/`session.get` calls anywhere in `home_care/services/*.py`
  outside repositories both before and after this change — no other
  Router → Service → Repository violations found. No behavior change.
- Physiotherapy Billing Ownership Slice: found and fixed the identical
  reach-through pattern in
  `backend/app/modules/physiotherapy/services/billing_service.py`'s
  `_sync_case_status_from_invoice`, which called `self.lookup.cases.add(case)`
  through `PhysiotherapyCaseLookup`'s internal repository attribute.
  `PhysiotherapyBillingService` now holds its own `PhysiotherapyCaseRepository`
  instance, matching `case_service.py`. `lookup` remains correctly used only
  for `get_or_404`. Also reviewed `fee_strategies.py`: the Strategy pattern
  (`FixedFeeShareStrategy`/`PercentageFeeShareStrategy` behind
  `PhysiotherapistFeeResolver`) is cleanly encapsulated — `billing_service.py`
  only calls the resolver's two public methods, never the individual
  strategies, and the resolver itself has no direct DB access (delegates to
  `PhysiotherapyBillingRepository`). No over-coupling found. No behavior
  change.
- Consultations Facade Removal Slice: removed
  `backend/app/modules/consultations/services/consultation_service.py`. It
  was a pure 1:1 delegating facade over `ConsultationRecordService` and
  `ClinicalTemplateService` with no shared state or orchestration between the
  two (they are independent domains — consultation notes/signing vs. clinical
  note templates), and its only consumer was
  `backend/app/api/v1/consultations.py`. The router now instantiates
  `ConsultationRecordService`/`ClinicalTemplateService` directly per route,
  matching exactly which service each endpoint already delegated to, one
  fewer indirection layer. No test imported the facade class. Also reviewed
  `record_service.py`'s billing integration: `sign_consultation` calls
  `ConsultationBillingService.auto_invoice_membership_consultation` inside a
  try/except so a membership-invoicing failure never fails the sign — this
  ownership split (record_service orchestrates + handles errors,
  billing_service owns the invoicing rule) was already correct and is
  unchanged. Zero direct DB access found anywhere in
  `consultations/services/*.py`. No behavior change; all routes, permissions,
  and response models are unchanged.
- Cross-Module Facade Cleanup Slice: extended the same pure-delegation
  facade removal to two more modules discovered during the item 6 sweep:
  `backend/app/modules/appointments/services/appointment_service.py`
  (delegated to `AppointmentBookingService`/`AppointmentQueryService`, only
  consumer was `api/v1/appointments.py`) and
  `backend/app/modules/physiotherapy/services/physiotherapy_service.py`
  (delegated to `PhysiotherapyCaseLifecycleService`/`PhysiotherapySessionService`/
  `PhysiotherapyBillingService`, only consumer was `api/v1/physiotherapy.py`).
  Both routers now instantiate the underlying services directly, one per
  route, matching what each endpoint already delegated to. No test imported
  either facade class. Kept-vs-removed facade decision for this refactor:
  - **Kept** (wide external fan-in beyond their own router — removing would
    break other modules or namespace-style imports):
    `billing/service.py` (12 call sites across 6+ modules),
    `reports/service.py` (imported as `reports_service` namespace by the API
    layer and by `worker.py`), `identity/services/helpers.py` (imported by
    `auth_service.py`/`role_service.py`/`user_service.py` and 2 test files),
    `queue/service.py` (imported by `appointments/booking_service.py` and as
    a namespace import by the API layer), `lab/services/helpers.py`
    (imported by `test_lab_pharmacy.py`).
  - **Removed** (pure 1:1 delegation, only consumer was the module's own
    router, zero cross-service orchestration): `consultation_service.py`,
    `home_care_service.py`, `appointment_service.py`,
    `physiotherapy_service.py`.
- Router Business-Logic Scan: swept `api/v1/*.py` for direct repository
  construction and business-rule leakage. Most direct
  `SomeRepository(session).method(...)` calls found in routers (several in
  `api/v1/lab.py`, most list/get endpoints in `api/v1/ip.py`) are simple 1:1
  read/translation pass-throughs with no conditional business rules and are
  an existing, accepted convention in this codebase — left unchanged.
  **One real violation found and later fixed by the IP CQRS Room Query Slice:**
  `api/v1/ip.py::list_rooms` builds read-models via `room_read(...)` and then
  applies a genuine business rule directly in the router
  (`if not include_occupied: read_rows = [row for row in read_rows if
  row.available]`), bypassing a service layer entirely for that filter.
- Full backend suite run after this phase: 247/248 passed. The 1 failure
  (`test_api_permission_matrix_lists_all_live_routes`) is a pre-existing,
  unrelated docs/route-drift check (flags routes across many unrelated
  modules — patients, tenants, queue, etc. — as undocumented) that has failed
  identically since before this refactor pass began.
- IP CQRS Room Query Slice: moved `api/v1/ip.py::list_rooms` read/filter
  orchestration into `backend/app/modules/ip/services/room_queries.py`.
  The router now keeps HTTP concerns only for room listing, while the query
  service owns IP module entitlement, branch scoping, room repository reads,
  `room_read` assembly, and the `include_occupied` availability filter. Same
  database, route, request parameters, response model, and behavior.
- IP CQRS Admission Query Slice: moved `api/v1/ip.py::list_admissions`
  entitlement, branch scoping, and admission repository read into
  `backend/app/modules/ip/services/admission_queries.py`. The admissions list
  route now delegates to a query service while preserving the same filters,
  response model, and tenant/branch behavior.
- IP CQRS Clinical Query Slice: moved treatment, medication-order, and
  medication-administration list workflows from `backend/app/api/v1/ip.py`
  into `backend/app/modules/ip/services/clinical_queries.py`. The query
  service now owns IP entitlement, admission access validation, and clinical
  repository reads for these GET endpoints; route paths, permissions, response
  models, and behavior remain unchanged.
- IP CQRS Billing Query Slice: moved charge list, billing-item list, and
  admission invoice detail lookup from `backend/app/api/v1/ip.py` into
  `backend/app/modules/ip/services/billing_queries.py`. The query service now
  owns IP entitlement, admission access validation, billing repository reads,
  and invoice detail read-model assembly for these GET endpoints; write-side
  invoice generation remains in the existing billing command service.
- IP CQRS Document Query Slice: moved admission document list orchestration
  from `backend/app/api/v1/ip.py` into
  `backend/app/modules/ip/services/document_queries.py`. The query service now
  owns IP entitlement, admission access validation, and delegation to the safe
  document-list read path; upload and discharge PDF workflows remain unchanged.
- IP Clinical Command Boundary Slice: moved sign-consultation and sign-consent
  lookup/orchestration from `backend/app/api/v1/ip.py` into the existing
  `backend/app/modules/ip/services/clinical.py` command service via
  `sign_ip_consultation_by_id()` and `sign_consent_by_id()`. The router no
  longer constructs `IPClinicalRepository` directly; 404 messages, admission
  access checks, open-admission validation, signing audit behavior, and billing
  item creation remain unchanged.
- IP Room Command Boundary Slice: moved IP entitlement enforcement for room
  create/update from `backend/app/api/v1/ip.py` into
  `backend/app/modules/ip/services/rooms.py`. Room command services already
  owned branch validation, branch access, duplicate checks, persistence, audit,
  and read-model assembly; the router now only wires HTTP inputs/dependencies
  for room command endpoints.
- IP Command Router Cleanup Slice: moved the remaining admission-scoped write
  preconditions out of `backend/app/api/v1/ip.py` and into existing IP command
  services. Admission create/update now delegate to
  `services/admissions.py`; document upload workflows delegate to
  `services/documents.py`; treatment, consultation, consent, discharge-summary,
  charge, billing-item, medication-order, medication-administration, and
  invoice-generation commands now use by-admission-id service wrappers. The
  router no longer performs IP entitlement checks, admission lookup, open-stay
  validation, branch access checks, transaction commits, or audit logging for
  these flows; route paths, permissions, request/response schemas, and
  business outcomes remain unchanged.
- Pharmacy Issue CQRS Slice: extracted pharmacy issue list/detail read-model
  workflows from `backend/app/modules/pharmacy/services/issues.py` into
  `backend/app/modules/pharmacy/services/issue_queries.py`. Issue commands
  remain in `issues.py` for create, create-from-consultation, dispense/status,
  amount adjustment, and billing-link workflows. The router now imports GET
  issue workflows from the query service and POST/PATCH issue workflows from
  the command service, preserving the same route paths, permissions,
  response schemas, branch scoping, module entitlement checks, and detail item
  assembly.
- Pharmacy Stock CQRS Slice: extracted stock read/query workflows from
  `backend/app/modules/pharmacy/services/stock.py` into
  `backend/app/modules/pharmacy/services/stock_queries.py`. Batch listing,
  stock-ledger listing, low-stock calculation, module entitlement checks, and
  branch scoping now live on the query side. `stock.py` remains focused on
  stock mutation support (`record_stock`) plus the balance helper needed to
  write ledger `balance_after` values. The pharmacy router now imports stock
  GET workflows from the query service while purchase/issue command services
  continue to use `record_stock` unchanged.
- Lab Catalog Query Slice: moved catalog/referral/template GET orchestration
  out of `backend/app/api/v1/lab.py` into
  `backend/app/modules/lab/services/catalog_queries.py`. Consultation
  referral reads, available/popular lab catalog reads, active test/package
  reads, package read-model assembly, result-template reads, module
  entitlement checks, and branch scoping now live in the query service. Lab
  router endpoints keep the same paths, permissions, response models, and
  request parameters; catalog writes, order commands, sample collection,
  result entry, and PDF report generation remain on their existing command
  services.
- Lab Order Query Slice: moved lab order list/detail GET workflows from
  `backend/app/modules/lab/services/order_service.py` into
  `backend/app/modules/lab/services/order_queries.py`. The order command
  service now focuses on create, create-from-consultation, and status updates,
  while the query service owns order list reads, detail assembly, entitlement
  checks, branch access for detail reads, and zero-amount repricing already
  present on read paths. Router paths, permissions, response models, branch
  scoping, and order behavior remain unchanged.
- Consultations Query Slice: moved consultation list/detail GET workflows from
  `backend/app/modules/consultations/services/record_service.py` into
  `backend/app/modules/consultations/services/query_service.py`.
  `ConsultationRecordService` now focuses on create, update, sign, and
  addendum command workflows, while `ConsultationQueryService` owns entitlement
  checks, branch/doctor scoping, detail read-model assembly, and the existing
  viewed audit event for detail reads. Router paths, permissions, response
  models, and business behavior remain unchanged.
- Final Priority CQRS Scan: reviewed priority modules (IP, Billing, Patient
  Subscriptions, Pharmacy, Lab, Consultations) for obvious router/service
  boundary leftovers after the lightweight CQRS slices. Found and fixed one
  remaining router repository call in `backend/app/api/v1/pharmacy.py` by
  moving supplier list access behind `list_supplier_records()` in
  `backend/app/modules/pharmacy/services/catalog_service.py`. No API contract
  or behavior change.
- Billing Facade Cleanup: removed the unused
  `backend/app/modules/billing/service.py` compatibility facade after scanning
  for active imports. The remaining internal script imports were updated to
  import `create_consultation_invoice` directly from
  `backend/app/modules/billing/services/consultation_invoice.py`.

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
