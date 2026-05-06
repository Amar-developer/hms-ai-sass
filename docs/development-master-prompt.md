# MedizinHub HMS Development Master Prompt

Use this prompt as the guiding instruction whenever building or enhancing MedizinHub HMS modules. It keeps product, architecture, UX, compliance, and SaaS behavior consistent.

## Master Prompt

You are building MedizinHub HMS, a smart 360-degree healthcare SaaS platform for Indian clinics, polyclinics, multi-speciality hospitals, physiotherapy centers, and multi-branch healthcare groups.

The application must be tablet-first, mobile-friendly, fast for daily clinic operations, secure for healthcare records, and configurable for SaaS customers. It must support small clinics with simple defaults and larger hospitals with advanced settings.

Build every feature as part of a plug-and-play modular healthcare operating system.

## Product Rules

- The product must help patients, doctors, staff, and clinic owners.
- Workflows must be simple enough for a receptionist or doctor to use during a busy clinic day.
- The app should support web, tablet, mobile/PWA, WhatsApp, voice automation, and future mobile apps.
- AI should assist, summarize, remind, prioritize, and explain. It must not independently diagnose or replace doctor judgment.
- Patient history is a protected clinical asset. Signed records are immutable.
- Doctors inside the same healthcare company may view important treatment history when needed, but cannot alter another doctor's signed history.
- Every sensitive patient data access must be auditable.
- Admin settings should be configurable by tenant, branch, department, and doctor where needed.
- SaaS subscription plans must be able to enable, disable, or limit modules.

## Architecture Rules

Every feature must respect this hierarchy:

```text
Platform
  -> Tenant / Healthcare Company
      -> Branch
          -> Department
              -> Practitioner
      -> Shared Patient Master
      -> Tenant Settings
      -> Subscription Plan
```

Every module must define:

- Tenant scope.
- Branch scope if applicable.
- Roles and permissions.
- Subscription plan requirements.
- Admin settings.
- Audit events.
- API contracts.
- Data ownership.
- Integration events.
- Mobile/tablet behavior.

Do not connect the frontend directly to ERPNext or external systems. The frontend must call the MedizinHub HMS API layer. ERPNext, WhatsApp, voice, payments, ABDM, and other providers must be connected through backend integration adapters.

Recommended flow:

```text
Frontend / Mobile / WhatsApp / Voice
  -> MedizinHub HMS API Layer
  -> MedizinHub HMS Database and Services
  -> Integration Adapters
  -> ERPNext / Payments / WhatsApp / Voice / ABDM / Labs
```

## UX Rules

- Design for real clinic speed.
- Avoid unnecessary screens and steps.
- Prefer direct workflows: search, select, act.
- Reception flows should work well on tablets.
- Doctor flows should show today's appointments and Patient 360 first.
- Owner/admin flows should focus on configuration, revenue, usage, and control.
- Use clear status labels for appointment, queue, billing, and consultation state.
- Critical patient alerts such as allergy or high-risk condition should be visible before consultation actions.
- Do not expose complex ERP-style fields to normal clinic staff.

## Required Cross-Cutting Behavior

Every module should consider:

### Tenancy

- All records must belong to a tenant.
- Branch-specific records must include branch ID.
- APIs must reject cross-tenant access.
- Tests should include tenant isolation for sensitive modules.

### Roles and Permissions

Default roles:

- SaaS super admin
- Tenant owner
- Branch admin
- Doctor
- Nurse/assistant
- Receptionist
- Lab staff
- Pharmacy staff
- Billing staff
- Accountant
- Patient

### Audit

Audit sensitive actions:

- Patient record viewed.
- Clinical record created, updated, or signed.
- Prescription shared.
- Lab report viewed or shared.
- Appointment cancelled, requeued, or marked no-show.
- Emergency priority used.
- Invoice generated, paid, refunded, or cancelled.
- Settings changed.
- User role changed.
- Data exported.

### Settings

Settings should resolve in this order:

1. Platform default
2. Subscription plan
3. Tenant setting
4. Branch setting
5. Department setting
6. Doctor/practitioner override

### Subscription

Every paid capability must declare:

- Minimum plan.
- Usage limit.
- Add-on support.
- Over-limit behavior.
- Upgrade path.

Examples:

- Monthly patient limit.
- Number of doctors.
- Number of branches.
- WhatsApp credits.
- Voice credits.
- AI summary credits.
- Lab/pharmacy/IP module access.

## Clinical Record Rules

- Consultation records can be draft until signed.
- Signed records are immutable.
- Corrections must be addendums, not overwrites.
- Historical records from another doctor are read-only.
- Patient 360 is a read model generated from trusted clinical data.
- AI summaries must show source data or references when possible.
- Clinical data sharing must use secure links and access logs.

## Appointment and Queue Rules

Appointment types:

- OP
- IP
- Walk-in
- Follow-up
- Online consultation
- Home visit
- Emergency

Queue states:

```text
Scheduled
Confirmed
Checked In
Waiting
Called
Patient Not Available
Requeued
In Consultation
Consultation Completed
Billed
Cancelled
No Show
```

Emergency patients can skip the normal waiting period based on clinic settings and staff permission. The reason must be captured and audited.

If a token patient is not available:

- Mark as patient not available.
- Requeue after configured number of patients or to end of queue.
- Notify patient if communication consent exists.
- Auto-cancel or mark no-show after configured missed calls.

## Fee and Billing Rules

Fee models must support:

- Fixed consultation fee.
- Doctor-specific fee.
- Department-specific fee.
- Branch-specific fee.
- OP fee.
- IP fixed fee.
- IP percentage fee.
- Online consultation fee.
- Home visit fee.
- Emergency fee.
- Follow-up/review fee.
- Doctor share percentage.
- Clinic share percentage.
- Fixed doctor payout.
- Monthly settlement ledger.

Payment models must support:

- Cash.
- Credit card.
- Debit card.
- UPI.
- GPay.
- Paytm.
- Bank transfer.
- Mixed partial payments against a single invoice.
- Partial paid and paid status.
- Refund records.
- Cancellation guardrails for invoices with payments.

Billing should be generated from configured rules, but authorized staff should be able to apply approved discounts, waivers, or adjustments with audit.

## Integration Rules

External integrations must use adapters:

- ERPNext/Frappe adapter.
- WhatsApp provider adapter.
- Voice provider adapter.
- Payment provider adapter.
- ABDM/ABHA adapter.
- Lab/diagnostic adapter.

Adapters must hide provider-specific complexity from core modules.

Core workflows should not fail permanently because an external provider is down. Use retry, queue, and sync status.

## AI and Automation Rules

AI/automation features must:

- Be opt-in by tenant where sensitive.
- Respect consent and communication preferences.
- Avoid exposing complete medical details in WhatsApp/SMS.
- Use secure links for reports and prescriptions.
- Keep doctor in control for clinical decisions.
- Log generated summaries and important automation actions.

## Definition of Done

A module is not complete unless it includes:

- UI flow for target users.
- Backend API or clear API contract.
- Tenant and branch handling.
- Role/permission handling.
- Subscription gating if applicable.
- Settings model if configurable.
- Audit events for sensitive actions.
- Validation and error states.
- Tests for business rules.
- Documentation update.

## First Implementation Priorities

Build in this order:

1. Auth, tenant, branch, role, and subscription foundations.
2. Patient master and Patient 360 read model.
3. Appointment and queue engine with emergency/requeue/no-show.
4. Doctor consultation with immutable signed records.
5. Fee rules, billing, and doctor settlement.
6. WhatsApp reminders and secure links.
7. Voice token calling.
8. Lab, pharmacy, physiotherapy, and IP modules.
9. ERPNext/Frappe adapter for accounting/inventory.
10. AI summaries and smart automation.
