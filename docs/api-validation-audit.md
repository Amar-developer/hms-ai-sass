# API Validation Audit

Generated from the live FastAPI OpenAPI schema.

## Summary

- Total operations: 276
- Operations with request bodies: 139
- Operations with audit findings: 27
- Body operations without required fields (includes PATCH/update endpoints): 54
- POST/PUT body operations without required fields: 27

## Findings

| Method | Path | Finding |
| --- | --- | --- |
| POST | `/api/v1/billing/adjustment-requests/{request_id}/approve` | request body has no required fields |
| POST | `/api/v1/billing/adjustment-requests/{request_id}/execute` | request body has no required fields |
| POST | `/api/v1/billing/adjustment-requests/{request_id}/reject` | request body has no required fields |
| POST | `/api/v1/billing/doctor-settlements/finalize` | request body has no required fields |
| POST | `/api/v1/consultations/{consultation_id}/sign` | request body has no required fields |
| POST | `/api/v1/home-care/bookings/{booking_id}/invoice` | request body is not marked required |
| POST | `/api/v1/home-care/bookings/{booking_id}/visits` | request body has no required fields |
| POST | `/api/v1/identity/roles/{role_id}/status` | request body has no required fields |
| POST | `/api/v1/identity/users/{user_id}/status` | request body has no required fields |
| POST | `/api/v1/ip/admissions/{admission_id}/consultations` | request body has no required fields |
| POST | `/api/v1/ip/admissions/{admission_id}/medication-orders/{order_id}/administrations` | request body has no required fields |
| POST | `/api/v1/lab/orders/from-consultation/{consultation_id}` | request body has no required fields |
| POST | `/api/v1/lab/orders/{order_id}/samples` | request body has no required fields |
| POST | `/api/v1/pharmacy/issues/from-consultation/{consultation_id}` | request body has no required fields |
| POST | `/api/v1/physiotherapy/cases/{case_id}/invoice` | request body is not marked required |
| POST | `/api/v1/queue/{entry_id}/call` | request body has no required fields |
| POST | `/api/v1/queue/{entry_id}/cancel` | request body has no required fields |
| POST | `/api/v1/queue/{entry_id}/mark-not-available` | request body has no required fields |
| POST | `/api/v1/queue/{entry_id}/no-show` | request body has no required fields |
| POST | `/api/v1/queue/{entry_id}/requeue` | request body has no required fields |
| POST | `/api/v1/queue/{entry_id}/start-consultation` | request body has no required fields |
| PUT | `/api/v1/reports/monthly-email/config` | request body has no required fields |
| POST | `/api/v1/reports/monthly-email/send` | request body has no required fields |
| POST | `/api/v1/reports/monthly-snapshots/archive` | request body has no required fields |
| POST | `/api/v1/subscription-plans/invoices` | request body has no required fields |
| POST | `/api/v1/tenants/{tenant_id}/branches/{branch_id}/status` | request body has no required fields |
| POST | `/api/v1/tenants/{tenant_id}/departments/{department_id}/status` | request body has no required fields |

## Endpoint Inventory

| Method | Path | Body | Required Body Fields | Query Params |
| --- | --- | --- | --- | --- |
| GET | `/` | - | - | - |
| GET | `/api/v1/activity/{resource_type}/{resource_id}` | - | - | - |
| POST | `/api/v1/activity/{resource_type}/{resource_id}/comments` | application/json | `body` | - |
| GET | `/api/v1/appointments` | - | - | `branch_id`, `department_id`, `practitioner_id`, `appointment_date`, `q`, `skip`, `limit` |
| POST | `/api/v1/appointments` | application/json | `branch_id`, `patient_id`, `department_id`, `practitioner_id`, `appointment_date` | - |
| GET | `/api/v1/appointments/platform/all` | - | - | `tenant_id`, `branch_id`, `department_id`, `appointment_date`, `q`, `skip`, `limit` |
| GET | `/api/v1/appointments/{appointment_id}` | - | - | - |
| POST | `/api/v1/appointments/{appointment_id}/follow-up` | application/json | `appointment_date` | - |
| GET | `/api/v1/audit-events` | - | - | - |
| POST | `/api/v1/audit-events` | application/json | `action`, `resource_type`, `resource_id` | - |
| GET | `/api/v1/audit-events/{event_id}` | - | - | - |
| POST | `/api/v1/auth/bootstrap-super-admin` | application/json | `name`, `email`, `password` | - |
| POST | `/api/v1/auth/change-password` | application/json | `current_password`, `new_password` | - |
| POST | `/api/v1/auth/login` | application/json | `email`, `password` | - |
| POST | `/api/v1/auth/logout` | - | - | - |
| GET | `/api/v1/auth/me` | - | - | - |
| POST | `/api/v1/billing/adjustment-requests/{request_id}/approve` | application/json | - | - |
| POST | `/api/v1/billing/adjustment-requests/{request_id}/execute` | application/json | - | - |
| POST | `/api/v1/billing/adjustment-requests/{request_id}/reject` | application/json | - | - |
| POST | `/api/v1/billing/discount-approvals` | application/json | `branch_id`, `requested_amount`, `reason` | - |
| POST | `/api/v1/billing/discount-approvals/{approval_id}/decision` | application/json | `status` | - |
| GET | `/api/v1/billing/discount-offers` | - | - | `branch_id` |
| POST | `/api/v1/billing/discount-offers` | application/json | `name`, `value` | - |
| PATCH | `/api/v1/billing/discount-offers/{offer_id}` | application/json | - | - |
| GET | `/api/v1/billing/doctor-fee-rules` | - | - | `branch_id` |
| POST | `/api/v1/billing/doctor-fee-rules` | application/json | `appointment_type`, `fee_amount` | - |
| POST | `/api/v1/billing/doctor-settlements/finalize` | application/json | - | - |
| GET | `/api/v1/billing/doctor-settlements/summary` | - | - | `practitioner_id`, `branch_id` |
| GET | `/api/v1/billing/invoices` | - | - | `branch_id`, `patient_id` |
| POST | `/api/v1/billing/invoices/from-consultation` | application/json | `consultation_id` | - |
| POST | `/api/v1/billing/invoices/from-lab-order` | application/json | `lab_order_id` | - |
| POST | `/api/v1/billing/invoices/from-pharmacy-issue` | application/json | `pharmacy_issue_id` | - |
| GET | `/api/v1/billing/invoices/{invoice_id}` | - | - | - |
| POST | `/api/v1/billing/invoices/{invoice_id}/adjustment-requests` | application/json | `request_type`, `reason` | - |
| POST | `/api/v1/billing/invoices/{invoice_id}/amend` | application/json | `reason` | - |
| POST | `/api/v1/billing/invoices/{invoice_id}/cancel` | application/json | `reason` | - |
| POST | `/api/v1/billing/invoices/{invoice_id}/credit-notes` | application/json | `amount`, `reason` | - |
| PATCH | `/api/v1/billing/invoices/{invoice_id}/items/{item_id}/supplier` | application/json | - | - |
| GET | `/api/v1/billing/invoices/{invoice_id}/items/{item_id}/supplier-options` | - | - | - |
| POST | `/api/v1/billing/invoices/{invoice_id}/membership-benefit/apply` | - | - | - |
| POST | `/api/v1/billing/invoices/{invoice_id}/payments` | application/json | `method`, `amount` | - |
| GET | `/api/v1/billing/invoices/{invoice_id}/receipt.pdf` | - | - | - |
| POST | `/api/v1/billing/payments/{payment_id}/refund` | application/json | `reason` | - |
| GET | `/api/v1/billing/reports/due-collection` | - | - | `branch_id` |
| GET | `/api/v1/billing/reports/revenue` | - | - | `group_by`, `branch_id`, `from_date`, `to_date` |
| GET | `/api/v1/billing/tax-rules` | - | - | `branch_id` |
| POST | `/api/v1/billing/tax-rules` | application/json | `name` | - |
| PATCH | `/api/v1/billing/tax-rules/{rule_id}` | application/json | - | - |
| POST | `/api/v1/client-logs` | application/json | `event`, `message` | - |
| GET | `/api/v1/consultations` | - | - | `patient_id`, `appointment_id`, `branch_id` |
| POST | `/api/v1/consultations` | application/json | `appointment_id` | - |
| GET | `/api/v1/consultations/by-department/{department_id}/clinical-templates` | - | - | - |
| GET | `/api/v1/consultations/clinical-templates` | - | - | `department_id` |
| POST | `/api/v1/consultations/clinical-templates` | application/json | `name` | - |
| GET | `/api/v1/consultations/{consultation_id}` | - | - | - |
| PATCH | `/api/v1/consultations/{consultation_id}` | application/json | - | - |
| POST | `/api/v1/consultations/{consultation_id}/addendums` | application/json | `note` | - |
| POST | `/api/v1/consultations/{consultation_id}/sign` | application/json | - | - |
| GET | `/api/v1/files` | - | - | `branch_id`, `patient_id`, `category`, `attached_to_doctype`, `attached_to_name`, `q`, `limit` |
| POST | `/api/v1/files` | multipart/form-data | `file` | - |
| POST | `/api/v1/files/sync-uploads` | - | - | - |
| DELETE | `/api/v1/files/{file_id}` | - | - | - |
| PATCH | `/api/v1/files/{file_id}` | application/json | - | - |
| GET | `/api/v1/files/{file_id}/download` | - | - | - |
| GET | `/api/v1/health` | - | - | - |
| GET | `/api/v1/home-care/bookings` | - | - | `branch_id`, `patient_id`, `status_filter` |
| POST | `/api/v1/home-care/bookings` | application/json | `branch_id`, `patient_id`, `booking_type`, `recurrence`, `start_date`, `end_date`, `location`, `services` | - |
| PATCH | `/api/v1/home-care/bookings/{booking_id}` | application/json | - | - |
| GET | `/api/v1/home-care/bookings/{booking_id}/invoice` | - | - | - |
| POST | `/api/v1/home-care/bookings/{booking_id}/invoice` | application/json | - | - |
| POST | `/api/v1/home-care/bookings/{booking_id}/visits` | application/json | - | - |
| DELETE | `/api/v1/home-care/bookings/{booking_id}/visits/{visit_id}` | - | - | - |
| PATCH | `/api/v1/home-care/bookings/{booking_id}/visits/{visit_id}` | application/json | - | - |
| GET | `/api/v1/home-care/services` | - | - | `branch_id` |
| POST | `/api/v1/home-care/services` | application/json | `name` | - |
| DELETE | `/api/v1/home-care/services/{service_id}` | - | - | - |
| PATCH | `/api/v1/home-care/services/{service_id}` | application/json | - | - |
| GET | `/api/v1/identity/permissions` | - | - | - |
| GET | `/api/v1/identity/roles` | - | - | - |
| POST | `/api/v1/identity/roles` | application/json | `name`, `key` | - |
| DELETE | `/api/v1/identity/roles/{role_id}` | - | - | - |
| PATCH | `/api/v1/identity/roles/{role_id}` | application/json | - | - |
| POST | `/api/v1/identity/roles/{role_id}/assign/{target_tenant_id}` | - | - | - |
| POST | `/api/v1/identity/roles/{role_id}/status` | application/json | - | - |
| GET | `/api/v1/identity/users` | - | - | - |
| POST | `/api/v1/identity/users` | application/json | `name`, `email`, `password` | - |
| DELETE | `/api/v1/identity/users/{user_id}` | - | - | - |
| PATCH | `/api/v1/identity/users/{user_id}` | application/json | - | - |
| POST | `/api/v1/identity/users/{user_id}/password-reset` | application/json | `new_password` | - |
| POST | `/api/v1/identity/users/{user_id}/status` | application/json | - | - |
| GET | `/api/v1/ip/admissions` | - | - | `branch_id`, `patient_id`, `status_filter` |
| POST | `/api/v1/ip/admissions` | application/json | `branch_id`, `patient_id`, `ward`, `bed` | - |
| POST | `/api/v1/ip/admissions/from-appointment/{appointment_id}` | application/json | `branch_id`, `patient_id`, `ward`, `bed` | - |
| PATCH | `/api/v1/ip/admissions/{admission_id}` | application/json | - | - |
| GET | `/api/v1/ip/admissions/{admission_id}/billing-items` | - | - | - |
| POST | `/api/v1/ip/admissions/{admission_id}/billing-items` | application/json | `description`, `unit_amount` | - |
| GET | `/api/v1/ip/admissions/{admission_id}/charges` | - | - | - |
| POST | `/api/v1/ip/admissions/{admission_id}/charges` | application/json | `description`, `unit_amount` | - |
| POST | `/api/v1/ip/admissions/{admission_id}/consents` | application/json | `title`, `content` | - |
| POST | `/api/v1/ip/admissions/{admission_id}/consultations` | application/json | - | - |
| POST | `/api/v1/ip/admissions/{admission_id}/discharge-summary` | application/json | `final_diagnosis` | - |
| POST | `/api/v1/ip/admissions/{admission_id}/document` | multipart/form-data | `file` | - |
| GET | `/api/v1/ip/admissions/{admission_id}/documents` | - | - | - |
| POST | `/api/v1/ip/admissions/{admission_id}/documents` | multipart/form-data | `files` | - |
| GET | `/api/v1/ip/admissions/{admission_id}/invoice` | - | - | - |
| POST | `/api/v1/ip/admissions/{admission_id}/invoice` | - | - | - |
| GET | `/api/v1/ip/admissions/{admission_id}/medication-administrations` | - | - | - |
| GET | `/api/v1/ip/admissions/{admission_id}/medication-orders` | - | - | - |
| POST | `/api/v1/ip/admissions/{admission_id}/medication-orders` | application/json | `medicine_name` | - |
| POST | `/api/v1/ip/admissions/{admission_id}/medication-orders/{order_id}/administrations` | application/json | - | - |
| GET | `/api/v1/ip/admissions/{admission_id}/treatments` | - | - | - |
| POST | `/api/v1/ip/admissions/{admission_id}/treatments` | application/json | `notes` | - |
| POST | `/api/v1/ip/consents/{consent_id}/sign` | - | - | - |
| POST | `/api/v1/ip/consultations/{consultation_id}/sign` | - | - | - |
| POST | `/api/v1/ip/discharge-summaries/{summary_id}/finalize` | - | - | - |
| GET | `/api/v1/ip/discharge-summaries/{summary_id}/pdf` | - | - | - |
| GET | `/api/v1/ip/rooms` | - | - | `branch_id`, `ward_type`, `room_type`, `available_from`, `available_to`, `include_occupied` |
| POST | `/api/v1/ip/rooms` | application/json | `branch_id`, `ward_name`, `room_number`, `bed_number` | - |
| PATCH | `/api/v1/ip/rooms/{room_id}` | application/json | - | - |
| GET | `/api/v1/lab/catalog/available-tests` | - | - | `branch_id`, `search` |
| GET | `/api/v1/lab/catalog/packages` | - | - | `branch_id` |
| POST | `/api/v1/lab/catalog/packages` | application/json | `code`, `name` | - |
| DELETE | `/api/v1/lab/catalog/packages/{package_id}` | - | - | - |
| PATCH | `/api/v1/lab/catalog/packages/{package_id}` | application/json | - | - |
| GET | `/api/v1/lab/catalog/popular-tests` | - | - | `limit` |
| GET | `/api/v1/lab/catalog/tests` | - | - | `branch_id`, `search` |
| POST | `/api/v1/lab/catalog/tests` | application/json | `code`, `name` | - |
| DELETE | `/api/v1/lab/catalog/tests/{test_id}` | - | - | - |
| PATCH | `/api/v1/lab/catalog/tests/{test_id}` | application/json | - | - |
| GET | `/api/v1/lab/consultation-referrals` | - | - | `branch_id` |
| GET | `/api/v1/lab/orders` | - | - | `patient_id`, `status_filter`, `branch_id` |
| POST | `/api/v1/lab/orders` | application/json | `branch_id`, `patient_id`, `tests` | - |
| POST | `/api/v1/lab/orders/from-consultation/{consultation_id}` | application/json | - | - |
| GET | `/api/v1/lab/orders/{order_id}` | - | - | - |
| GET | `/api/v1/lab/orders/{order_id}/report.pdf` | - | - | - |
| POST | `/api/v1/lab/orders/{order_id}/results` | application/json | `result_summary` | - |
| POST | `/api/v1/lab/orders/{order_id}/samples` | application/json | - | - |
| PATCH | `/api/v1/lab/orders/{order_id}/status` | application/json | `status` | - |
| GET | `/api/v1/lab/result-templates` | - | - | `test_id` |
| POST | `/api/v1/lab/result-templates` | application/json | `name` | - |
| GET | `/api/v1/modules` | - | - | - |
| GET | `/api/v1/notifications` | - | - | `provider`, `status_filter`, `branch_id` |
| POST | `/api/v1/notifications` | application/json | `provider`, `event_type`, `recipient`, `message` | - |
| POST | `/api/v1/patient-subscriptions/benefits/preview` | application/json | `patient_id`, `branch_id`, `service_type` | - |
| GET | `/api/v1/patient-subscriptions/enrollments` | - | - | `branch_id`, `patient_id` |
| POST | `/api/v1/patient-subscriptions/enrollments` | application/json | `patient_id`, `plan_id` | - |
| DELETE | `/api/v1/patient-subscriptions/enrollments/{enrollment_id}` | - | - | - |
| PATCH | `/api/v1/patient-subscriptions/enrollments/{enrollment_id}` | application/json | - | - |
| GET | `/api/v1/patient-subscriptions/plans` | - | - | `branch_id`, `include_inactive` |
| POST | `/api/v1/patient-subscriptions/plans` | application/json | `name`, `duration_days` | - |
| DELETE | `/api/v1/patient-subscriptions/plans/{plan_id}` | - | - | - |
| PATCH | `/api/v1/patient-subscriptions/plans/{plan_id}` | application/json | - | - |
| GET | `/api/v1/patients` | - | - | `q`, `branch_id`, `active_only`, `limit` |
| POST | `/api/v1/patients` | application/json | `full_name` | - |
| POST | `/api/v1/patients/duplicates` | application/json | `full_name` | - |
| DELETE | `/api/v1/patients/{patient_id}` | - | - | - |
| GET | `/api/v1/patients/{patient_id}` | - | - | - |
| PATCH | `/api/v1/patients/{patient_id}` | application/json | - | - |
| GET | `/api/v1/patients/{patient_id}/alerts` | - | - | - |
| POST | `/api/v1/patients/{patient_id}/alerts` | application/json | `alert_type`, `title` | - |
| POST | `/api/v1/patients/{patient_id}/photo` | multipart/form-data | `file` | - |
| GET | `/api/v1/patients/{patient_id}/summary` | - | - | - |
| GET | `/api/v1/pharmacy/batches` | - | - | `branch_id`, `medicine_id` |
| GET | `/api/v1/pharmacy/catalog/available-medicines` | - | - | `branch_id`, `search`, `page_size`, `current_page` |
| GET | `/api/v1/pharmacy/catalog/popular-medicines` | - | - | `limit` |
| GET | `/api/v1/pharmacy/issues` | - | - | `patient_id`, `status_filter`, `branch_id` |
| POST | `/api/v1/pharmacy/issues` | application/json | `branch_id`, `patient_id`, `medicine_text` | - |
| POST | `/api/v1/pharmacy/issues/from-consultation/{consultation_id}` | application/json | - | - |
| GET | `/api/v1/pharmacy/issues/{issue_id}` | - | - | - |
| PATCH | `/api/v1/pharmacy/issues/{issue_id}/amount` | application/json | `amount` | - |
| POST | `/api/v1/pharmacy/issues/{issue_id}/billing-link` | application/json | `billing_invoice_id` | - |
| PATCH | `/api/v1/pharmacy/issues/{issue_id}/status` | application/json | `status` | - |
| GET | `/api/v1/pharmacy/low-stock` | - | - | `branch_id` |
| GET | `/api/v1/pharmacy/medicines` | - | - | `branch_id`, `search` |
| POST | `/api/v1/pharmacy/medicines` | application/json | `code`, `name` | - |
| DELETE | `/api/v1/pharmacy/medicines/{medicine_id}` | - | - | - |
| PATCH | `/api/v1/pharmacy/medicines/{medicine_id}` | application/json | - | - |
| POST | `/api/v1/pharmacy/purchases` | application/json | `branch_id`, `items` | - |
| POST | `/api/v1/pharmacy/returns` | application/json | `branch_id`, `reason`, `items` | - |
| GET | `/api/v1/pharmacy/stock-ledger` | - | - | `branch_id`, `medicine_id` |
| GET | `/api/v1/pharmacy/suppliers` | - | - | `include_inactive` |
| POST | `/api/v1/pharmacy/suppliers` | application/json | `name` | - |
| DELETE | `/api/v1/pharmacy/suppliers/{supplier_id}` | - | - | - |
| PATCH | `/api/v1/pharmacy/suppliers/{supplier_id}` | application/json | - | - |
| GET | `/api/v1/physiotherapy/cases` | - | - | `branch_id`, `patient_id`, `care_context` |
| POST | `/api/v1/physiotherapy/cases` | application/json | `branch_id`, `patient_id`, `assessment_date`, `body_region`, `condition`, `treatment_goal` | - |
| PATCH | `/api/v1/physiotherapy/cases/{case_id}` | application/json | - | - |
| POST | `/api/v1/physiotherapy/cases/{case_id}/consent` | multipart/form-data | `files` | - |
| GET | `/api/v1/physiotherapy/cases/{case_id}/invoice` | - | - | - |
| POST | `/api/v1/physiotherapy/cases/{case_id}/invoice` | application/json | - | - |
| GET | `/api/v1/physiotherapy/cases/{case_id}/sessions` | - | - | - |
| POST | `/api/v1/physiotherapy/cases/{case_id}/sessions` | application/json | `session_date`, `modality_type`, `treatment_area` | - |
| GET | `/api/v1/physiotherapy/equipment` | - | - | `branch_id` |
| POST | `/api/v1/physiotherapy/equipment` | application/json | `name`, `modality_type` | - |
| DELETE | `/api/v1/physiotherapy/equipment/{equipment_id}` | - | - | - |
| PATCH | `/api/v1/physiotherapy/equipment/{equipment_id}` | application/json | - | - |
| GET | `/api/v1/practitioners` | - | - | `branch_id`, `department_id` |
| POST | `/api/v1/practitioners` | application/json | `full_name`, `branch_ids`, `department_ids` | - |
| GET | `/api/v1/practitioners/schedules` | - | - | `practitioner_id`, `branch_id`, `department_id`, `is_active` |
| DELETE | `/api/v1/practitioners/schedules/{schedule_id}` | - | - | - |
| PATCH | `/api/v1/practitioners/schedules/{schedule_id}` | application/json | - | - |
| DELETE | `/api/v1/practitioners/{practitioner_id}` | - | - | - |
| GET | `/api/v1/practitioners/{practitioner_id}` | - | - | - |
| PATCH | `/api/v1/practitioners/{practitioner_id}` | application/json | - | - |
| GET | `/api/v1/practitioners/{practitioner_id}/availability` | - | - | `branch_id`, `appointment_date`, `appointment_time`, `department_id` |
| GET | `/api/v1/practitioners/{practitioner_id}/calendar` | - | - | `branch_id`, `start_date`, `end_date`, `department_id` |
| GET | `/api/v1/practitioners/{practitioner_id}/eligibility` | - | - | `branch_id`, `department_id` |
| GET | `/api/v1/practitioners/{practitioner_id}/leaves` | - | - | - |
| POST | `/api/v1/practitioners/{practitioner_id}/leaves` | application/json | `start_date`, `end_date` | - |
| GET | `/api/v1/practitioners/{practitioner_id}/room-assignments` | - | - | - |
| POST | `/api/v1/practitioners/{practitioner_id}/room-assignments` | application/json | `branch_id`, `room_name`, `start_time`, `end_time` | - |
| GET | `/api/v1/practitioners/{practitioner_id}/schedules` | - | - | - |
| POST | `/api/v1/practitioners/{practitioner_id}/schedules` | application/json | `branch_id`, `weekday`, `start_time`, `end_time` | - |
| GET | `/api/v1/queue` | - | - | `branch_id`, `include_completed` |
| GET | `/api/v1/queue/display` | - | - | `branch_id`, `display_mode` |
| POST | `/api/v1/queue/{entry_id}/call` | application/json | - | - |
| POST | `/api/v1/queue/{entry_id}/cancel` | application/json | - | - |
| POST | `/api/v1/queue/{entry_id}/mark-not-available` | application/json | - | - |
| POST | `/api/v1/queue/{entry_id}/no-show` | application/json | - | - |
| POST | `/api/v1/queue/{entry_id}/requeue` | application/json | - | - |
| POST | `/api/v1/queue/{entry_id}/start-consultation` | application/json | - | - |
| GET | `/api/v1/readiness` | - | - | - |
| GET | `/api/v1/reports/monthly-email/config` | - | - | - |
| PUT | `/api/v1/reports/monthly-email/config` | application/json | - | - |
| GET | `/api/v1/reports/monthly-email/jobs` | - | - | `limit` |
| GET | `/api/v1/reports/monthly-email/jobs/{job_id}/download` | - | - | - |
| POST | `/api/v1/reports/monthly-email/send` | application/json | - | - |
| GET | `/api/v1/reports/monthly-snapshots` | - | - | `branch_id`, `limit` |
| POST | `/api/v1/reports/monthly-snapshots/archive` | application/json | - | - |
| GET | `/api/v1/reports/monthly-snapshots/{snapshot_id}` | - | - | - |
| POST | `/api/v1/reports/profit-email/send` | application/json | `from_date`, `to_date` | - |
| GET | `/api/v1/settings` | - | - | `module` |
| PUT | `/api/v1/settings` | application/json | `module`, `key`, `value` | - |
| GET | `/api/v1/settings/bundle` | - | - | `module`, `branch_id` |
| GET | `/api/v1/settings/resolve` | - | - | `key`, `module`, `branch_id` |
| GET | `/api/v1/subscription-plans` | - | - | - |
| POST | `/api/v1/subscription-plans` | application/json | `key`, `name` | - |
| GET | `/api/v1/subscription-plans/announcements` | - | - | - |
| GET | `/api/v1/subscription-plans/credits` | - | - | - |
| POST | `/api/v1/subscription-plans/credits` | application/json | `quantity` | - |
| GET | `/api/v1/subscription-plans/entitlements` | - | - | - |
| GET | `/api/v1/subscription-plans/invoices` | - | - | - |
| POST | `/api/v1/subscription-plans/invoices` | application/json | - | - |
| POST | `/api/v1/subscription-plans/invoices/{invoice_id}/payment-failed` | application/json | `failed_reason` | - |
| POST | `/api/v1/subscription-plans/invoices/{invoice_id}/settle` | application/json | `amount` | - |
| GET | `/api/v1/subscription-plans/platform/revenue-summary` | - | - | - |
| GET | `/api/v1/subscription-plans/reports/revenue` | - | - | `tenant_id`, `from_date`, `to_date`, `status`, `q`, `page`, `page_size`, `export` |
| GET | `/api/v1/subscription-plans/tenant-subscriptions` | - | - | - |
| POST | `/api/v1/subscription-plans/tenant-subscriptions` | application/json | `plan_id`, `starts_on` | - |
| GET | `/api/v1/subscription-plans/tenant-subscriptions/active` | - | - | - |
| GET | `/api/v1/subscription-plans/usage` | - | - | - |
| PATCH | `/api/v1/subscription-plans/{plan_id}` | application/json | - | - |
| POST | `/api/v1/subscription-plans/{plan_id}/status` | application/json | `is_active` | - |
| GET | `/api/v1/tenants` | - | - | - |
| POST | `/api/v1/tenants` | application/json | `name` | - |
| POST | `/api/v1/tenants/branches/{branch_id}/assign/{target_tenant_id}` | - | - | - |
| GET | `/api/v1/tenants/current/branding` | - | - | - |
| POST | `/api/v1/tenants/departments/{department_id}/assign/{target_tenant_id}` | - | - | - |
| POST | `/api/v1/tenants/onboard` | application/json | `tenant` | - |
| DELETE | `/api/v1/tenants/{tenant_id}` | - | - | - |
| GET | `/api/v1/tenants/{tenant_id}` | - | - | - |
| PATCH | `/api/v1/tenants/{tenant_id}` | application/json | - | - |
| GET | `/api/v1/tenants/{tenant_id}/branches` | - | - | - |
| POST | `/api/v1/tenants/{tenant_id}/branches` | application/json | `name`, `code` | - |
| DELETE | `/api/v1/tenants/{tenant_id}/branches/{branch_id}` | - | - | - |
| PATCH | `/api/v1/tenants/{tenant_id}/branches/{branch_id}` | application/json | - | - |
| POST | `/api/v1/tenants/{tenant_id}/branches/{branch_id}/status` | application/json | - | - |
| GET | `/api/v1/tenants/{tenant_id}/departments` | - | - | - |
| POST | `/api/v1/tenants/{tenant_id}/departments` | application/json | `name` | - |
| DELETE | `/api/v1/tenants/{tenant_id}/departments/{department_id}` | - | - | - |
| GET | `/api/v1/tenants/{tenant_id}/departments/{department_id}` | - | - | - |
| PATCH | `/api/v1/tenants/{tenant_id}/departments/{department_id}` | application/json | - | - |
| POST | `/api/v1/tenants/{tenant_id}/departments/{department_id}/status` | application/json | - | - |
| POST | `/api/v1/tenants/{tenant_id}/logo` | multipart/form-data | `file` | - |
| GET | `/health` | - | - | - |
| GET | `/readiness` | - | - | - |
