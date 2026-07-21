# MedizinHub HMS API Permission Matrix

This matrix documents the current backend API protection model. All protected tenant APIs require:

- `Authorization: Bearer <token>`
- `X-Tenant-ID: <tenant_id>` unless the endpoint is public/platform-only

Super admin bypasses permission checks. Tenant users must belong to the tenant in `X-Tenant-ID`.

Current enforced guardrails:

- Inactive users cannot authenticate through protected APIs.
- Inactive roles no longer grant permissions, even if still assigned to a user.
- Suspended tenants are blocked for tenant users on protected tenant APIs.
- Branch-scoped users can access only their assigned branch when a record or query is branch-specific.
- Doctor users are scoped to their linked active practitioner profile for practitioner, appointment, queue, and consultation workflows. A doctor can only list their own practitioner profile and only list, open, call, requeue, start, create, update, sign, or addend consultations for appointments assigned to that same practitioner inside the selected tenant and branch scope.
- Core clinical modules are entitlement-checked at API level: patients, appointments, queue, consultations, billing basic, billing advanced, lab, and pharmacy.
- New custom subscription plans with no explicit module list default to core HMS modules: patients, appointments, queue, consultations, and billing basic.

## Permission Catalog

| Permission | Purpose |
| --- | --- |
| `platform.tenants.manage` | Primary tenant platform management for tenant CRUD and tenant metadata |
| `platform.subscriptions.manage` | Platform subscription plan and tenant subscription management |
| `identity.users.manage` | Tenant user management |
| `identity.roles.manage` | Tenant role management |
| `identity.roles.create/read/edit/delete` | Granular role CRUD controls for permission matrix based roles |
| `settings.manage` | Tenant/branch settings |
| `settings.create/read/edit/delete` | Granular tenant settings and master-data controls |
| `practitioners.manage` | Practitioner master, schedules, leave, room assignment |
| `patients.read` | Patient search/detail/summary view |
| `patients.write` | Patient and patient alert creation |
| `patients.create/edit/delete` | Granular patient master controls |
| `appointments.manage` | Appointment booking/listing and practitioner calendar read for booking |
| `appointments.create/read/edit/delete` | Granular appointment controls |
| `queue.manage` | Token queue transitions |
| `consultations.read` | Consultation list/detail |
| `consultations.write` | Draft consultation edits and addendums |
| `consultations.sign` | Sign/lock consultation |
| `billing.manage` | Fee rules, invoice creation/listing/cancel |
| `billing.discounts.approve` | Approve discount requests on invoices |
| `billing.refunds.manage` | Full refund authority (approve/execute) |
| `billing.refunds.request` | Raise a refund request for approval, without refund authority |
| `invoices.create/read/edit/delete` | Granular invoice controls |
| `invoices.cancel_request` | Request invoice cancellation for admin approval, without delete authority |
| `payments.manage` | Payment collection and refund |
| `settlements.read` | Doctor settlement reports |
| `lab.manage` | Lab orders/results |
| `lab.create/read/edit/delete` | Granular lab workflow controls |
| `lab.results.manage` | Update and publish lab results |
| `pharmacy.manage` | Pharmacy issues/status |
| `pharmacy.create/read/edit/delete` | Granular pharmacy workflow controls |
| `pharmacy.dispense` | Dispense medicines against a prescription/issue |
| `service_items.manage` | Full control of shared service/item master data used on invoices |
| `service_items.create/read/edit/delete` | Granular service/item master data controls |
| `physiotherapy.manage` | Physiotherapy case, session, equipment, and billing workflow controls |
| `physiotherapy.create/read/edit/delete` | Granular physiotherapy workflow controls |
| `home_care.manage` | Home-care service catalog, booking, and billing workflow controls |
| `home_care.create/read/edit/delete` | Granular home-care service and booking controls |
| `notifications.manage` | Notification queue create/list |
| `audit.read` | Audit event create/list/detail |
| `error_logs.read` | View and search tenant error logs |
| `error_logs.manage` | Resolve, reopen, and delete tenant error logs |
| `reports.read` | Subscription active/entitlement reads and future reports |

## Public and Auth APIs

| Method | Endpoint | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health` | Public | Health check |
| `GET` | `/api/v1/readiness` | Public | Readiness check |
| `GET` | `/api/v1/modules` | Public | Module manifest |
| `POST` | `/api/v1/auth/bootstrap-super-admin` | Bootstrap guarded | Only works when no super admin exists |
| `POST` | `/api/v1/auth/login` | Public | Returns bearer token |
| `GET` | `/api/v1/auth/me` | Authenticated | Current user, roles, permissions |
| `POST` | `/api/v1/auth/logout` | Authenticated | Revokes current session |
| `POST` | `/api/v1/auth/change-password` | Authenticated | Changes current user's password |
| `POST` | `/api/v1/client-logs` | Authenticated tenant user | Legacy frontend error/warning capture path |
| `POST` | `/api/v1/error-logs/client` | Authenticated tenant user | Persistent frontend error/warning capture path |

## Error Logs

Error Logs is intentionally hidden from the sidebar. Users with `error_logs.read` or `error_logs.manage` open it through the global module search.

| Method | Endpoint | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/error-logs` | `error_logs.read` or `error_logs.manage` |
| `GET` | `/api/v1/error-logs/{error_log_id}` | `error_logs.read` or `error_logs.manage` |
| `PATCH` | `/api/v1/error-logs/{error_log_id}` | `error_logs.manage` |
| `DELETE` | `/api/v1/error-logs/{error_log_id}` | `error_logs.manage` |

## Tenant and Platform

| Method | Endpoint | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/tenants` | `platform.tenants.manage` |
| `POST` | `/api/v1/tenants/onboard` | Super admin only; creates customer tenant, branches, subscription, and tenant admin |
| `GET` | `/api/v1/tenants` | `platform.tenants.manage` |
| `GET` | `/api/v1/tenants/current/branding` | Authenticated tenant user; own-tenant letterhead branding |
| `GET` | `/api/v1/tenants/{tenant_id}` | `platform.tenants.manage` |
| `PATCH` | `/api/v1/tenants/{tenant_id}` | `platform.tenants.manage` |
| `DELETE` | `/api/v1/tenants/{tenant_id}` | `platform.tenants.manage` |
| `POST` | `/api/v1/tenants/{tenant_id}/branches` | Tenant admin or super admin |
| `GET` | `/api/v1/tenants/{tenant_id}/branches` | `settings.manage` |
| `PATCH` | `/api/v1/tenants/{tenant_id}/branches/{branch_id}` | Tenant admin or super admin |
| `POST` | `/api/v1/tenants/{tenant_id}/branches/{branch_id}/status` | Tenant admin or super admin |
| `DELETE` | `/api/v1/tenants/{tenant_id}/branches/{branch_id}` | Tenant admin or super admin; soft deactivates |
| `POST` | `/api/v1/tenants/{tenant_id}/logo` | Tenant admin or super admin |
| `POST` | `/api/v1/tenants/{tenant_id}/departments` | Tenant admin or super admin |
| `GET` | `/api/v1/tenants/{tenant_id}/departments` | `settings.manage` |
| `GET` | `/api/v1/tenants/{tenant_id}/departments/{department_id}` | `settings.manage` |
| `PATCH` | `/api/v1/tenants/{tenant_id}/departments/{department_id}` | Tenant admin or super admin |
| `POST` | `/api/v1/tenants/{tenant_id}/departments/{department_id}/status` | Tenant admin or super admin |
| `DELETE` | `/api/v1/tenants/{tenant_id}/departments/{department_id}` | Tenant admin or super admin; soft deactivates |
| `POST` | `/api/v1/subscription-plans` | `platform.subscriptions.manage` |
| `GET` | `/api/v1/subscription-plans` | `platform.subscriptions.manage` |
| `PATCH` | `/api/v1/subscription-plans/{plan_id}` | `platform.subscriptions.manage` |
| `POST` | `/api/v1/subscription-plans/{plan_id}/status` | `platform.subscriptions.manage` |
| `POST` | `/api/v1/subscription-plans/tenant-subscriptions` | `platform.subscriptions.manage` |
| `GET` | `/api/v1/subscription-plans/tenant-subscriptions` | `platform.subscriptions.manage` |
| `GET` | `/api/v1/subscription-plans/tenant-subscriptions/active` | `reports.read` |
| `GET` | `/api/v1/subscription-plans/entitlements` | `reports.read` |
| `POST` | `/api/v1/subscription-plans/credits` | `platform.subscriptions.manage` |
| `GET` | `/api/v1/subscription-plans/credits` | `platform.subscriptions.manage` |
| `POST` | `/api/v1/subscription-plans/invoices` | `platform.subscriptions.manage` |
| `GET` | `/api/v1/subscription-plans/invoices` | `platform.subscriptions.manage` |
| `POST` | `/api/v1/subscription-plans/invoices/{invoice_id}/settle` | `platform.subscriptions.manage` |
| `POST` | `/api/v1/subscription-plans/invoices/{invoice_id}/payment-failed` | `platform.subscriptions.manage` |
| `GET` | `/api/v1/subscription-plans/usage` | `reports.read` |
| `GET` | `/api/v1/subscription-plans/announcements` | `reports.read` |
| `GET` | `/api/v1/subscription-plans/reports/revenue` | `reports.read` |
| `GET` | `/api/v1/subscription-plans/reports/revenue?export=csv|xls|pdf` | `reports.read` |
| `GET` | `/api/v1/subscription-plans/platform/revenue-summary` | `platform.subscriptions.manage` |

## Identity and RBAC

| Method | Endpoint | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/identity/roles` | `identity.roles.manage` |
| `GET` | `/api/v1/identity/roles` | `identity.roles.manage` |
| `PATCH` | `/api/v1/identity/roles/{role_id}` | `identity.roles.manage` |
| `POST` | `/api/v1/identity/roles/{role_id}/status` | `identity.roles.manage` |
| `DELETE` | `/api/v1/identity/roles/{role_id}` | `identity.roles.manage` |
| `GET` | `/api/v1/identity/permissions` | Authenticated |
| `POST` | `/api/v1/identity/roles/{role_id}/assign/{target_tenant_id}` | Super admin only; copies/promotes reusable role by key across tenants |
| `POST` | `/api/v1/identity/users` | `identity.users.manage` |
| `GET` | `/api/v1/identity/users` | `identity.users.manage` |
| `PATCH` | `/api/v1/identity/users/{user_id}` | `identity.users.manage` |
| `POST` | `/api/v1/identity/users/{user_id}/password-reset` | `identity.users.manage` |
| `POST` | `/api/v1/identity/users/{user_id}/status` | `identity.users.manage` |
| `DELETE` | `/api/v1/identity/users/{user_id}` | `identity.users.manage` |

## Global Templates

The primary platform tenant is `MedizinHub HMS`. Role, department, and branch records created under this primary tenant are treated as global templates for platform onboarding. A primary tenant super admin can assign/copy these templates into customer tenants. Super admin can also promote reusable defaults from a demo/customer tenant into the primary tenant. Assignment is idempotent: matching role keys, department codes, or branch codes update the existing tenant record instead of creating duplicates.

Secondary tenant admins keep the existing tenant-scoped screens and APIs. They can manage only their own tenant roles, role permissions, users, departments, and branches according to their assigned permissions.

| Method | Endpoint | Access |
| --- | --- | --- |
| `POST` | `/api/v1/tenants/departments/{department_id}/assign/{target_tenant_id}` | Super admin only; copies/promotes reusable department by code across tenants |
| `POST` | `/api/v1/tenants/branches/{branch_id}/assign/{target_tenant_id}` | Super admin only; copies/promotes reusable branch by code across tenants |

## Patient

| Method | Endpoint | Permission | Audit |
| --- | --- | --- | --- |
| `POST` | `/api/v1/patients` | `patients.write` | Creates patient audit |
| `POST` | `/api/v1/patients/duplicates` | `patients.read` | Detects likely duplicate patient before registration |
| `GET` | `/api/v1/patients` | `patients.read` | Search/list |
| `GET` | `/api/v1/patients/{patient_id}` | `patients.read` | Patient detail |
| `PATCH` | `/api/v1/patients/{patient_id}` | `patients.edit` | Updates patient demographics/status audit |
| `DELETE` | `/api/v1/patients/{patient_id}` | `patients.delete` | Soft delete by deactivating patient audit |
| `POST` | `/api/v1/patients/{patient_id}/alerts` | `patients.write` | Creates alert audit |
| `GET` | `/api/v1/patients/{patient_id}/alerts` | `patients.read` | Alert list |
| `POST` | `/api/v1/patients/{patient_id}/photo` | `patients.edit` | Uploads or replaces patient photo/document reference |
| `GET` | `/api/v1/patients/{patient_id}/summary` | `patients.read` | Records patient history viewed audit |

Patient APIs enforce the `patients` module entitlement and branch scope for branch-assigned users.

## Patient Subscriptions

| Method | Endpoint | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/patient-subscriptions/plans` | `patient_subscriptions.create` |
| `GET` | `/api/v1/patient-subscriptions/plans` | `patient_subscriptions.read` |
| `PATCH` | `/api/v1/patient-subscriptions/plans/{plan_id}` | `patient_subscriptions.edit` |
| `DELETE` | `/api/v1/patient-subscriptions/plans/{plan_id}` | `patient_subscriptions.delete` |
| `POST` | `/api/v1/patient-subscriptions/enrollments` | `patient_subscriptions.create` |
| `GET` | `/api/v1/patient-subscriptions/enrollments` | `patient_subscriptions.read` |
| `PATCH` | `/api/v1/patient-subscriptions/enrollments/{enrollment_id}` | `patient_subscriptions.edit` |
| `DELETE` | `/api/v1/patient-subscriptions/enrollments/{enrollment_id}` | `patient_subscriptions.delete` |
| `POST` | `/api/v1/patient-subscriptions/benefits/preview` | `patient_subscriptions.read` |

Patient subscription APIs enforce the `patient_subscriptions` module entitlement, tenant ownership, and branch scope. Plans define free consultations plus lab/pharmacy free or discounted benefits. Enrollments create the active patient membership window and can link to the purchase invoice; benefit preview is used before billing to calculate free items, discounted items, and payable amount.

## Practitioner, Schedule, and Calendar

| Method | Endpoint | Permission | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/practitioners` | `practitioners.manage` | Create master and mappings |
| `GET` | `/api/v1/practitioners` | `appointments.manage` | Read doctors for booking screen |
| `GET` | `/api/v1/practitioners/{practitioner_id}` | `practitioners.manage` | Admin detail |
| `PATCH` | `/api/v1/practitioners/{practitioner_id}` | `practitioners.manage` | Admin update |
| `DELETE` | `/api/v1/practitioners/{practitioner_id}` | `practitioners.manage` | Soft delete by deactivating practitioner |
| `GET` | `/api/v1/practitioners/schedules` | `practitioners.manage` | Tenant-wide schedule management list |
| `PATCH` | `/api/v1/practitioners/schedules/{schedule_id}` | `practitioners.manage` | Update weekly schedule |
| `DELETE` | `/api/v1/practitioners/schedules/{schedule_id}` | `practitioners.manage` | Soft delete by deactivating schedule |
| `POST` | `/api/v1/practitioners/{practitioner_id}/schedules` | `practitioners.manage` | Create weekly schedule |
| `GET` | `/api/v1/practitioners/{practitioner_id}/schedules` | `practitioners.manage` | Admin schedule list |
| `POST` | `/api/v1/practitioners/{practitioner_id}/leaves` | `practitioners.manage` | Create leave block |
| `GET` | `/api/v1/practitioners/{practitioner_id}/leaves` | `practitioners.manage` | Admin leave list |
| `POST` | `/api/v1/practitioners/{practitioner_id}/room-assignments` | `practitioners.manage` | Create room assignment |
| `GET` | `/api/v1/practitioners/{practitioner_id}/room-assignments` | `practitioners.manage` | Admin room assignment list |
| `GET` | `/api/v1/practitioners/{practitioner_id}/eligibility` | `appointments.manage` | Booking-time branch/department check |
| `GET` | `/api/v1/practitioners/{practitioner_id}/availability` | `appointments.manage` | Single time availability check |
| `GET` | `/api/v1/practitioners/{practitioner_id}/calendar` | `appointments.manage` | Generated available/booked/leave/unavailable slots |

For `user_type=doctor`, `GET /api/v1/practitioners` is restricted to the practitioner's own linked active profile so doctor dashboards cannot populate dropdowns with other doctors from the same specialty.

## Appointment and Queue

| Method | Endpoint | Permission | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/appointments` | `appointments.manage` | Creates appointment, token queue entry, notification trigger; prevents duplicate active patient/doctor/slot bookings |
| `GET` | `/api/v1/appointments` | `appointments.manage` | List appointments |
| `GET` | `/api/v1/appointments/{appointment_id}` | `appointments.manage` | Appointment detail |
| `POST` | `/api/v1/appointments/{appointment_id}/follow-up` | `appointments.manage` | Books follow-up using source appointment context |
| `GET` | `/api/v1/appointments/platform/all` | `platform.tenants.manage` | Cross-tenant platform appointment search |
| `GET` | `/api/v1/queue` | `queue.manage` | Queue list |
| `GET` | `/api/v1/queue/display` | `queue.manage` | Queue display rows for reception/called-token screens with language-aware call text |
| `POST` | `/api/v1/queue/{entry_id}/call` | `queue.manage` | Token call and notification trigger |
| `POST` | `/api/v1/queue/{entry_id}/mark-not-available` | `queue.manage` | Missed patient |
| `POST` | `/api/v1/queue/{entry_id}/requeue` | `queue.manage` | Requeue token |
| `POST` | `/api/v1/queue/{entry_id}/cancel` | `queue.manage` | Cancel queue entry/appointment |
| `POST` | `/api/v1/queue/{entry_id}/no-show` | `queue.manage` | Mark no-show |
| `POST` | `/api/v1/queue/{entry_id}/start-consultation` | `queue.manage` | Starts consultation workflow |

Appointment APIs enforce the `appointments` module entitlement. Queue APIs enforce the `queue` module entitlement. Both enforce branch scope for branch-assigned users. For `user_type=doctor`, the backend additionally resolves `practitioner.user_id = current_user.id` and restricts appointment and queue reads/actions to that practitioner. Appointment create/read responses carry visit purpose, source appointment linkage, and billable/free-review status so OP, doctor review, fitness certificate, follow-up, and emergency visits can be audited and billed consistently.

## Consultation

| Method | Endpoint | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/consultations` | `consultations.write` |
| `GET` | `/api/v1/consultations/clinical-templates` | `consultations.read` |
| `GET` | `/api/v1/consultations` | `consultations.read` |
| `POST` | `/api/v1/consultations/clinical-templates` | `consultations.write` |
| `GET` | `/api/v1/consultations/by-department/{department_id}/clinical-templates` | `consultations.read` |
| `GET` | `/api/v1/consultations/{consultation_id}` | `consultations.read` |
| `PATCH` | `/api/v1/consultations/{consultation_id}` | `consultations.write` |
| `POST` | `/api/v1/consultations/{consultation_id}/sign` | `consultations.sign` |
| `POST` | `/api/v1/consultations/{consultation_id}/addendums` | `consultations.write` |

Consultation APIs enforce the `consultations` module entitlement and branch scope. For `user_type=doctor`, consultation reads and writes are restricted to consultations whose `practitioner_id` matches the logged-in user's linked active practitioner profile. Draft consultations can save structured vitals, complaints, diagnoses, medicines, lab/scan referrals, follow-up advice, and notes. Signed consultation records remain immutable except addendums.

## IP Admission

| Method | Endpoint | Permission | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/ip/rooms` | `ip.create` | Create ward/room/bed master with daily room charge |
| `GET` | `/api/v1/ip/rooms` | `ip.read` | List branch-scoped IP rooms with date-range availability |
| `PATCH` | `/api/v1/ip/rooms/{room_id}` | `ip.edit` | Update room master or active status |
| `POST` | `/api/v1/ip/admissions` | `ip.create` | Admit patient into an available room/bed for selected date range |
| `POST` | `/api/v1/ip/admissions/from-appointment/{appointment_id}` | `ip.create` | Convert OP appointment to IP admission |
| `GET` | `/api/v1/ip/admissions` | `ip.read` | List branch-scoped IP admissions |
| `PATCH` | `/api/v1/ip/admissions/{admission_id}` | `ip.edit` | Update admission demographics, room/bed, diagnosis, Aadhaar, or status fields |
| `POST` | `/api/v1/ip/admissions/{admission_id}/document` | `ip.edit` | Upload admission proof, referral, or Aadhaar document |
| `GET` | `/api/v1/ip/admissions/{admission_id}/documents` | `ip.read` | List admission documents |
| `POST` | `/api/v1/ip/admissions/{admission_id}/documents` | `ip.edit` | Upload additional admission documents |
| `GET` | `/api/v1/ip/admissions/{admission_id}/treatments` | `ip.read` | List treatment orders and care entries |
| `POST` | `/api/v1/ip/admissions/{admission_id}/treatments` | `ip.edit` | Create treatment order or care entry |
| `POST` | `/api/v1/ip/admissions/{admission_id}/consents` | `ip.edit` | Create consent request |
| `POST` | `/api/v1/ip/consents/{consent_id}/sign` | `ip.edit` | Sign consent |
| `POST` | `/api/v1/ip/admissions/{admission_id}/consultations` | `ip.edit` | Record IP doctor visit/round with optional visit fee |
| `POST` | `/api/v1/ip/consultations/{consultation_id}/sign` | `ip.edit` | Sign doctor visit and create a billable consultation line when fee is configured |
| `POST` | `/api/v1/ip/admissions/{admission_id}/medication-orders` | `ip.edit` | Create IP medication order with per-dose charge |
| `GET` | `/api/v1/ip/admissions/{admission_id}/medication-orders` | `ip.read` | List IP medication orders |
| `POST` | `/api/v1/ip/admissions/{admission_id}/medication-orders/{order_id}/administrations` | `ip.edit` | Record MAR dose; given doses create billable medicine lines |
| `GET` | `/api/v1/ip/admissions/{admission_id}/medication-administrations` | `ip.read` | List MAR dose history |
| `GET` | `/api/v1/ip/admissions/{admission_id}/billing-items` | `ip.read` | Running bill from clinical events |
| `POST` | `/api/v1/ip/admissions/{admission_id}/billing-items` | `ip.edit` | Add manual running-bill line |
| `GET` | `/api/v1/ip/admissions/{admission_id}/charges` | `ip.read` | List legacy/manual IP charge rows |
| `POST` | `/api/v1/ip/admissions/{admission_id}/charges` | `ip.edit` | Add legacy/manual IP charge row |
| `POST` | `/api/v1/ip/admissions/{admission_id}/discharge-summary` | `ip.edit` | Draft discharge summary |
| `POST` | `/api/v1/ip/discharge-summaries/{summary_id}/finalize` | `ip.edit` | Finalize discharge summary |
| `GET` | `/api/v1/ip/discharge-summaries/{summary_id}/pdf` | `ip.read` | Download discharge summary PDF |
| `GET` | `/api/v1/ip/admissions/{admission_id}/invoice` | `billing.manage` | Read linked IP invoice when one exists |
| `POST` | `/api/v1/ip/admissions/{admission_id}/invoice` | `billing.manage` | Creates or refreshes IP invoice with automatic room charge, manual charges, signed consultation billables, medication administrations, and lab/scan referrals |

IP admission APIs enforce tenant, branch, room availability, and module entitlement checks. Admissions can capture a validated 12-digit Aadhaar number and one admission proof/identity document. A room/bed cannot be reused for overlapping active admission date ranges. Room rent is calculated from admission date through discharge summary date, or planned discharge/current date when discharge is not finalized. Signed IP consultations and given MAR doses create linked billable items for the running bill and final invoice. IP invoice generation also backfills older care entries by reading medicine administrations and lab/scan rows from treatment orders, using pharmacy/lab catalog prices when explicit row amounts are missing.

## Billing, Payments, and Settlements

| Method | Endpoint | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/billing/doctor-fee-rules` | `billing.manage` |
| `GET` | `/api/v1/billing/doctor-fee-rules` | `billing.manage` |
| `POST` | `/api/v1/billing/tax-rules` | `billing.manage` |
| `GET` | `/api/v1/billing/tax-rules` | `billing.manage` |
| `PATCH` | `/api/v1/billing/tax-rules/{rule_id}` | `billing.manage` |
| `POST` | `/api/v1/billing/discount-offers` | `billing.manage` |
| `GET` | `/api/v1/billing/discount-offers` | `billing.manage` |
| `PATCH` | `/api/v1/billing/discount-offers/{offer_id}` | `billing.manage` |
| `POST` | `/api/v1/billing/discount-approvals` | `billing.manage` |
| `POST` | `/api/v1/billing/discount-approvals/{approval_id}/decision` | `billing.manage` |
| `POST` | `/api/v1/billing/invoices/from-consultation` | `billing.manage` |
| `POST` | `/api/v1/billing/invoices/from-lab-order` | `billing.manage` |
| `POST` | `/api/v1/billing/invoices/from-pharmacy-issue` | `billing.manage` |
| `GET` | `/api/v1/billing/invoices` | `billing.manage` |
| `GET` | `/api/v1/billing/invoices/{invoice_id}` | `billing.manage` |
| `POST` | `/api/v1/billing/invoices/{invoice_id}/membership-benefit/apply` | `billing.manage` |
| `POST` | `/api/v1/billing/invoices/{invoice_id}/credit-notes` | `payments.manage` |
| `POST` | `/api/v1/billing/invoices/{invoice_id}/payments` | `payments.manage` |
| `POST` | `/api/v1/billing/payments/{payment_id}/refund` | `payments.manage` |
| `POST` | `/api/v1/billing/invoices/{invoice_id}/adjustment-requests` | Any of `billing.manage`, `invoices.read`, `invoices.edit`, `payments.manage` |
| `POST` | `/api/v1/billing/adjustment-requests/{request_id}/approve` | `billing.manage` |
| `POST` | `/api/v1/billing/adjustment-requests/{request_id}/reject` | `billing.manage` |
| `POST` | `/api/v1/billing/adjustment-requests/{request_id}/execute` | `billing.manage` |
| `POST` | `/api/v1/billing/invoices/{invoice_id}/cancel` | `billing.manage` |
| `POST` | `/api/v1/billing/invoices/{invoice_id}/amend` | `billing.manage` |
| `GET` | `/api/v1/billing/invoices/{invoice_id}/items/{item_id}/supplier-options` | `billing.manage` |
| `PATCH` | `/api/v1/billing/invoices/{invoice_id}/items/{item_id}/supplier` | `billing.manage` |
| `GET` | `/api/v1/billing/doctor-settlements/summary` | `settlements.read` |
| `POST` | `/api/v1/billing/doctor-settlements/finalize` | `billing.manage` |
| `GET` | `/api/v1/billing/reports/due-collection` | `reports.read` |
| `GET` | `/api/v1/billing/reports/revenue` | `reports.read` |
| `GET` | `/api/v1/billing/reports/collections` | `billing.manage` or `reports.revenue.read` |

Billing APIs enforce `billing_basic` for fee rules, tax rules, invoice reads, payments, refunds, credit notes, and cancellations. Invoice generation, discount approval, settlement finalization, and revenue reporting enforce `billing_advanced`. Branch-scoped users can access only branch-matching invoices, payments, fee rules, tax rules, credit notes, reports, and settlements. Doctor settlement summary returns paid-basis doctor share, finalized settlement amount, remaining payable amount, and `can_finalize`; duplicate finalization is rejected after the payable amount reaches zero.

`adjustment-requests` accepts `request_type` of `cancel`, `full_refund`, `partial_refund`, or `discount`. The old direct "edit invoice amount" action is gone — a `discount` request now works for any invoice type (consultation, OP or non-OP, lab, pharmacy, physiotherapy, home care, IP, or direct) as long as no payment has been recorded yet, through the same request → approve → execute flow as `full_refund`/`partial_refund`, approved/rejected/executed with the identical `billing.manage` gate. For a consultation invoice, execution recomputes subtotal/tax/doctor-share from the lower fee, exactly as the old direct edit did; for every other invoice type it knocks the discount straight off the total/balance without touching per-item tax, the same coarse-grained way cancel/refund already adjust an invoice's top-level totals. Credit notes remain a separate, immediate, informational-only action (`POST .../credit-notes`) — issuing one records a note against the invoice and does not change its total, balance, or paid amount; a `discount`/refund execution additionally creates a `CreditNote` as part of its own audit trail.

## Monthly Email Reports

| Method | Endpoint | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/reports/monthly-email/config` | `settings.manage` |
| `PUT` | `/api/v1/reports/monthly-email/config` | `settings.manage` |
| `POST` | `/api/v1/reports/monthly-email/send` | Any of `reports.read`, `settings.manage`, `billing.manage` |
| `GET` | `/api/v1/reports/monthly-email/jobs` | Any of `reports.read`, `settings.manage`, `billing.manage` |
| `GET` | `/api/v1/reports/monthly-email/jobs/{job_id}/download` | Any of `reports.read`, `settings.manage`, `billing.manage` |
| `POST` | `/api/v1/reports/profit-email/send` | Any of `reports.read`, `settings.manage`, `billing.manage` |
| `GET` | `/api/v1/reports/monthly-snapshots` | Any of `reports.read`, `settings.manage`, `billing.manage` |
| `GET` | `/api/v1/reports/monthly-snapshots/{snapshot_id}` | Any of `reports.read`, `settings.manage`, `billing.manage` |
| `POST` | `/api/v1/reports/monthly-snapshots/archive` | Any of `billing.manage`, `settings.manage` |

Monthly email report APIs require `X-Tenant-ID`. The send endpoint creates a `ReportJob`, pushes the job id to Redis, and returns `202 Accepted`. The worker sends an Excel-compatible `.xls` report through SMTP. Manual send defaults to previous month and supports `from_date` / `to_date` for testing current-month reports.

## Lab and Pharmacy

| Method | Endpoint | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/lab/catalog/tests` | `lab.manage` |
| `GET` | `/api/v1/lab/catalog/tests` | `lab.manage` |
| `PATCH` | `/api/v1/lab/catalog/tests/{test_id}` | `lab.manage` |
| `DELETE` | `/api/v1/lab/catalog/tests/{test_id}` | `lab.manage` |
| `POST` | `/api/v1/lab/catalog/packages` | `lab.manage` |
| `GET` | `/api/v1/lab/catalog/packages` | `lab.manage` |
| `PATCH` | `/api/v1/lab/catalog/packages/{package_id}` | `lab.manage` |
| `DELETE` | `/api/v1/lab/catalog/packages/{package_id}` | `lab.manage` |
| `GET` | `/api/v1/lab/catalog/available-tests` | `lab.manage` |
| `GET` | `/api/v1/lab/catalog/popular-tests` | `lab.manage` |
| `GET` | `/api/v1/lab/consultation-referrals` | Any of `lab.manage`, `lab.read`, `lab.create`, `lab.edit` |
| `POST` | `/api/v1/lab/result-templates` | `lab.manage` |
| `GET` | `/api/v1/lab/result-templates` | `lab.manage` |
| `POST` | `/api/v1/lab/orders` | `lab.manage` |
| `POST` | `/api/v1/lab/orders/from-consultation/{consultation_id}` | `lab.manage` |
| `GET` | `/api/v1/lab/orders` | `lab.manage` |
| `GET` | `/api/v1/lab/orders/{order_id}` | `lab.manage` |
| `PATCH` | `/api/v1/lab/orders/{order_id}/status` | `lab.manage` |
| `POST` | `/api/v1/lab/orders/{order_id}/samples` | `lab.manage` |
| `POST` | `/api/v1/lab/orders/{order_id}/results` | `lab.manage` |
| `GET` | `/api/v1/lab/orders/{order_id}/report.pdf` | `lab.manage` |
| `POST` | `/api/v1/pharmacy/medicines` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/medicines` | `pharmacy.manage` |
| `PATCH` | `/api/v1/pharmacy/medicines/{medicine_id}` | `pharmacy.manage` |
| `DELETE` | `/api/v1/pharmacy/medicines/{medicine_id}` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/catalog/available-medicines` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/catalog/popular-medicines` | `pharmacy.manage` |
| `POST` | `/api/v1/pharmacy/suppliers` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/suppliers` | `pharmacy.manage` |
| `PATCH` | `/api/v1/pharmacy/suppliers/{supplier_id}` | `pharmacy.manage` |
| `DELETE` | `/api/v1/pharmacy/suppliers/{supplier_id}` | `pharmacy.manage` |
| `POST` | `/api/v1/pharmacy/purchases` | `pharmacy.manage` |
| `POST` | `/api/v1/pharmacy/returns` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/batches` | `pharmacy.manage` |
| `POST` | `/api/v1/pharmacy/issues` | `pharmacy.manage` |
| `POST` | `/api/v1/pharmacy/issues/from-consultation/{consultation_id}` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/issues` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/issues/{issue_id}` | `pharmacy.manage` |
| `PATCH` | `/api/v1/pharmacy/issues/{issue_id}/status` | `pharmacy.manage` |
| `PATCH` | `/api/v1/pharmacy/issues/{issue_id}/amount` | `pharmacy.manage` |
| `POST` | `/api/v1/pharmacy/issues/{issue_id}/billing-link` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/stock-ledger` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/low-stock` | `pharmacy.manage` |

Lab APIs enforce module entitlement and branch scope for catalog, packages, templates, direct orders, consultation-derived records, sample collection, result release, report PDF access, and status updates. Result release queues lab-ready notifications when communication provider settings and subscription entitlements allow them. Pharmacy APIs enforce pharmacy entitlement and branch scope for medicine catalog, suppliers, purchase entry with purchase date, PO number, supplier discount, line discount, CGST, SGST, batches, expired stock returns, stock ledger, low-stock alerts, prescription/direct/external issues, dispense stock reduction, substitutes, billing linkage, listing, detail, and status updates.

## Physiotherapy

| Method | Endpoint | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/physiotherapy/equipment` | `physiotherapy.read` |
| `POST` | `/api/v1/physiotherapy/equipment` | `physiotherapy.create` |
| `PATCH` | `/api/v1/physiotherapy/equipment/{equipment_id}` | `physiotherapy.edit` |
| `DELETE` | `/api/v1/physiotherapy/equipment/{equipment_id}` | `physiotherapy.delete` |
| `GET` | `/api/v1/physiotherapy/cases` | `physiotherapy.read` |
| `POST` | `/api/v1/physiotherapy/cases` | `physiotherapy.create` |
| `PATCH` | `/api/v1/physiotherapy/cases/{case_id}` | `physiotherapy.edit` |
| `POST` | `/api/v1/physiotherapy/cases/{case_id}/consent` | `physiotherapy.edit` |
| `GET` | `/api/v1/physiotherapy/cases/{case_id}/sessions` | `physiotherapy.read` |
| `POST` | `/api/v1/physiotherapy/cases/{case_id}/sessions` | `physiotherapy.edit` |
| `GET` | `/api/v1/physiotherapy/cases/{case_id}/invoice` | `billing.manage` |
| `POST` | `/api/v1/physiotherapy/cases/{case_id}/invoice` | `billing.manage` |

Physiotherapy APIs enforce physiotherapy entitlement and branch scope for OP/IP physio cases, equipment catalog, IFT/ultrasound/TENS/laser/SWD/CPM/muscle stimulation sessions, exercises, home program, progress tracking, multiple consent-file upload, and case-level invoice generation. Physiotherapy invoice generation links the invoice to the patient, source appointment, IP admission, and physiotherapy case. It includes billable session line items, discount-before-tax calculation, active branch/global tax rule resolution, payment history in invoice detail responses, and audit events for generated invoices. Payment collection uses the shared billing endpoints, while the frontend renders printable invoices from invoice detail data.

## Home Care

| Method | Endpoint | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/home-care/services` | Any of `home_care.read`, `home_care.manage` |
| `POST` | `/api/v1/home-care/services` | Any of `home_care.create`, `home_care.manage` |
| `PATCH` | `/api/v1/home-care/services/{service_id}` | Any of `home_care.edit`, `home_care.manage` |
| `DELETE` | `/api/v1/home-care/services/{service_id}` | Any of `home_care.delete`, `home_care.manage` |
| `GET` | `/api/v1/home-care/bookings` | Any of `home_care.read`, `home_care.manage` |
| `POST` | `/api/v1/home-care/bookings` | Any of `home_care.create`, `home_care.manage` |
| `PATCH` | `/api/v1/home-care/bookings/{booking_id}` | Any of `home_care.edit`, `home_care.manage` |
| `POST` | `/api/v1/home-care/bookings/{booking_id}/visits` | Any of `home_care.create`, `home_care.manage` |
| `PATCH` | `/api/v1/home-care/bookings/{booking_id}/visits/{visit_id}` | Any of `home_care.edit`, `home_care.manage` |
| `DELETE` | `/api/v1/home-care/bookings/{booking_id}/visits/{visit_id}` | Any of `home_care.delete`, `home_care.manage` |
| `GET` | `/api/v1/home-care/bookings/{booking_id}/invoice` | `billing.manage` |
| `POST` | `/api/v1/home-care/bookings/{booking_id}/invoice` | `billing.manage` |

Home-care APIs enforce the `home_care` module entitlement and branch scope for service catalog rows, patient bookings, and actual visit logs. Booking invoice endpoints use the shared billing permission and create invoices from completed visit logs when present, falling back to billable home-care booking items.

## Files, Settings, Notifications, and Audit

| Method | Endpoint | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/files` | Authenticated tenant user |
| `GET` | `/api/v1/files` | Authenticated tenant user |
| `GET` | `/api/v1/files/{file_id}/download` | Authenticated tenant user |
| `PATCH` | `/api/v1/files/{file_id}` | Authenticated tenant user |
| `DELETE` | `/api/v1/files/{file_id}` | Authenticated tenant user |
| `POST` | `/api/v1/files/sync-uploads` | Authenticated tenant user |
| `GET` | `/api/v1/files/invoice-logo` | `invoices.read`, `settings.manage`, `settings.read`, `files.manage`, or `files.read` |
| `PUT` | `/api/v1/settings` | `settings.manage` |
| `GET` | `/api/v1/settings` | `settings.manage` |
| `GET` | `/api/v1/settings/resolve` | `settings.manage` |
| `GET` | `/api/v1/settings/bundle` | `settings.manage` |
| `POST` | `/api/v1/notifications` | `notifications.manage` |
| `GET` | `/api/v1/notifications` | `notifications.manage` |
| `GET` | `/api/v1/notifications/in-app` | Authenticated tenant user; current user's inbox only |
| `PATCH` | `/api/v1/notifications/in-app/{notification_id}` | Authenticated tenant user; current user's notification only |
| `POST` | `/api/v1/notifications/in-app/read-all` | Authenticated tenant user; current user's inbox only |
| `POST` | `/api/v1/notifications/in-app/announcements` | Tenant Admin for own tenant; Super Admin may publish platform-wide |
| `POST` | `/api/v1/audit-events` | `audit.read` |
| `GET` | `/api/v1/audit-events` | `audit.read` |
| `GET` | `/api/v1/audit-events/{event_id}` | `audit.read` |
| `GET` | `/api/v1/activity/mention-users` | Authenticated tenant user; active users in current tenant only |
| `GET` | `/api/v1/activity/{resource_type}/{resource_id}` | Authenticated tenant user |
| `POST` | `/api/v1/activity/{resource_type}/{resource_id}/comments` | Authenticated tenant user |

## Default Clinical Role Templates

The primary platform tenant is `MedizinHub HMS`. Users with `is_super_admin=true` belong to this primary tenant and bypass tenant-scoped permission checks so they can manage all customer tenants. The primary tenant record is protected: it cannot be deleted, suspended, renamed away from `MedizinHub HMS`, or changed to a customer tenant type.

Tenant isolation: every protected tenant API requires `X-Tenant-ID` and rejects requests where `current_user.tenant_id != X-Tenant-ID` (`app/core/auth.py`, `require_permission`/`require_any_permission`). Roles, users, and permission grants are always scoped to a single tenant row (`Role.tenant_id`, `UserRole.tenant_id`) — there is no cross-tenant permission bleed except for `is_super_admin` users and explicit template copy/assign endpoints, which are super-admin-only. Tenant Admins can edit role permission checkboxes only for roles belonging to their own tenant (`_assert_tenant_admin` in `app/api/v1/identity.py`).

Five standard roles are seeded as global templates on the primary tenant (`app/api/v1/identity.py: CLINICAL_ROLE_TEMPLATES`, `_ensure_clinical_role_templates`) so a new tenant can clone them at onboarding via `role_template_ids`, and are backfilled onto matching existing tenant roles by migration `20260705_0068_clinical_role_permissions.py`. Tenant Admins remain free to add or remove individual checkboxes per tenant after cloning — these are starting defaults, not hard-coded restrictions.

| Role | Permission keys granted |
| --- | --- |
| **Tenant Admin** | Every non-`platform.*` permission in `PERMISSION_CATALOG` (full control within own tenant: users, roles, branches, settings, appointments, billing, invoices, reports, doctors, pharmacy, lab, home care, queue, tax, membership, scheduling, notifications) |
| **Receptionist** | `patients.create/edit/read/write`, `appointments.create/edit/read`, `queue.manage`, `queue.read`, `practitioners.read`, `consultations.read`, `lab.create`, `physiotherapy.create`, `home_care.manage/create/read/edit`, `invoices.create/read`, `invoices.cancel_request`, `payments.create`, `billing.read`, `billing.refunds.request`, `service_items.manage/create/read/edit`, `reports.read` |
| **Doctor** | `appointments.read/edit`, `consultations.read/write/create/edit/sign`, `lab.create/read`, `home_care.create/read`, `billing.read`, `invoices.read`, `reports.read` |
| **Lab Technician** | `lab.manage/create/read/edit`, `lab.results.manage`, `patients.read`, `appointments.read`, `reports.read` |
| **Pharmacist** | `pharmacy.manage/create/read/edit/dispense`, `consultations.read` (view prescriptions), `invoices.create/read`, `billing.read`, `reports.read` |

Notes on scoping decisions:
- Doctor and Receptionist do not get `appointments.delete`/`appointments.cancel` or `invoices.delete`/`billing.refunds.manage` — cancellation and refunds route through the `*.cancel_request`/`*.refunds.request` approval permissions, with the Tenant Admin (or a Billing Staff role granted `billing.refunds.manage`) approving.
- Doctor is further scoped in code to their own linked practitioner profile for appointment, queue, and consultation actions regardless of the permission keys held (see "Current enforced guardrails" above).
- Lab Technician and Pharmacist get `reports.read` for their own operational reports, not `reports.revenue.read` or `reports.manage`.
- "Manage service and item master data" (Receptionist) maps to the new `service_items.*` permission group, since the existing catalog had no dedicated key for shared billing service/item master data.

## Rules for Future APIs

- Add the endpoint here when adding a route.
- Add the permission to `backend/app/modules/identity/permissions.py` if a new capability is needed.
- Add seed/demo role assignment if the new permission should be testable from the UI.
- Add tests for success, tenant isolation, and forbidden access where practical.
- Do not use broad admin permissions for read-only workflow helpers if a workflow role needs them. Example: appointment booking can read practitioner calendar through `appointments.manage`, but only practitioner admins can edit schedules.
