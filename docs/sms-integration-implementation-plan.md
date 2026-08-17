# SMS Integration Implementation Plan

Status: Proposed plan only
Last reviewed: 2026-08-17
Target market assumption: India-first, multi-tenant healthcare SaaS
Selected SMS provider: SMSCountry (existing licensed account)

## 1. Objective

Add reliable, consent-aware SMS delivery without coupling HMS workflows to one
vendor. Reuse the existing notification outbox, tenant integration settings,
subscription entitlements, permissions, audit conventions, and background
worker used by WhatsApp.

The first production release should support DLT-approved service messages for
patient care and clinic operations. Promotional campaigns, inbound two-way SMS,
and login OTP should remain separate follow-up scopes because their consent,
routing, abuse-prevention, and availability requirements differ.

## 2. Current Codebase Baseline

The application already contains:

- `NotificationProvider.SMS`, an `sms` subscription module, and
  `communications.sms.manage` permission.
- Tenant/branch provider enablement through
  `communication.providers_enabled`.
- Durable `NotificationEvent` rows with retry count, next-attempt time,
  deduplication key, resource linkage, audit trail, and provider message ID.
- SMS enqueue calls for appointment booking, consultation follow-up advice,
  payment reminders, invoice/source flows, and lab-report-ready events.
- A mature WhatsApp integration that can be used as the pattern for encrypted
  per-tenant credentials, settings/readiness screens, tests, queue operations,
  and worker processing.

The current SMS path is not production-ready:

- No SMS gateway port/adapter or due-event processor sends queued SMS rows.
- Existing triggers use free text rather than registered DLT templates.
- SMS-specific consent, preference, language, usage limits, and quiet-hour
  policy are not modeled.
- There are no delivery-receipt webhooks, delivered/undelivered states, SMS
  settings APIs, admin UI, queue controls, or provider health/readiness checks.
- Some trigger helpers silently suppress entitlement/settings errors. This is
  acceptable for non-blocking clinical workflows, but the reason must become
  observable to administrators.

## 3. Decisions Required Before Development

These decisions are release gates, not implementation details:

1. **DLT ownership model:** decide whether each clinic is the Principal Entity
   with its own entity ID/header/templates, or whether MedizinHub can legally
   send for tenants under a platform/aggregator arrangement. Do not assume one
   platform header can represent every clinic.
2. **Provider (resolved):** use the tenant's existing licensed SMSCountry
   service. Confirm whether the account should use SMSCountry's current REST API
   or its legacy HTTP API, and obtain the production API documentation from the
   account manager. The application contract remains vendor-neutral, with an
   isolated `SmsCountryGateway` adapter.
3. **Message classification:** approve which flows are transactional, service
   implicit, service explicit, or promotional. Have the provider/compliance
   owner validate the classification and consent requirement for every flow.
4. **Sender identity:** define tenant or branch-level header selection and the
   fallback policy. Missing or unapproved DLT configuration must block sending,
   not fall back to an unrelated sender.
5. **Consent policy:** decide whether care-related service SMS may be sent based
   on the underlying patient transaction and which flows require explicit/DCA
   consent. Marketing must always be isolated behind explicit consent and
   recipient preference checks.
6. **Billing model:** decide whether SMS is included by plan, prepaid credits,
   usage-based billing, or a combination, and who absorbs retry/Unicode segment
   costs.
7. **Data residency and retention:** approve provider region/DPA, webhook data,
   message-log retention, and whether message bodies may be retained after
   delivery.

## 4. Use Cases and Recommended Priority

| Priority | Use case | Recipient | Trigger | Important safeguards |
| --- | --- | --- | --- | --- |
| P0 | Appointment booked/confirmed | Patient or authorized guardian | Successful booking | Dedupe per appointment and audience; no diagnosis |
| P0 | Appointment reminder | Patient or guardian | Scheduled offset before appointment | Skip cancelled/completed visits; quiet hours; latest appointment state |
| P0 | Reschedule/cancellation | Patient or guardian | Confirmed status change | High-priority service template; include clinic contact |
| P0 | Queue/token alert | Patient | Token nearing turn or called | Throttle repeated calls; avoid exposing identity on shared phones |
| P0 | Payment pending | Patient/guarantor | Invoice with outstanding balance | Minimal amount/invoice reference; no clinical line items |
| P0 | Lab report ready | Patient/guardian | Released report | Never include results; use short-lived secure link if enabled |
| P0 | Follow-up reminder | Patient/guardian | Doctor-approved follow-up date | Do not put clinical advice or diagnosis directly in SMS |
| P1 | Payment receipt | Patient/guarantor | Successful payment | Signed receipt link; dedupe per payment |
| P1 | Prescription/document ready | Patient/guardian | Finalized artifact | Secure expiring link; no medicine or diagnosis in message |
| P1 | Home-care visit reminder | Patient/caregiver | Scheduled visit | Authorized caregiver relationship and destination |
| P1 | Membership/package expiry | Patient | Configurable time before expiry | Keep service notice separate from promotional upsell |
| P2 | Staff operational alert | Staff | Failed workflow/escalation | Separate staff consent/contact and tenant policy |
| Future | Login/verification OTP | User/patient | Authentication challenge | Separate low-latency path, TTL, attempt limits, anti-abuse, no normal queue dependency |
| Future | Marketing/campaigns | Explicitly opted-in patient | Approved campaign | Separate permission, DCA/consent, preference/DND checks, opt-out and frequency caps |
| Future | Inbound replies | Patient | Provider inbound webhook | Number ownership, commands, identity ambiguity, escalation, retention |

## 5. Proposed Architecture

### 5.0 SOLID implementation constraints

The SMS integration must follow the architecture already established by the
project. SOLID is an implementation constraint and part of review acceptance,
not a later refactoring activity.

| Principle | SMS implementation rule |
| --- | --- |
| Single Responsibility | Routes handle HTTP only; `SmsIntegrationService` handles settings/use cases; `SmsPolicyService` handles consent and eligibility; `SmsTemplateResolver` handles approved template selection/rendering; `SmsQueueProcessor` handles claiming and status transitions; `SmsCountryGateway` handles only SMSCountry protocol translation; repositories handle persistence queries. |
| Open/Closed | New providers are added as new `SmsGateway` adapters and factory registrations. Domain workflows, queue models, and API contracts must not be rewritten to add another provider. |
| Liskov Substitution | Every adapter must obey the same gateway result semantics for accepted, permanent failure, retryable failure, external ID, and delivery status. Shared contract tests must run against the SMSCountry adapter and future adapters. |
| Interface Segregation | Use small interfaces such as `SmsSender`, `SmsDeliveryStatusVerifier`, or webhook verifier only where required. Do not create one gateway interface containing SMS, WhatsApp, OTP, balance, templates, reports, and campaigns. |
| Dependency Inversion | Notification/domain services depend on the `SmsGateway` port and injected policy/repository contracts, never on SMSCountry HTTP classes. The composition factory is the only layer that selects `SmsCountryGateway`. |

Additional boundaries:

- No provider SDK, endpoint, payload key, or SMSCountry status code in clinical,
  billing, patient, notification-domain, or API route code.
- No direct database queries in the SMS API router or provider adapter.
- No business policy in Pydantic schemas, React components, worker entrypoints,
  or webhook parsing code.
- Do not create a single large `sms_service.py`; split settings, policy,
  templates, usage, queue administration, processing, and callbacks by reason
  to change.
- Use constructor/function dependency injection and the existing integration
  factory. Tests provide fake gateway/clock implementations without network
  calls or global monkey-patching where practical.
- Keep compatibility facades only where existing imports require them; new code
  imports the focused service or port directly.

### 5.1 Boundary and modules

Follow the existing ports-and-adapters structure:

```text
Clinical/billing workflow
  -> SMS policy + template resolver
  -> NotificationEvent outbox (provider=sms)
  -> background worker claims due rows
  -> SmsGateway port
  -> provider adapter
  -> provider delivery-receipt webhook
  -> delivery status/audit/metrics
```

Planned ownership:

- `modules/notifications`: queueing, claiming, retry, cancellation, status
  transitions, deduplication, and audit.
- `modules/integrations`: tenant SMS settings, encrypted credentials, DLT
  metadata, flow/template policy, consent checks, usage/readiness.
- `infrastructure/integrations/ports`: provider-neutral `SmsGateway` request and
  result contracts.
- `infrastructure/integrations/adapters/sms`: vendor-specific payloads,
  authentication, response normalization, and webhook signature verification.
- `api/v1/communications.py` or a split SMS router: admin settings/test/queue and
  provider callback endpoints.
- Existing report worker initially runs the SMS processor; move outbound work
  to a dedicated notification worker when volume or isolation requires it.

### 5.2 SMSCountry adapter and gateway contract

Define a channel-specific port rather than forcing SMS through the WhatsApp
template contract. A send request should contain:

- destination in normalized E.164 form;
- message/template variables in declared order;
- DLT principal entity ID, header/sender ID, content template ID, route/category,
  and language/encoding;
- tenant event ID as client reference/idempotency key;
- request timeout and optional callback correlation value.

Normalize provider responses into accepted/rejected, external message ID,
retryability, safe error code, HTTP status, and segment count when available.
Never expose raw provider responses or credentials to tenant users or logs.

The SMSCountry implementation should prefer its HTTPS REST API and token-based
authentication if those features are enabled for the licensed account. Do not
place the username, password, message, or patient number in logged URLs. Enable
delivery reports and map SMSCountry's provider job/message ID to
`provider_message_id`. Normalize its documented receipt states—queued,
submitted to carrier, undelivered, delivered, expired, rejected, opted out, and
invalid number—into the HMS delivery lifecycle. Confirm the exact API version,
DLT parameters, authentication scheme, callback format, callback verification,
and IP-allowlisting options with SMSCountry before coding because its public
documentation includes both current REST and legacy HTTP interfaces.

### 5.3 Tenant settings

Reuse `TenantIntegrationPlugin` with `plugin_key="sms"` and encrypted secrets.
Proposed non-secret configuration:

- provider adapter key and API base URL selected from an allowlist;
- enabled flag and patient/staff audience toggles;
- default country code and default language;
- DLT principal entity ID and tenant/branch sender headers;
- approved flow definitions containing template ID, exact registered body,
  variable field mapping, category, language, enabled state, and version;
- quiet hours/timezone and urgent-event exceptions;
- retry count, request timeout, throughput cap, and daily/monthly spend/message
  limits;
- delivery-receipt webhook health metadata (not its secret);
- optional fallback channel policy, disabled by default.

Store the API credential and webhook secret encrypted. Return only presence and
last-four metadata. Restrict arbitrary provider URLs to platform configuration
or a strict public-HTTPS allowlist to avoid SSRF.

### 5.4 Patient communication preferences

Do not reuse `whatsapp_consent_status` for SMS. Add channel-neutral preferences
or explicit SMS fields that record:

- status: not recorded, opted in, opted out;
- purpose/category, scope, and lawful/service basis;
- source, notice/template version, captured by, captured at, and expiry if any;
- preferred channel and language;
- destination type: patient, guardian, or caregiver;
- withdrawal timestamp/reason and an append-only consent audit history.

Before enqueue and again immediately before send, verify the latest patient
state, consent/preference, recipient ownership, flow classification, and tenant
policy. The second check prevents a queued message from being sent after an
opt-out, appointment cancellation, mobile-number change, or patient status
change.

### 5.5 Templates and message safety

- All production SMS flows use approved, versioned templates; no arbitrary
  free-text send endpoint in phase 1.
- Map named domain fields to provider/DLT variable positions, with per-field
  type and length validation.
- Store the template key/version and rendered-body hash on the event so sends
  are reproducible without retaining extra sensitive context.
- Include clinic/brand identity in the fixed template text.
- Never send diagnosis, test results, prescriptions, detailed clinical advice,
  or complete financial/identity data. Use an expiring, revocable, access-logged
  secure link for sensitive artifacts.
- Treat URLs, phone numbers, and variable placement as registered-template
  content; do not dynamically insert unregistered links or promotional text.
- Calculate GSM-7 versus Unicode segment count before enqueue. Show estimated
  segments/cost in template test and admin views, and set maximum segments per
  flow.

## 6. Data Model Plan

Prefer additive migrations and preserve existing WhatsApp behavior.

1. Extend `NotificationEvent` or add an SMS delivery-attempt table with:
   provider adapter, template version/ID snapshot, sender header snapshot,
   rendered hash, accepted timestamp, delivered timestamp, final provider
   status/code, segment count, cost metadata, and callback-updated timestamp.
2. Keep `sent` meaning provider accepted only if documented clearly; preferably
   add delivery lifecycle values such as `accepted`, `delivered`, `undelivered`,
   and `expired`, or keep transport status and delivery-receipt status in
   separate fields to avoid changing existing channel semantics.
3. Add a per-attempt record for retry diagnostics while keeping sanitized
   failure summaries on `NotificationEvent`.
4. Add channel-specific patient communication preference and immutable consent
   history records. Backfill existing patients to `not_recorded`; never infer SMS
   opt-in from WhatsApp consent.
5. Add usage aggregation by tenant, provider, billing period, category,
   delivered/failed outcome, and billable segments.
6. Ensure indexes support claiming due SMS rows, provider-message-ID callback
   lookup, tenant queue filtering, and usage calculation.

## 7. API and Admin UI Plan

### 7.1 Tenant admin APIs

Mirror the WhatsApp management experience, guarded by
`communications.sms.manage`, `communications.manage`, or `settings.manage`:

```text
GET  /communications/sms/settings
PUT  /communications/sms/settings
POST /communications/sms/test
GET  /communications/sms/queue
POST /communications/sms/queue/{event_id}/retry
POST /communications/sms/queue/{event_id}/cancel
GET  /communications/sms/usage
```

The test endpoint must use an approved template, identify itself as a test where
the registered text permits, enforce authorization/rate limits, and create an
audited queue event. It must not accept an arbitrary body.

### 7.2 Provider callback API

Add a provider-specific public callback path, for example:

```text
POST /communications/public/sms/{provider}/delivery-receipts
```

Requirements: signature or shared-secret verification, replay protection,
request size limit, safe parsing, idempotent updates, provider-message-ID plus
tenant correlation, tolerance for out-of-order callbacks, no tenant trust from
unverified payload fields, and rapid acknowledgement before asynchronous
processing where needed.

### 7.3 Admin UI

Add an SMS Integration section alongside WhatsApp with:

- connection/credential status and safe save/rotate flow;
- DLT entity, sender header, and template readiness checklist;
- patient/staff enablement, language, quiet hours, and limit settings;
- approved template list with variable mappings and segment preview;
- test-message modal;
- queue filters, masked recipients, retry/cancel actions, failure reason,
  accepted/delivered distinction, and usage/cost summary.

Hide or disable SMS setup when the tenant lacks the `sms` entitlement. Apply
branch scope where branch headers/configuration differ.

## 8. Queue, Retry, and Reliability Rules

- Claim rows atomically using the same concurrency pattern as the WhatsApp
  processor; recover stale processing claims.
- Use a unique dedupe key for every business event and audience, such as
  `sms:appointment:{id}:booked:patient:v1`.
- Revalidate policy and render from current authoritative domain data at send
  time, while pinning the selected template version.
- Retry only transient failures: timeout, connection error, provider 5xx, or
  explicit rate limit. Use exponential backoff with jitter and honor provider
  retry hints.
- Do not retry invalid destination, DLT/template mismatch, blocked/DND outcome,
  rejected credential, opted-out recipient, or permanent provider rejection.
- Apply tenant and provider rate limits, fairness between tenants, maximum
  attempts, age/expiry cutoff, and a dead-letter/failed state visible to admins.
- Cancellation is allowed only while queued/failed; accepted messages cannot be
  recalled.
- Fallback to WhatsApp/email must be an explicit per-flow policy and must pass
  that channel's own consent and entitlement checks. Never send both channels
  accidentally.

## 9. Trigger Refactor Plan

Replace each existing free-text `queue_notification_if_allowed(... SMS ...)`
call with an SMS template helper that performs flow, consent, template, usage,
recipient, language, and dedupe checks.

Recommended order:

1. Appointment booked plus appointment reminder scheduler.
2. Appointment rescheduled/cancelled and queue token alert.
3. Payment pending and receipt.
4. Lab report ready.
5. Follow-up reminder using a safe fixed template; do not send the doctor's
   free-text `follow_up_advice` directly.
6. Prescription/document-ready, home-care, and membership events.

Audit all call sites before enabling the worker. Existing queued SMS test/dev
rows should be expired or handled by an explicit migration policy so old
free-text rows are not unexpectedly delivered after deployment.

## 10. Security, Privacy, and Regulatory Concerns

- Complete DLT Principal Entity, registered header, content-template, and any
  required consent-template setup before live sending. Commercial messages are
  scrubbed against registered templates and non-matching traffic may be blocked.
- Respect recipient preferences, explicit consent where required, and consent
  revocation. Keep promotional communications separate from care/service
  notifications.
- Obtain compliance/legal confirmation for TCCCPR classification and current
  DLT/DCA requirements; regulations and provider codes of practice can change.
- Minimize health information in SMS because phones may be shared, locked-screen
  previews expose content, and SMS is not end-to-end encrypted.
- Mask phone numbers in APIs, logs, metrics, and admin tables except where a
  specifically authorized workflow needs full access.
- Never log API keys, webhook secrets, full request/response bodies, template
  variables, or sensitive message contents.
- Validate tenant ownership for every event, template, callback, resource, and
  queue action. Prevent one tenant's credential/header from sending another
  tenant's event.
- Rate-limit test sends, manual retries, callback endpoints, and any future OTP
  endpoint. Alert on credential abuse or traffic spikes.
- Define deletion/retention separately for consent evidence, audit records,
  delivery metadata, and message bodies.
- Execute provider DPA/security review covering subprocessors, breach notice,
  data location, retention, support access, and credential handling.

Regulatory references to validate during implementation:

- [TRAI TCCCPR consolidated regulation](https://trai.gov.in/node/3199)
- [TRAI guidance for senders](https://trai.gov.in/advice-to-senders)
- [TRAI customer consent guidance](https://www.trai.gov.in/manage-your-consent)
- [SMSCountry REST API resources](https://www.smscountry.com/sms-api/get-started/SMSCountry-REST-API-resources)
- [SMSCountry HTTP API and delivery-report documentation](https://www.smscountry.com/sms-api-documentation-1.aspx)

## 11. Observability and Operations

Track without high-cardinality patient data:

- queued, processing, provider-accepted, delivered, failed, undelivered, expired,
  cancelled, retried, and suppressed counts;
- suppression reasons: entitlement, disabled provider/flow, missing consent,
  invalid number, quiet hours, limit reached, or missing template;
- queue depth and oldest due event by tenant/provider;
- send latency, delivery latency, retry rate, webhook verification failures,
  unknown callback IDs, and stale processing recoveries;
- billable segments and estimated/actual cost by tenant, flow, and billing period;
- provider availability, throttling, credential rejection, and DLT mismatch rate.

Add alerts for queue age, sustained failure rate, delivery-receipt outage,
credential rejection, monthly-limit proximity, unexpected volume, and webhook
signature failures. Provide a runbook for provider outage, credential rotation,
template rejection, stuck queue, replay/backfill, and emergency channel disable.

## 12. Testing Strategy

### Unit tests

- E.164 normalization and Indian number edge cases.
- Template resolution, variable validation, Unicode/GSM segment calculation,
  safe rendering, and maximum length.
- Consent/preference, guardian destination, quiet hours, flow enablement,
  entitlement, branch override, limit, and suppression policies.
- Provider error mapping into retryable/permanent outcomes.
- Callback signature, replay, out-of-order, duplicate, and unknown-ID handling.

### Integration tests

- Settings encryption/redaction, permissions, tenant isolation, API validation,
  test send, queue filters, retry, and cancel.
- Atomic worker claiming, dedupe under concurrency, backoff, stale recovery,
  accepted versus delivered transitions, and usage counting.
- Every P0 domain trigger, including cancellation after enqueue and opt-out or
  mobile change before send.
- Webhook fixtures recorded from the selected provider, with secrets removed.

### Frontend tests

- Entitlement/permission visibility, settings validation, secret redaction,
  readiness failures, template preview/segment count, queue actions, masked
  recipient display, and accessible loading/error states.

### Non-functional tests

- Provider sandbox smoke test; controlled production canary to allowlisted
  internal numbers.
- Worker throughput and tenant fairness at forecast peak volume.
- Security tests for SSRF, callback forgery/replay, cross-tenant access, secret
  exposure, log redaction, and test-send abuse.
- Failure drills for provider outage, delayed/out-of-order receipts, rate limits,
  and credential rotation.

## 13. Delivery Phases

### Phase 0 — Compliance and SMSCountry readiness

- Finalize DLT ownership, message classifications, consent rules, SMSCountry
  DPA/account setup, registered headers, approved P0 templates, pricing, and
  retention.
- Confirm the licensed account's REST API access, auth key/token, approved
  sender IDs, DLT entity/template records, credit/balance behavior, test route,
  throughput, static-IP allowlisting, and delivery-report callback contract.
- Define delivery SLOs and the authoritative meaning of accepted versus
  delivered.

Exit: compliance owner, product owner, and engineering approve a flow/template
matrix; provider sandbox and webhook documentation are available.

### Phase 1 — Foundation

- Add SMS schemas/settings service, encrypted configuration, gateway port and
  selected adapter, delivery lifecycle fields, consent model, template resolver,
  usage policy, and unit tests.
- Add dependency injection/composition through the integration factory and
  architecture tests that prevent application/domain modules from importing the
  SMSCountry adapter.

Exit: settings/readiness APIs pass; adapter contract and migrations are tested;
SOLID boundary tests pass; no production triggers send yet.

### Phase 2 — Worker and administration

- Add queue processor, atomic claiming, retry/permanent-failure policy, delivery
  receipt endpoint, queue operations, metrics, alerts, admin UI, and runbook.

Exit: sandbox sends reach accepted and delivered states; duplicate callbacks and
  retries remain idempotent; tenant isolation tests pass.

### Phase 3 — P0 workflow rollout

- Refactor P0 triggers to approved templates, add send-time revalidation, and
  schedule appointment reminders.
- Enable only for an internal/test tenant, then one pilot clinic, then a small
  percentage of eligible tenants.

Exit: no free-text SMS path remains enabled; delivery/failure/cost dashboards are
stable; pilot clinic confirms templates and recipient behavior.

### Phase 4 — Expansion and billing

- Add P1 flows, plan/credit enforcement, invoices/usage exports, additional
  languages, provider failover only if justified, and dedicated notification
  worker scaling.

Exit: usage reconciles with provider billing and tenant limits; support and
incident processes are operational.

### Phase 5 — Separate future projects

- OTP/verification, promotional campaigns, inbound replies, and multi-provider
  routing each receive their own threat model, product requirements, and rollout.

## 14. Definition of Done for the First Production Release

- One approved provider adapter sends only registered P0 service templates.
- Tenant SMS credentials, DLT IDs, headers, templates, and controls are securely
  configurable and readiness-validated.
- SMS consent/preferences and guardian destinations are captured, audited, and
  rechecked at send time.
- All P0 events are idempotent, tenant-isolated, retry-safe, and observable from
  enqueue through delivery receipt.
- Existing free-text SMS triggers have been migrated or disabled.
- Admins can test, inspect, filter, cancel, and retry appropriate events without
  viewing secrets or unnecessary patient data.
- Usage/segment limits and subscription entitlement are enforced before send.
- Regulatory, privacy, security, load, integration, and frontend tests pass.
- Architecture tests confirm routes remain thin, persistence stays behind
  repositories, domain services depend on the `SmsGateway` abstraction, and no
  SMSCountry imports escape the infrastructure adapter/composition boundary.
- Canary, rollback/kill switch, support runbook, monitoring, and owner sign-off
  are complete before broader tenant enablement.

## 15. Suggested Work Breakdown

| Workstream | Main outputs | Depends on |
| --- | --- | --- |
| Product/compliance | Flow classification, consent matrix, approved wording, DLT ownership | None |
| SMSCountry onboarding | Licensed account scope, REST credentials, headers/templates, sandbox, callback verification, DPA | Product/compliance |
| Data and policy | Migrations, consent history, template/version model, usage rules | Classification decisions |
| Backend adapter | SMS port, provider adapter, response/error normalization | Provider selection |
| Queue/reliability | Processor, claims, retries, receipts, stale recovery, kill switch | Data model and adapter |
| Trigger migration | P0 template helpers and domain call-site refactor | Templates and queue |
| Admin frontend | Settings, readiness, templates, test, queue, usage | Stable APIs |
| Operations | Metrics, alerts, dashboards, runbook, billing reconciliation | Worker and callbacks |
| QA/security | Contract, workflow, tenancy, abuse, failure, and load tests | All implementation streams |

The critical path is compliance classification and DLT/provider onboarding,
followed by the data/adapter foundation, worker and callbacks, trigger migration,
and finally controlled rollout.
