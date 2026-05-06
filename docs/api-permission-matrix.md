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
| `invoices.create/read/edit/delete` | Granular invoice controls |
| `payments.manage` | Payment collection and refund |
| `settlements.read` | Doctor settlement reports |
| `lab.manage` | Lab orders/results |
| `lab.create/read/edit/delete` | Granular lab workflow controls |
| `pharmacy.manage` | Pharmacy issues/status |
| `pharmacy.create/read/edit/delete` | Granular pharmacy workflow controls |
| `notifications.manage` | Notification queue create/list |
| `audit.read` | Audit event create/list/detail |
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

## Tenant and Platform

| Method | Endpoint | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/tenants` | `platform.tenants.manage` |
| `GET` | `/api/v1/tenants` | `platform.tenants.manage` |
| `GET` | `/api/v1/tenants/{tenant_id}` | `platform.tenants.manage` |
| `PATCH` | `/api/v1/tenants/{tenant_id}` | `platform.tenants.manage` |
| `DELETE` | `/api/v1/tenants/{tenant_id}` | `platform.tenants.manage` |
| `POST` | `/api/v1/tenants/{tenant_id}/branches` | Tenant admin or super admin |
| `GET` | `/api/v1/tenants/{tenant_id}/branches` | `settings.manage` |
| `PATCH` | `/api/v1/tenants/{tenant_id}/branches/{branch_id}` | Tenant admin or super admin |
| `POST` | `/api/v1/tenants/{tenant_id}/branches/{branch_id}/status` | Tenant admin or super admin |
| `DELETE` | `/api/v1/tenants/{tenant_id}/branches/{branch_id}` | Tenant admin or super admin; soft deactivates |
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
| `GET` | `/api/v1/patients/{patient_id}/summary` | `patients.read` | Records patient history viewed audit |

Patient APIs enforce the `patients` module entitlement and branch scope for branch-assigned users.

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

## Appointment and Queue

| Method | Endpoint | Permission | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/appointments` | `appointments.manage` | Creates appointment, token queue entry, notification trigger; prevents duplicate active patient/doctor/slot bookings |
| `GET` | `/api/v1/appointments` | `appointments.manage` | List appointments |
| `GET` | `/api/v1/appointments/{appointment_id}` | `appointments.manage` | Appointment detail |
| `POST` | `/api/v1/appointments/{appointment_id}/follow-up` | `appointments.manage` | Books follow-up using source appointment context |
| `GET` | `/api/v1/queue` | `queue.manage` | Queue list |
| `GET` | `/api/v1/queue/display` | `queue.manage` | Queue display rows for reception/called-token screens with language-aware call text |
| `POST` | `/api/v1/queue/{entry_id}/call` | `queue.manage` | Token call and notification trigger |
| `POST` | `/api/v1/queue/{entry_id}/mark-not-available` | `queue.manage` | Missed patient |
| `POST` | `/api/v1/queue/{entry_id}/requeue` | `queue.manage` | Requeue token |
| `POST` | `/api/v1/queue/{entry_id}/cancel` | `queue.manage` | Cancel queue entry/appointment |
| `POST` | `/api/v1/queue/{entry_id}/no-show` | `queue.manage` | Mark no-show |
| `POST` | `/api/v1/queue/{entry_id}/start-consultation` | `queue.manage` | Starts consultation workflow |

Appointment APIs enforce the `appointments` module entitlement. Queue APIs enforce the `queue` module entitlement. Both enforce branch scope for branch-assigned users. Appointment create/read responses carry visit purpose, source appointment linkage, and billable/free-review status so OP, doctor review, fitness certificate, follow-up, and emergency visits can be audited and billed consistently.

## Consultation

| Method | Endpoint | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/consultations` | `consultations.write` |
| `GET` | `/api/v1/consultations` | `consultations.read` |
| `POST` | `/api/v1/consultations/clinical-templates` | `consultations.write` |
| `GET` | `/api/v1/consultations/by-department/{department_id}/clinical-templates` | `consultations.read` |
| `GET` | `/api/v1/consultations/{consultation_id}` | `consultations.read` |
| `PATCH` | `/api/v1/consultations/{consultation_id}` | `consultations.write` |
| `POST` | `/api/v1/consultations/{consultation_id}/sign` | `consultations.sign` |
| `POST` | `/api/v1/consultations/{consultation_id}/addendums` | `consultations.write` |

Consultation APIs enforce the `consultations` module entitlement and branch scope. Draft consultations can save structured vitals, complaints, diagnoses, medicines, lab/scan referrals, follow-up advice, and notes. Signed consultation records remain immutable except addendums.

## Billing, Payments, and Settlements

| Method | Endpoint | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/billing/doctor-fee-rules` | `billing.manage` |
| `GET` | `/api/v1/billing/doctor-fee-rules` | `billing.manage` |
| `POST` | `/api/v1/billing/tax-rules` | `billing.manage` |
| `GET` | `/api/v1/billing/tax-rules` | `billing.manage` |
| `POST` | `/api/v1/billing/discount-approvals` | `billing.manage` |
| `POST` | `/api/v1/billing/discount-approvals/{approval_id}/decision` | `billing.manage` |
| `POST` | `/api/v1/billing/invoices/from-consultation` | `billing.manage` |
| `GET` | `/api/v1/billing/invoices` | `billing.manage` |
| `GET` | `/api/v1/billing/invoices/{invoice_id}` | `billing.manage` |
| `GET` | `/api/v1/billing/invoices/{invoice_id}/receipt.pdf` | `billing.manage` |
| `POST` | `/api/v1/billing/invoices/{invoice_id}/credit-notes` | `billing.manage` |
| `POST` | `/api/v1/billing/invoices/{invoice_id}/payments` | `payments.manage` |
| `POST` | `/api/v1/billing/payments/{payment_id}/refund` | `payments.manage` |
| `POST` | `/api/v1/billing/invoices/{invoice_id}/cancel` | `billing.manage` |
| `GET` | `/api/v1/billing/doctor-settlements/summary` | `settlements.read` |
| `POST` | `/api/v1/billing/doctor-settlements/finalize` | `settlements.read` |
| `GET` | `/api/v1/billing/reports/due-collection` | `reports.read` |
| `GET` | `/api/v1/billing/reports/revenue` | `reports.read` |

Billing APIs enforce `billing_basic` for fee rules, tax rules, invoice reads, payments, refunds, credit notes, and cancellations. Invoice generation, discount approval, settlement finalization, and revenue reporting enforce `billing_advanced`. Branch-scoped users can access only branch-matching invoices, payments, fee rules, tax rules, credit notes, reports, and settlements.

## Lab and Pharmacy

| Method | Endpoint | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/lab/catalog/tests` | `lab.manage` |
| `GET` | `/api/v1/lab/catalog/tests` | `lab.manage` |
| `POST` | `/api/v1/lab/catalog/packages` | `lab.manage` |
| `GET` | `/api/v1/lab/catalog/packages` | `lab.manage` |
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
| `POST` | `/api/v1/pharmacy/suppliers` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/suppliers` | `pharmacy.manage` |
| `POST` | `/api/v1/pharmacy/purchases` | `pharmacy.manage` |
| `POST` | `/api/v1/pharmacy/returns` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/batches` | `pharmacy.manage` |
| `POST` | `/api/v1/pharmacy/issues` | `pharmacy.manage` |
| `POST` | `/api/v1/pharmacy/issues/from-consultation/{consultation_id}` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/issues` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/issues/{issue_id}` | `pharmacy.manage` |
| `PATCH` | `/api/v1/pharmacy/issues/{issue_id}/status` | `pharmacy.manage` |
| `POST` | `/api/v1/pharmacy/issues/{issue_id}/billing-link` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/stock-ledger` | `pharmacy.manage` |
| `GET` | `/api/v1/pharmacy/low-stock` | `pharmacy.manage` |

Lab APIs enforce module entitlement and branch scope for catalog, packages, templates, direct orders, consultation-derived records, sample collection, result release, report PDF access, and status updates. Result release queues lab-ready notifications when communication provider settings and subscription entitlements allow them. Pharmacy APIs enforce pharmacy entitlement and branch scope for medicine catalog, suppliers, purchase entry with purchase date, PO number, supplier discount, line discount, CGST, SGST, batches, expired stock returns, stock ledger, low-stock alerts, prescription/direct/external issues, dispense stock reduction, substitutes, billing linkage, listing, detail, and status updates.

## Settings, Notifications, and Audit

| Method | Endpoint | Permission |
| --- | --- | --- |
| `PUT` | `/api/v1/settings` | `settings.manage` |
| `GET` | `/api/v1/settings` | `settings.manage` |
| `GET` | `/api/v1/settings/resolve` | `settings.manage` |
| `GET` | `/api/v1/settings/bundle` | `settings.manage` |
| `POST` | `/api/v1/notifications` | `notifications.manage` |
| `GET` | `/api/v1/notifications` | `notifications.manage` |
| `POST` | `/api/v1/audit-events` | `audit.read` |
| `GET` | `/api/v1/audit-events` | `audit.read` |
| `GET` | `/api/v1/audit-events/{event_id}` | `audit.read` |

## Suggested Default Role Bundles

These are current practical role bundles for demo and team testing.

The primary platform tenant is `MedizinHub HMS`. Users with `is_super_admin=true` belong to this primary tenant and bypass tenant-scoped permission checks so they can manage all customer tenants. The primary tenant record is protected: it cannot be deleted, suspended, renamed away from `MedizinHub HMS`, or changed to a customer tenant type.

| Role | Suggested Permissions |
| --- | --- |
| Primary Tenant Super Admin | All permissions through `is_super_admin`; tenant CRUD, subscription setup, department setup, role/user/branch management, platform reports |
| Tenant Admin | All non-platform permissions |
| Reception | `patients.read`, `patients.write`, `appointments.manage`, `queue.manage`, `notifications.manage` |
| Doctor | `patients.read`, `queue.manage`, `consultations.read`, `consultations.write`, `consultations.sign`, `lab.manage`, `pharmacy.manage` as needed |
| Lab Technician | `patients.read`, `lab.manage`, `notifications.manage` |
| Pharmacy User | `patients.read`, `pharmacy.manage`, `billing.manage` |
| Billing Staff | `patients.read`, `billing.manage`, `payments.manage`, `settlements.read` |
| Back Office | `reports.read`, `audit.read`, `settlements.read`, `billing.manage` |

## Rules for Future APIs

- Add the endpoint here when adding a route.
- Add the permission to `backend/app/modules/identity/permissions.py` if a new capability is needed.
- Add seed/demo role assignment if the new permission should be testable from the UI.
- Add tests for success, tenant isolation, and forbidden access where practical.
- Do not use broad admin permissions for read-only workflow helpers if a workflow role needs them. Example: appointment booking can read practitioner calendar through `appointments.manage`, but only practitioner admins can edit schedules.
