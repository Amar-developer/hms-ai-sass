# Product Blueprint

## Vision

MedizinHub HMS should become a smart 360-degree healthcare management SaaS platform that helps both patients and healthcare owners. It should improve access, reduce waiting, preserve treatment history, support faster diagnosis, simplify billing, and give clinic owners a clear view of operations and revenue.

The product should work across:

- Single-doctor clinics
- Small clinics
- Polyclinics
- Multi-speciality hospitals
- Physiotherapy centers
- Diagnostic/lab-connected clinics
- Multi-branch healthcare groups

## Product Principles

- Tablet-first and mobile-friendly for real clinic usage.
- Fast workflows for reception, doctors, pharmacy, lab, and billing.
- Simple defaults for small clinics, advanced configuration for hospitals.
- Patient history is a protected clinical asset, not a casual admin record.
- Automation should reduce staff workload without replacing doctor judgment.
- AI should assist, summarize, prioritize, and explain; it should not independently diagnose.
- Every sensitive action must be auditable.
- Regional language support must be built into patient-facing communication, token calling, consent, reminders, invoices, and education content.

## Regionalization and Multilingual Scope

Initial launch is planned for Tamil Nadu, with future PAN India expansion. MedizinHub HMS must therefore be designed as a multilingual, region-aware healthcare SaaS from the beginning.

Language support policy:

- Phase 1 launch languages: English and Tamil.
- PAN India-ready architecture: language packs must allow Hindi and other Indian languages to be added without code rewrites.
- User language preference must be stored at patient, user, tenant, and branch levels where applicable.
- Tenant/branch settings must configure default language, token calling language, invoice language, reminder language, and patient communication language.
- Staff/admin screens may start with English, but patient-facing and queue-facing content should support Tamil from the Tamil Nadu launch.
- Clinical source records should preserve doctor-entered original text. Translations must not overwrite original clinical notes.
- Medical translations must be reviewed carefully; automated translation must not silently change diagnosis, prescription, dosage, allergy, lab result, or consent meaning.
- Notification templates must be language-aware for WhatsApp, SMS, voice, email, and future mobile push.
- Token calling should support Tamil, English, and bilingual announcements.
- Printed or shared documents should support configurable language where safe: token slip, invoice, receipt, appointment reminder, follow-up reminder, lab-ready message, payment reminder, and basic patient instructions.
- Legal/consent text must be versioned per language. The stored consent record must capture language, version, timestamp, channel, and actor/source.

Implementation requirements:

- Add `locale` / `preferred_language` fields for patients and users.
- Add tenant/branch language settings such as `language.default`, `language.supported`, `queue.token_language`, and `communication.default_language`.
- Move visible patient-facing strings and notification templates into translation resources.
- Do not concatenate translated medical/legal messages manually; use parameterized templates.
- Every notification event should store the language/template version used.
- Admin settings should allow Tamil Nadu clinics to run Tamil-first reception and queue workflows while keeping backend data consistent.

## Workflow UX Standard

This behavior must be maintained across all modules:

- After a successful create or edit action, redirect back to the corresponding listing page.
- The created or updated record must appear as the first row immediately, before any manual refresh.
- The page must focus/scroll to the top of the listing page after redirect so users can see the latest change without scrolling.
- Success messages must clearly state what was created or updated.
- Listing APIs and frontend sort defaults should use latest modified date first, then created date first.

## Primary Users

| User | Needs |
| --- | --- |
| Patient | Easy booking, low waiting, clear communication, prescriptions, reports, invoices, follow-up reminders |
| Receptionist | Quick patient search, appointment booking, token handling, emergency queue, requeue/cancel/no-show handling |
| Doctor | Today dashboard, patient 360 summary, consultation notes, prescription, lab/scan referral, follow-up, revenue visibility |
| Nurse/Assistant | Vitals, room movement, procedure support, care notes |
| Lab Staff | Test orders, sample tracking, result upload, report delivery |
| Pharmacy | Prescription visibility, medicine issue, stock tracking |
| Billing Staff | Invoice generation, payments, refunds, due tracking |
| Owner/Admin | Branch setup, staff permissions, fee settings, subscription, analytics, revenue, doctor settlement |
| SaaS Super Admin | Tenant onboarding, plan limits, billing, support, audit, platform configuration |

## Identity, Roles, and Access Control

MedizinHub HMS must treat user management as a core platform feature, not a secondary admin screen.

### Primary Tenant and Platform Super Admin

The platform owner tenant is `MedizinHub HMS`. This tenant is the primary tenant, also called the super tenant. Users marked as primary tenant super admin have global platform authority across all customer tenants.

Primary tenant rules:

- `MedizinHub HMS` is the only primary tenant.
- Primary tenant super admins can access all customer tenants for onboarding, support, subscription management, and platform reporting.
- Primary tenant super admins manage customer tenants through audited platform workflows.
- The primary tenant cannot be deleted or suspended from normal tenant-management screens.
- Customer tenant access by a primary tenant super admin must be auditable and should capture purpose when used for support or data inspection.

Primary tenant super admin capabilities:

- Tenant Management: create, read, update, and soft-delete/suspend customer tenants.
- Tenant Details: manage tenant name, description, logo, email, phone number, tenant address, tenant type, status, country, and timezone.
- Tenant Type Assignment: single clinic, poly clinic, hospital, or super multi speciality hospital.
- Subscription Model Assignment: assign customer tenant to a SaaS plan, trial, module entitlement, and patient/branch/doctor limits.
- Global Department Templates: create common departments/specialties under the primary `MedizinHub HMS` tenant and assign them to customer tenants to avoid duplicate setup. Super admins can also promote useful departments created in a demo/customer tenant into the primary tenant as reusable templates. Assigned global departments are locked for customer tenant admins.
- Tenant Department Management: secondary tenant admins can create, read, update, and deactivate departments/specialties only inside their own tenant.
- Global Role Templates: create common roles under the primary `MedizinHub HMS` tenant and assign/copy them to customer tenants with selected permissions. Super admins can also promote a useful role created in a customer tenant, such as MedizinHub Demo Clinic, into the primary tenant as a global template and then copy it to other clinics. Assigned role metadata remains template-controlled, while customer tenant admins may customize the assigned role's non-platform permissions inside their own tenant.
- Tenant Role Management: secondary tenant admins can manage roles only inside their own tenant, using the same create, edit, deactivate, and permission assignment screens.
- Global Branch Templates: create common branch templates such as Main Branch, City Branch, Lab Branch, or Pharmacy Branch under the primary `MedizinHub HMS` tenant and assign them to customer tenants. Super admins can also promote useful branch structures created in a demo/customer tenant into the primary tenant as reusable templates. Assigned global branches are locked for customer tenant admins.
- User Management: create, read, update, deactivate, and assign users to roles, branches, departments, or practitioner profiles.
- User Types: primary tenant super admin, tenant admin, doctor, staff nurse, back-office staff, pathology staff, lab technician, pharmacy user, billing staff, reception staff, auditor, and support user.
- Branch Management: create, read, update, and deactivate tenant branches.
- Super Admin Reports: tenant count, active/trial/suspended tenants, tenant usage, subscription usage, monthly recurring revenue, module adoption, branch/doctor/patient usage, and support/audit activity.

Required user layers:

- SaaS super admin: platform-level access to every tenant for onboarding, subscription support, support diagnostics, plan control, and platform audit.
- Tenant admin: access only inside the assigned healthcare company or clinic group, including tenant settings, branches, staff, doctors, fee rules, and module settings.
- Branch-scoped staff: access limited to assigned branch workflows where applicable.
- Doctor: doctor dashboard, assigned appointments, patient 360 treatment view, consultation creation, prescription, referral, and signed-record addendum. A doctor can belong to multiple departments/specialties inside the same tenant.
- Lab technician: lab orders, sample workflow, result upload, and report readiness events.
- Pharmacy user: prescription queue, medicine issue, pharmacy billing/stock workflows when enabled.
- Billing/back-office staff: invoice, payment, refund guardrails, doctor settlement, and reports according to permissions.
- Reception/front-office staff: patient registration, appointment booking, queue handling, no-show, requeue, and communication triggers.

Authorization rules:

- Login must be simple for end users: only username/email and password are entered. The system identifies whether the user is a SaaS super admin, tenant admin, doctor, staff, lab technician, pharmacy user, billing user, or back-office user after authentication.
- Tenant, branch, role, permissions, subscription entitlements, and available modules must be derived from the authenticated user session, not manually selected on the login screen.
- Every API must identify the authenticated user and tenant context before changing tenant data.
- Super admin can access all tenants, but sensitive support access must be audited with purpose.
- Tenant admin can manage only users, roles, branches, settings, and workflows inside their own tenant.
- Primary tenant role and department records act as reusable templates; assigning a template to a customer tenant creates or updates the matching tenant record by key/code and stores the source template id.
- Super admins may copy default roles from one tenant to another tenant, including promoting selected customer-tenant roles into the primary `MedizinHub HMS` tenant as global templates. Copying must use stable role keys to update existing records and avoid duplicate role names.
- The `super_admin` role is platform-only and must remain under the primary `MedizinHub HMS` tenant. It cannot be assigned to customer tenants.
- The primary tenant must include a reusable `Tenant Admin` role template with tenant-scoped administration permissions only. This role can be copied to customer tenants and assigned to each clinic owner/admin user.
- Users with `tenant_admin` in a customer tenant can manage only their assigned tenant scope. They must not receive platform tenant creation, platform subscription management, or cross-tenant access permissions.
- Assigned global templates are sticky in customer tenants. Tenant admins cannot rename, deactivate, delete, or change the source linkage of assigned records; for roles only, they may customize non-platform permissions within their own tenant. Customer-tenant roles cannot receive `platform.*` permissions, even when managed by Super Admin. Departments and branches remain fully locked.
- Global templates cover roles, departments, and branches. Common role examples include Admin, Back Office Staff, Staff Nurse, Doctor, Staff Accountant, Lab Technician, Pharmacy User, Billing Staff, and Reception Staff. Common branch examples include Main Branch, OP Branch, Lab Branch, Pharmacy Branch, City Branch, and Satellite Clinic Branch.
- Customer tenant admins keep tenant-scoped role and department management for local records; they cannot assign global templates across tenants.
- Staff users must receive permissions through roles, not hard-coded frontend checks.
- Patient history viewing must be logged, including actor, tenant, branch, purpose, and resource.
- Signed clinical records remain immutable; authorized users may only add approved addendums.
- Module access must require both subscription entitlement and user role permission.
- UI navigation should hide unavailable modules, but backend authorization remains the source of truth.

Minimum identity features:

- Login with username/email and password only.
- Logout with server-side session revocation.
- Secure password hashing.
- Change password.
- Forced password change for newly created users.
- Active/inactive users.
- Tenant and branch assignment.
- Role creation and role assignment.
- Permission catalog.
- Session expiry.
- Audit events for login, password changes, user creation, role changes, patient view, billing action, consultation sign, refunds, settings changes, and notification triggers.

### Role Management Policy

Role management must control both what a user can see and what actions the user can perform. Frontend menus, buttons, forms, API routes, reports, exports, and background actions must all be driven by the same backend permission catalog.

Sidebar visibility is derived directly from effective role permissions. A module is shown when the user holds any permission action under that module's permission prefix and the tenant subscription enables it; no separate per-role sidebar configuration or built-in role visibility list is used.

Role management objectives:

- Super admin can create tenants, manage plans, view all tenant contexts for support, and assign platform-level users.
- Tenant admin can create and manage users, roles, branches, settings, fee rules, and tenant workflows only inside the tenant.
- Each tenant can define custom roles without code changes.
- A user can have one or more roles.
- A role contains granular permissions, not only module names.
- Role permissions are edited on a dedicated permission matrix page with module-level create, read/view, edit, delete, and manage actions where applicable.
- A user can be restricted by tenant, branch, department, practitioner, or module.
- Subscription entitlement enables a module commercially, but role permission decides whether the logged-in user can access it.
- UI must hide unauthorized modules and actions, but API authorization must remain the final control.
- Any denied action should return a clear authorization error and be traceable in security logs where appropriate.

Permission model:

| Access Level | Meaning | Example |
| --- | --- | --- |
| None | User cannot see or call the module. | Pharmacy hidden for reception if not assigned. |
| View | User can list and view records only. | Back office can view patient billing summary. |
| Create | User can create new records. | Reception can create patient and appointment. |
| Edit | User can update unlocked/editable records. | Reception can edit appointment timing. |
| Delete/Cancel | User can delete, cancel, deactivate, or void allowed records. | Authorized billing user can cancel unpaid invoice. |
| Approve/Sign | User can finalize restricted records. | Doctor signs consultation; admin approves refund. |
| Export | User can export or download data. | Owner exports monthly revenue report. |
| Manage | User can configure module settings and master data. | Tenant admin manages fee rules. |

Permission keys should follow a consistent pattern:

- `<module>.view`
- `<module>.create`
- `<module>.edit`
- `<module>.delete`
- `<module>.cancel`
- `<module>.approve`
- `<module>.sign`
- `<module>.export`
- `<module>.manage`

Examples:

- `patients.view`
- `patients.create`
- `patients.edit`
- `patients.delete`
- `appointments.create`
- `appointments.cancel`
- `queue.call`
- `queue.requeue`
- `consultations.write`
- `consultations.sign`
- `billing.invoice.create`
- `billing.invoice.cancel`
- `payments.collect`
- `payments.refund`
- `reports.export`
- `identity.users.manage`
- `identity.roles.manage`
- `settings.manage`
- `audit.view`

Default role policy:

| Role | Default Access |
| --- | --- |
| SaaS Super Admin | Platform tenant management, plan management, support access, platform audit, tenant context switching. Cannot silently change clinical data without tenant-context audit. |
| Tenant Admin/Owner | Full tenant-level management except platform-only billing plans and global SaaS settings. Can manage tenant users, roles, settings, branches, modules, and reports. |
| Branch Admin | Branch-scoped staff, queue, appointments, reports, and operational settings. Cannot access other branches unless assigned. |
| Reception | Patient search/create/edit, appointment booking, queue call/requeue/no-show/cancel, communication triggers. No clinical record editing, no billing refund approval. |
| Doctor | Today queue, assigned appointments, Patient 360 view, consultation draft/write/sign, prescription, lab/scan referral, follow-up. Cannot alter signed history from other doctors. |
| Nurse/Assistant | Vitals, care notes, IP support tasks, patient view as assigned. Cannot sign doctor consultation or approve billing actions. |
| Lab Technician | Lab order view, sample status, result entry/upload, report readiness notification. No patient financial controls. |
| Pharmacy User | Prescription view, medicine issue, pharmacy stock/billing where enabled. No clinical diagnosis editing. |
| Billing Staff | Invoice generation, payment collection, partial payment, dues, settlement read access if assigned. Refund/cancel requires explicit permission. |
| Accountant/Back Office | Revenue reports, settlements, receivables, exports where allowed. Usually read/export only for patient clinical data. |
| Auditor/Compliance | Audit logs, security events, selected reports. Read-only by default. |

Module permission matrix:

| Module | View | Create | Edit | Delete/Cancel | Special Controls |
| --- | --- | --- | --- | --- | --- |
| Tenant Management | Super admin | Super admin | Super admin | Super admin | All actions audited with platform purpose. |
| Branch Management | Tenant admin, branch admin | Tenant admin | Tenant admin, branch admin | Tenant admin | Branch scope enforced. |
| User Management | Tenant admin | Tenant admin | Tenant admin | Tenant admin deactivate only | Role assignment audited. |
| Role Management | Tenant admin | Tenant admin | Tenant admin | Tenant admin deactivate only | Cannot grant permissions higher than actor authority. |
| Patient Master | Authorized clinical/admin users | Reception, tenant admin | Reception, tenant admin, authorized clinical users | Tenant admin only, preferably deactivate/merge | Patient view must be audited. |
| Patient 360 | Doctors, authorized staff | System-generated | Add notes only if permitted | No delete for signed history | Important history read-only across same tenant/company. |
| Appointments | Reception, doctor, admin | Reception, online/bot system | Reception/admin | Authorized reception/admin | Emergency priority, cancel, and no-show require reason. |
| Queue/Token | Reception, doctor, admin | System from appointment | Reception/admin/doctor actions | Authorized cancel only | Call, skip, requeue, emergency override audited. |
| Consultation | Doctor, authorized clinical staff | Doctor | Draft owner/authorized doctor | No delete after sign | Signed consultation immutable; addendum only. |
| Prescription | Doctor, pharmacy read | Doctor | Draft owner before sign | No delete after sign | Pharmacy can dispense, not alter doctor prescription. |
| Lab/Diagnostics | Doctor, lab, admin | Doctor/lab | Lab result staff | Authorized void only | Report release audited. |
| Pharmacy | Doctor read, pharmacy, billing | Pharmacy | Pharmacy | Authorized void only | Stock and issue logs required. |
| Billing/Invoice | Billing, admin, owner | Billing/admin/system | Billing/admin while unpaid | Explicit cancel permission | Invoice cancel and discount require reason. |
| Payments | Billing/admin | Billing/admin | Correction by authorized user | Refund permission only | Partial cash/online payments supported and audited. |
| Doctor Settlement | Owner/admin/back office | System/admin | Admin/accountant | Admin only | Doctor-clinic split changes audited. |
| Communication | Reception/admin/system | System/admin/reception | Admin | Admin | WhatsApp/SMS/voice requires entitlement and provider setting. |
| Reports | Admin, owner, permitted staff | System | Not applicable | Not applicable | Export requires separate permission. |
| Settings | Tenant admin/branch admin | Tenant admin | Tenant admin/branch admin | Tenant admin | Setting changes audited with before/after values. |
| Audit Logs | Super admin, tenant admin, auditor | System | No manual edit | No delete | Append-only storage. |

Clinical data rules:

- Doctors under the same tenant/company can view treatment-relevant patient history for care continuity.
- Historical signed consultations, prescriptions, reports, and invoices must not be overwritten.
- Corrections must use addendum, correction note, reversal, cancellation, or refund workflows depending on record type.
- Patient history access from another branch or doctor must log actor, branch, patient, purpose, and timestamp.
- Sensitive data exports require explicit `export` permission and must be audited.

Role management UI requirements:

- Super admin screen must manage platform users and tenant access.
- Tenant admin screen must manage tenant users, role templates, custom roles, and permission assignment.
- Role editor must show modules with action checkboxes: view, create, edit, delete/cancel, approve/sign, export, manage.
- User creation must assign tenant, branch, department/practitioner linkage, active status, and one or more roles.
- Role changes must take effect on next request and should invalidate or refresh active sessions when permissions are reduced.
- The UI must clearly show why a feature is unavailable: no role permission, no subscription entitlement, inactive module, or wrong branch.

## Core Patient Journey

1. Patient books through reception, website, mobile app, WhatsApp, bot, phone call, or QR.
2. Patient receives confirmation and token details.
3. Patient checks in at clinic or joins online consultation.
4. Queue engine manages normal, booked, walk-in, follow-up, and emergency priority.
5. Doctor sees Patient 360 summary and completes consultation.
6. Doctor issues prescription, lab test, scan, physiotherapy, referral, or admission.
7. Billing is generated automatically from configured fee rules.
8. Payments are collected through cash, credit card, debit card, UPI, GPay, Paytm, or mixed partial payment methods.
9. Pharmacy/lab/scan/physio modules continue the treatment journey.
10. Patient receives secure links for prescriptions, reports, invoices, and follow-up reminders.
11. Owner dashboard tracks revenue, doctor utilization, no-shows, repeat visits, settlements, and branch performance.

### Physiotherapy Module Scope

Physiotherapy must work as a separate plug-and-play module for OP and IP care. OP physiotherapy supports registration-linked assessment, pain score, body-region mapping, treatment plan, IFT, ultrasound, TENS, laser, shortwave diathermy, muscle stimulation, exercise therapy, home program, follow-up sessions, and billing. IP physiotherapy supports bedside assessment, post-surgical rehabilitation, CPM, gait training, tilt table, EMS/muscle stimulation, daily reviews, progress tracking, discharge advice, and IP-linked billing. Equipment usage must be tracked by branch, modality, portability, session, duration, intensity, therapist, and patient outcome.

Physiotherapy billing should behave like the doctor appointment and lab billing flows: billable therapy sessions roll into a case-level invoice, discounts are applied before tax, active branch tax rules are resolved automatically unless a specific rule is selected, and the generated invoice remains linked to the physiotherapy case, source appointment, IP admission, and patient. Billing staff should be able to collect cash/card/UPI payments, view paid/balance status, and open receipts from the physiotherapy workspace as well as the central invoice screen.

## Differentiators

### Patient 360 Clinical Brain

Authorized doctors within the same healthcare company can view important treatment-relevant history, but cannot alter signed historical records created by another doctor.

Important data includes:

- Allergies
- Chronic conditions
- Current medicines
- Past diagnosis
- Past prescriptions
- Recent lab abnormalities
- Previous visits
- Procedure history
- Admissions
- Follow-up plans
- Risk alerts

### Smart Queue and Emergency Handling

The system must support:

- Emergency patient priority
- Token skipping with reason
- Requeue if patient is not available
- Auto-cancel after configured missed calls
- Manual restoration by authorized staff
- Waiting time estimation
- Voice token calling in English, Tamil, or English + Tamil based on tenant/branch setting.
- Waiting-area display with reception queue mode and called-token display mode.
- WhatsApp/SMS queue alerts

### Configurable Fee and Revenue Sharing

Fees and settlements should support:

- Appointment booking must not collect or finalize consultation fees. Reception books patient, department, doctor, visit type, and token only.
- Appointment booking UI should use generated calendar slots so staff choose an available doctor time instead of manually typing appointment time.
- Timed appointment booking must validate doctor branch/department mapping, weekly schedule, leave blocks, slot interval, and same-time double booking before confirmation.
- Patient registration must run duplicate detection by patient name, mobile, and guardian mobile before creating a new patient. High-confidence duplicate registration must be blocked and audited.
- Appointment booking must prevent duplicate active bookings for the same patient, doctor, date, and slot. OP/follow-up same-session duplicate checks protect reception from accidental repeated bookings.
- Follow-up booking should be available as a direct appointment workflow that reuses the source appointment branch, patient, department, and practitioner context.
- Reception must capture the visit purpose as part of token booking so daily audit and revenue reports can separate OP consultation, free/paid doctor review, fitness certificate, follow-up, emergency, online, home visit, and procedure visits.
- Doctor review visits can be free within configured review validity or chargeable based on tenant policy; both cases must remain visible in appointment, consultation, billing, audit, and revenue reports.
- Fitness certificate visits are a distinct consultation type. The doctor records clinical findings and signs the consultation, then billing uses certificate-specific fee rules or zero-fee policy as configured.
- Emergency appointments can skip normal schedule timing while still preserving practitioner/branch/department audit context.
- Consultation fee must be calculated during billing after doctor consultation context is available.
- A doctor can serve multiple departments within a tenant, such as general consultation, pediatrics, and diabetology.
- Fee rules must support doctor, branch, department/specialty, visit type, treatment type, emergency/online/home visit cases, and tenant overrides.
- Treatment type examples include general consultation, doctor review, fitness certificate, pediatric consultation, diabetology consultation, procedure review, follow-up, emergency consultation, online consultation, and home visit.
- OP consultation
- IP fixed fee
- IP percentage fee
- Online consultation
- Home visit
- Emergency fee
- Follow-up/review fee
- Procedure fee
- Branch-specific overrides
- Doctor-specific overrides
- Fixed doctor payout
- Percentage split such as 60% doctor and 40% clinic
- Monthly doctor settlement ledger

### Lab and Pharmacy Foundations

Lab and pharmacy must work as operational modules, not only as text fields inside doctor consultation.

Lab use cases:

- Doctor creates a lab referral during consultation, and after signing or saving the consultation the lab team can convert the referral into a lab order.
- Reception or lab staff can create a direct OP lab order without doctor consultation, useful for walk-in test requests.
- Lab staff can create orders referred from outside clinics or outside doctors, while capturing external referrer details.
- Lab order must track patient, tenant, branch, source, tests, priority, amount, status, notes, and actor.
- Lab staff can maintain a structured test catalog, reusable test packages, and result-entry templates.
- Lab orders can contain structured order items generated from selected tests/packages or doctor referral rows.
- Sample collection can record barcode, sample type, collector, collection time, and notes.
- Result release can attach report URL/file metadata and produce a downloadable report PDF.
- Report-ready notifications should be queued through enabled communication providers when subscription entitlements and tenant settings allow them.
- Linked lab orders and result status should be visible inside doctor consultation detail.
- Lab workflow must support ordered, sample collected, in progress, result ready, report delivered, and cancelled states.
- Result release must capture summary, abnormal flag, report URL/file metadata, releasing user, and release time.
- Abnormal lab result should be visible to doctor in future Patient 360 clinical summary.
- Cancelled lab orders require reason and audit.
- Lab access requires both subscription entitlement and role permission.

Pharmacy use cases:

- Doctor prescription from consultation can be converted into a pharmacy issue/dispense record.
- Pharmacy staff can create direct OP medicine issue without consultation, useful for OTC or repeat purchase workflows when allowed by clinic policy.
- Pharmacy staff can create medicine issue from external prescription, while capturing external prescriber details.
- Pharmacy issue must track patient, tenant, branch, source, medicine text, amount, status, notes, issuer, dispenser, and dispense time.
- Pharmacy staff can maintain medicine catalog, suppliers, GST-aware purchases, batches, expiry, expired returns, and stock ledger.
- Purchase entry should capture purchase date, purchase order id, supplier invoice, supplier discount percentage, line discount percentage, CGST, SGST, taxable value, total GST, increase stock, and create stock ledger records.
- Expired or damaged medicine return should reduce batch stock, create return stock ledger records, and preserve supplier/purchase reference where available.
- Dispensing should reduce batch stock, create stock ledger records, and prevent dispensing when stock is insufficient.
- Pharmacy issue items should support substitutes and retain the original substituted medicine reference.
- Low-stock alerts should compare quantity on hand with medicine reorder level.
- Pharmacy issues should be linkable to billing invoice records for revenue tracking.
- Pharmacy workflow must support requested, partially dispensed, dispensed, and cancelled states.
- Cancelled pharmacy issue requires reason and audit.
- Pharmacy billing and stock integration can be added later, but this foundation must preserve clean references to patient, consultation, and branch.
- Pharmacy access requires both subscription entitlement and role permission.

Doctor consultation integration:

- Doctor consultation screen should allow doctors to enter structured vitals, complaint rows, diagnosis rows, prescription medicine rows, lab/scan referral rows, follow-up advice, patient remarks, and supporting free-text notes.
- Department-wise clinical templates should prefill common complaint/diagnosis/referral patterns while allowing doctors to edit before signing.
- Signed consultation records are immutable. Corrections after signing must be captured only through addendums with actor and timestamp audit.
- Lab and pharmacy teams should receive signed consultation referrals as actionable work items.
- Doctor should not need to re-enter data after consultation; lab/pharmacy records should be generated from consultation content.
- If consultation has no lab referral or no prescription, the respective module should not create duplicate or empty operational records.
- Duplicate lab/pharmacy records for the same consultation should be prevented unless a future addendum workflow explicitly allows an additional order.

Compliance and audit expectations:

- Every lab order creation, sample/status transition, result release, pharmacy issue creation, dispense, and cancellation must be audited.
- Patient clinical data shown to lab/pharmacy users must be limited to operationally required information.
- Lab and pharmacy staff must not be able to edit signed doctor consultation records.
- Tenant and branch isolation applies to all lab and pharmacy data.

### Payment and Settlement

The billing workflow should support:

- Cash payment.
- Credit card.
- Debit card.
- UPI.
- GPay.
- Paytm.
- Bank transfer.
- Mixed payments, such as partial cash and partial UPI.
- Partial payment with pending balance.
- Payment reference numbers for UPI, card, bank transfer, and other traceable payments.
- Refund records with linked credit notes.
- Invoice cancellation guardrails.
- Doctor settlement reports based on consultation revenue share.
- GST/tax rules by tenant and branch where applicable.
- Discount approval before discounted invoices are generated.
- Receipt PDF download after invoice/payment activity.
- Due collection, branch revenue, doctor revenue, and department revenue reports.
- Finalized doctor settlement records that preserve the settlement period, amount, and finalizing user.

### Automation Layer

Automation should cover:

- Appointment booking bot
- WhatsApp booking and reminders
- AI voice appointment confirmation
- Voice token calling
- Follow-up reminders
- Payment reminders
- Lab report ready notifications
- Missed appointment recovery
- Patient feedback collection

## Business Goal

MedizinHub HMS should be priced and packaged so a small Indian clinic can start with a low-cost plan, then grow through feature modules, patient volume, branches, doctors, WhatsApp automation, AI voice, and advanced analytics.

## Subscription Management Scope

Super admin users from the primary MedizinHub HMS tenant must be able to manage subscription revenue without developer changes:

- Create custom SaaS plans with patient, branch, doctor, module, and monthly price limits.
- Edit plans and change plans between active and inactive states.
- Assign a plan to a tenant immediately, schedule a renewal plan for a future activation date, or upgrade a tenant to a higher plan when current limits are reached.
- Purchase additional credits, starting with patient credits, when a tenant temporarily exceeds plan limits.
- Generate subscription invoices for plan assignment, renewal, upgrades, and credit purchases.
- Track created/modified metadata, status, and audit logs for plan, tenant subscription, credit, and invoice changes.
- Show tenant usage, revenue summary, pending invoice amount, active subscriptions, scheduled subscriptions, and expiring subscription reports to super admin.
- Notify tenant admins with top-of-screen announcements when subscriptions are expiring, usage is near limit, or an upgrade/credit purchase is recommended.
- Reports module must support super admin platform-wide reports and tenant admin tenant-scoped reports. Report screens need advanced search, date filters, pagination, and export to CSV, PDF, and spreadsheet-compatible XLS.
- SaaS revenue operations must track issued, paid, pending, failed, and cancelled subscription invoices; payment gateway references; failed payment recovery reason; GST/tax totals; plan-wise MRR; tenant usage; and exportable revenue reports.

Subscription enforcement remains API-level: frontend warnings are helpful, but patient limits, module entitlements, active subscription status, tenant scope, and branch scope must be checked by the backend.
