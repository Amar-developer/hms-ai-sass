# Technology Strategy

## Current Project

The current project is a Next.js and Tailwind prototype. It demonstrates modules such as appointments, queue, patients, doctor flow, lab, pharmacy, billing, subscriptions, and reports.

This is a good frontend prototype base, but production needs backend persistence, authentication, tenant isolation, audit, and integration layers.

## Recommended Production Stack

| Layer | Recommended Choice | Reason |
| --- | --- | --- |
| Web frontend | Next.js + React + TypeScript | Already used, strong web/PWA support |
| Styling | Tailwind CSS + design system components | Fast iteration and responsive UI |
| Mobile | PWA first, then React Native/Expo if needed | Faster market entry |
| Backend | NestJS or Next.js API routes initially | TypeScript consistency |
| Database | PostgreSQL | Reliable relational data and reporting |
| ORM | Prisma or Drizzle | Type-safe database access |
| Cache/queue | Redis | Queue, rate limit, sessions, token state |
| Background jobs | BullMQ / Temporal later | Reminders, automation, integrations |
| Object storage | S3-compatible private storage | Reports, prescriptions, attachments |
| Search | PostgreSQL full text first, OpenSearch later | Patient search and analytics |
| Analytics | PostgreSQL views first, warehouse later | Start simple, grow later |
| Auth | Auth.js, Keycloak, or managed auth | RBAC, MFA, SSO readiness |
| Observability | OpenTelemetry + logs/metrics | Production support |

## Mobile Strategy

Start with a responsive PWA:

- Reception tablet mode.
- Doctor tablet mode.
- Owner mobile dashboard.
- Patient appointment and reports.

Build native apps later only if required for:

- Push notification reliability.
- Offline workflows.
- Device integrations.
- App store distribution.

## Backend Strategy

Recommended staged path:

### Stage 1: Modular Monolith

- One backend application.
- PostgreSQL database.
- Module folders with strict boundaries.
- Background workers.
- Event outbox table.
- API gateway/BFF pattern inside backend.

### Stage 2: Service Extraction

Extract only when scaling demands it:

- Notification service.
- Queue service.
- Billing service.
- AI service.
- Integration service.

### Stage 3: Enterprise Scale

- Data warehouse.
- Multi-region disaster recovery.
- Advanced observability.
- Dedicated tenant deployments for enterprise customers.

## ERPNext/Frappe Strategy

Use ERPNext/Frappe optionally, not as the main app.

Good fit:

- Accounting.
- Inventory.
- Purchase.
- HR/payroll.
- ERP-style finance reports.

Keep custom:

- Appointment UX.
- Doctor consultation UX.
- Patient 360.
- Token queue.
- Automation.
- SaaS subscription enforcement.
- WhatsApp/voice bot workflows.

Integration approach:

- MedizinHub HMS remains source of truth for clinical operations.
- ERPNext receives financial/inventory events.
- Use adapter pattern and async sync.
- Avoid blocking doctor/reception workflows on ERP sync.

## AI and Voice Strategy

Use AI for:

- Patient 360 summaries.
- Consultation note structuring.
- Appointment intent detection.
- Follow-up reminder generation.
- Owner analytics explanation.
- Lab report simplification with doctor review.

Use voice providers for:

- Token calling.
- Appointment confirmation calls.
- Missed appointment recovery.
- Home visit coordination.

Voice token calling can start simple:

1. Generate token phrase.
2. Convert text to speech.
3. Play on clinic display or speaker.
4. Support local languages.

## WhatsApp Strategy

WhatsApp should be implemented through a provider adapter. Use it for:

- Booking.
- Confirmation.
- Reschedule/cancel.
- Queue updates.
- Payment links.
- Prescription/report secure links.
- Follow-up reminders.
- Feedback.

Do not send sensitive medical details directly in chat. Send secure links.

## API Design

Use resource-based APIs for core workflows:

```text
/tenants
/branches
/patients
/appointments
/queue
/consultations
/prescriptions
/lab-orders
/invoices
/payments
/subscriptions
/settings
/audit-events
```

Use command APIs for workflow transitions:

```text
POST /appointments/{id}/check-in
POST /appointments/{id}/mark-not-available
POST /appointments/{id}/requeue
POST /appointments/{id}/cancel
POST /queue/{id}/call-token
POST /consultations/{id}/sign
POST /invoices/{id}/collect-payment
```

## Database Design Direction

Use normalized relational tables for:

- Tenant, branch, department, user, role.
- Patient and patient identifiers.
- Appointment and queue events.
- Consultation, prescription, diagnosis, notes.
- Lab orders and results.
- Invoices, payments, settlements.
- Settings and plan limits.
- Audit events.

Use append-only tables for:

- Clinical record versions.
- Audit logs.
- Queue events.
- Consent records.

## Testing Strategy

Minimum testing layers:

- Unit tests for business rules.
- API tests for workflow transitions.
- Permission tests.
- Tenant isolation tests.
- Audit logging tests.
- Queue ordering tests.
- Fee calculation tests.
- End-to-end tests for booking to billing.

High-risk workflows should get tests first:

- Emergency queue priority.
- Requeue/no-show logic.
- Patient history read-only rules.
- Doctor fee settlement.
- Subscription plan limits.
- Record access audit.
