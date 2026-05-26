# Module Catalog

## Core Modules

| Module | Purpose | Key Features |
| --- | --- | --- |
| Tenant & Branch | SaaS customer structure | Tenant, branches, departments, rooms, working hours |
| Patient Master | Patient identity and profile | Registration, demographics, guardian, contacts, duplicate detection |
| Appointment | Booking engine | OP, IP, online, home visit, walk-in, follow-up, cancellation |
| Queue & Token | Waiting management | Normal/emergency queue, requeue, no-show, voice calling, display screen |
| Doctor Workspace | Consultation | Patient 360, diagnosis, notes, prescription, lab/scan referral, follow-up |
| EMR / Patient History | Clinical memory | Immutable visits, timeline, allergies, chronic conditions, summaries |
| Billing & Invoice | Revenue capture | Consultation billing, lab/pharmacy/procedure invoice, UPI/payment links |
| Payment Collection | Payment workflow | Cash, credit card, debit card, UPI, GPay, Paytm, partial payments, refunds |
| Doctor Fee & Settlement | Doctor revenue model | Fixed fee, percentage split, visit-type fee, monthly settlement |
| Patient Memberships | Patient subscription benefits | Membership plans, enrollments, free consultations, lab/pharmacy discounts, benefit preview, invoice benefit application |
| Lab & Diagnostics | Test workflow | Orders, sample collection, results, reports, doctor visibility |
| Pharmacy | Medicine workflow | Prescription issue, medicine inventory, substitutes, stock alerts |
| IP Admission | Hospital inpatient flow | Admission, Aadhaar capture, admission proof upload, bed, ward, treatment, discharge, package billing |
| Physiotherapy | OP/IP rehabilitation | Assessment, pain score, consent multi-file upload, electrotherapy equipment, IFT, ultrasound, TENS, laser, SWD, CPM, muscle stimulation, rehab exercises, home program, session packages, progress tracking, tax/discount-aware invoice generation, payment capture, and receipt access |
| File Registry | Document lifecycle | Tenant-scoped upload registry, linked owner entity, metadata sync, rename, archive |
| Reports & Analytics | Business intelligence | Revenue, doctor utilization, branch performance, patient volume |
| Staff & Roles | Access control | Roles, permissions, shifts, staff audit |
| Subscription | SaaS billing | Plans, patient limits, module limits, add-ons, invoices |

## Automation Modules

| Module | Purpose |
| --- | --- |
| WhatsApp Booking | Book, confirm, reschedule, cancel appointments |
| Reminder Engine | Appointment, follow-up, payment, lab report reminders |
| Voice Token Calling | Announce tokens in clinic and route to doctor rooms |
| AI Call Bot | Appointment confirmation, missed appointment recovery |
| Smart Notifications | Owner/staff alerts for delays, no-shows, revenue changes |
| Feedback Automation | Collect patient feedback after consultation |

## AI Modules

| Module | Use |
| --- | --- |
| Patient 360 Summary | Summarize important treatment history for doctors |
| Consultation Draft Assist | Structure notes from doctor input |
| Lab Report Simplifier | Explain reports in simple language with doctor review |
| Risk Alerts | Flag allergy, chronic disease, missed follow-up, abnormal reports |
| Owner Insights | Detect revenue drop, doctor idle time, no-show trends |
| Smart Scheduling | Suggest slots based on doctor availability and patient urgency |

## Appointment Status Model

Recommended statuses:

```text
Draft
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

Emergency appointment path:

```text
Emergency Entry -> Checked In -> Priority Waiting -> Called -> In Consultation -> Completed -> Billing / Admission / Referral
```

## Queue Rules

Admin should configure:

- Normal token pattern.
- Emergency token pattern.
- Emergency priority enabled/disabled.
- Requeue position: after N patients or end of queue.
- Missed call count before no-show.
- Auto-cancel delay.
- Token voice language.
- Waiting screen message templates.
- Doctor delay alert threshold.
- Senior citizen/child/VIP priority if clinic wants it.

## Fee Rules

Fee settings should support:

- Clinic default fee.
- Branch-specific fee.
- Department-specific fee.
- Doctor-specific fee.
- Visit-type fee: OP, IP fixed, IP percentage, online, home visit, emergency.
- Follow-up validity period and free/discounted review.
- Procedure and service add-on fees.
- Doctor payout fixed amount.
- Doctor payout percentage split.
- Clinic share.
- Tax rules and invoice templates.

## Payment Rules

Payment settings should support:

- Cash.
- Credit card.
- Debit card.
- UPI.
- GPay.
- Paytm.
- Bank transfer.
- Mixed payment collection against one invoice.
- Partial payment and pending balance.
- Refund tracking.
- Cancellation guardrails for paid invoices.
- Payment reference number for online/card payments.
- Payment audit trail.

Invoice statuses should support:

```text
Issued
Partially Paid
Paid
Cancelled
Refunded
```

Doctor settlement should calculate:

- Doctor share amount.
- Clinic share amount.
- Paid amount considered for settlement.
- Pending amount not yet settled.
- Branch, doctor, and date filters.

## Admin Settings

Admin settings should include:

- Branches and departments.
- Rooms and counters.
- Doctor schedules, leave blocks, availability checks, and room assignments.
- Staff roles.
- Consultation fee rules.
- Doctor settlement rules.
- Queue rules.
- Follow-up rules.
- Cancellation and refund rules.
- WhatsApp/SMS/voice templates.
- Payment methods.
- Invoice numbering.
- Document numbering rules for patients, invoices, IP admissions, physiotherapy cases, lab orders, pharmacy issues, practitioners, users, and suppliers.
- Invoice logo and patient photo/document uploads.
- Data access policy.
- Audit retention.
- Subscription plan and add-ons.

## Patient 360 Read Model

Patient 360 should show treatment-relevant data in this order:

1. Critical alerts: allergies, severe conditions, high-risk tags.
2. Active problems and chronic diseases.
3. Current medicines.
4. Last visit summary.
5. Recent lab/scan highlights.
6. Active care plans and follow-ups.
7. Timeline of consultations, admissions, procedures, prescriptions, and reports.

Doctors inside the same tenant can view this for treatment purpose based on role and policy. They cannot edit signed records from another doctor.
