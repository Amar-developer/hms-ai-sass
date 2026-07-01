# SaaS Plans and Roadmap

## Packaging Principle

Small clinics should be able to start affordably. Larger clinics and hospitals should pay more as they add volume, branches, staff, automation, AI, and advanced modules.

Plan limits should be enforced by tenant:

- Monthly patient count.
- Appointment volume.
- Number of doctors.
- Number of branches.
- Enabled modules.
- Storage.
- Automation credits.
- WhatsApp/voice usage.
- AI usage.

## Suggested Plans

| Plan | Target Customer | Monthly Patient Limit | Positioning |
| --- | --- | ---: | --- |
| Free Trial | New clinic evaluation | 50 | Explore core workflows for limited time |
| Starter Clinic | Small single clinic | 300 | Low-cost entry plan |
| Growth Clinic | Busy clinic | 1,000 | Adds automation and staff workflows |
| Pro Clinic | Multi-doctor clinic | 3,000 | Adds advanced revenue and operations |
| Hospital | Small/mid hospital | 10,000 | Adds IP, multi-department, advanced billing |
| Enterprise | Multi-branch group | Custom | Custom limits, integrations, ABDM readiness |

## Feature Packaging

| Feature | Starter | Growth | Pro | Hospital | Enterprise |
| --- | --- | --- | --- | --- | --- |
| Patient master | Yes | Yes | Yes | Yes | Yes |
| Appointment booking | Yes | Yes | Yes | Yes | Yes |
| Token queue | Yes | Yes | Yes | Yes | Yes |
| Emergency queue | Basic | Yes | Yes | Yes | Yes |
| Doctor consultation | Yes | Yes | Yes | Yes | Yes |
| Prescription | Yes | Yes | Yes | Yes | Yes |
| Billing/invoice | Yes | Yes | Yes | Yes | Yes |
| WhatsApp reminders | Add-on | Yes | Yes | Yes | Yes |
| Lab | No | Add-on | Yes | Yes | Yes |
| Pharmacy | No | Add-on | Yes | Yes | Yes |
| Doctor settlement | No | No | Yes | Yes | Yes |
| Online consultation | Add-on | Add-on | Yes | Yes | Yes |
| Home visit | Add-on | Add-on | Yes | Yes | Yes |
| IP admission | No | No | No | Yes | Yes |
| Multi-branch | No | Add-on | Add-on | Yes | Yes |
| Patient 360 advanced | Basic | Basic | Yes | Yes | Yes |
| AI summaries | Add-on | Add-on | Add-on | Add-on | Yes |
| ABDM readiness | No | No | Add-on | Add-on | Yes |
| Custom integrations | No | No | No | Add-on | Yes |

## Free Trial

The platform should include a free trial to help clinic customers explore the product before subscribing.

Recommended free-trial rules:

- 14-day trial by default.
- Up to 50 patients.
- One branch.
- One to two doctors.
- Appointment, queue, patient, consultation, prescription, and basic billing enabled.
- Payment recording can be enabled with demo/sandbox behavior.
- WhatsApp, voice, AI, ERPNext, ABDM, and advanced modules remain disabled or demo-only.
- Trial expiry should prompt upgrade without deleting customer data.
- Trial tenant should be convertible to paid plan.

## Add-Ons

- Extra branch.
- Extra doctor.
- Extra patient volume.
- WhatsApp pack.
- Voice token calling.
- AI appointment bot.
- AI patient summary.
- Online consultation.
- Home visit management.
- Lab module.
- Pharmacy module.
- Physiotherapy module.
- ABDM/ABHA integration.
- White label.
- Custom domain.
- Data migration.
- Premium support.

## Go-To-Market Strategy

Start with clinics where daily pain is high:

- Reception queue chaos.
- Missed appointments.
- Manual billing.
- No patient history visibility.
- Doctor revenue confusion.
- Follow-up leakage.

First sales promise:

> Manage appointments, token queue, consultation, prescription, and billing in one simple tablet-friendly clinic system.

Second sales promise:

> Add WhatsApp, voice token calling, patient history, revenue analytics, and smart automation as the clinic grows.

## Release Roadmap

### Phase 1: Clinic MVP

- Tenant and branch setup.
- Patient registration.
- Appointment booking.
- Normal/emergency token queue.
- Doctor consultation.
- Prescription.
- Basic invoice.
- Basic reports.
- Starter subscription limits.

### Phase 2: Real Clinic Operations

- Requeue/no-show/cancel workflows.
- Follow-up/review rules.
- Doctor fee configuration.
- Doctor revenue split.
- WhatsApp appointment notifications.
- Waiting area token display.
- Patient 360 summary.
- Audit log foundation.

### Phase 3: Revenue and Automation

- Online consultation.
- Home visit.
- Payment links.
- Cash/card/UPI/GPay/Paytm payment recording.
- Partial payments and pending balance.
- Doctor settlement report basics.
- Doctor settlement ledger.
- Lab and pharmacy modules.
- Voice token calling.
- Reminder automation.
- Owner mobile dashboard.

### Phase 4: Hospital and Multi-Branch

- IP admission.
- Bed/ward management.
- Multi-branch reporting.
- Advanced billing.
- Branch-wise inventory.
- Role and permission hardening.
- Data retention policies.
- ERPNext/Frappe integration option.

### Phase 5: Smart Healthcare Platform

- AI Patient 360 summaries.
- AI consultation assist.
- No-show prediction.
- Smart scheduling.
- ABDM/ABHA readiness.
- Advanced analytics.
- Enterprise integrations.

## Product Success Metrics

Track:

- Appointments booked per month.
- Check-in to consultation time.
- No-show rate.
- Requeue rate.
- Emergency wait time.
- Doctor consultation completion time.
- Patient repeat visit rate.
- Follow-up completion rate.
- Revenue per doctor.
- Revenue per branch.
- Subscription upgrade rate.
- WhatsApp automation usage.
- Voice token usage.
- Support tickets per tenant.

## Product Risks

| Risk | Mitigation |
| --- | --- |
| Too complex for small clinics | Keep simple defaults and hide advanced settings |
| Compliance gaps | Build consent, audit, access control, and retention early |
| AI safety concerns | Keep doctor in control and show source records |
| WhatsApp policy/provider changes | Use provider adapter and avoid sensitive chat content |
| ERP integration complexity | Keep ERP optional and asynchronous |
| Tenant data leakage | Add tenant isolation tests and database safeguards |
| Poor clinic adoption | Prioritize tablet-first speed and receptionist workflows |
