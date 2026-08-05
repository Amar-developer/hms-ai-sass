# Changelog

All notable MedizinHub HMS product changes are recorded here. Versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed — offers are applied by staff, never automatically

Promotional offers are no longer applied to an invoice on the clinic's
behalf. Previously, creating any invoice would silently scan every active
offer and apply the best-value match, so a bill could come out lower than
the listed charges with nobody having decided it should.

- An invoice now shows the best eligible offer as a suggestion — the offer
  name and what it would save — with an **Apply** button on the Payment
  Summary's "Offer & Discount" line. The billed amount only changes when
  staff apply it, matching how membership benefits already work.
- An applied offer can be **removed** until a payment is recorded, which
  restores the original amount and recomputes tax.
- Removing an offer no longer disturbs a separately approved admin
  discount on the same invoice.
- Offers can also be applied by entering the offer's code.
- Applying and removing are both recorded in the billing ledger and audit
  trail, so a discounted bill can always be traced to whoever approved it.
- Invoices created with an explicit offer (via `discount_offer_id`)
  are unaffected and still apply that offer at creation.

## [1.2.0] - 2026-08-05

### Highlights — WhatsApp patient communication

WhatsApp messaging is the headline capability of this release. Tenants can
now reach patients and doctors on WhatsApp for the moments that matter,
with delivery that is auditable, retryable, and safe to run unattended.

- **Per-tenant WhatsApp integration.** Each tenant configures its own
  provider endpoint, API credential, default country code, request timeout,
  and retry ceiling. The credential is stored encrypted and is never
  returned to the browser — only its last four characters are shown.
- **Eleven notification flows,** individually switchable per tenant:
  appointment booked (patient and doctor), appointment cancelled (patient
  and doctor), appointment reminder, paid invoice, payment pending, invoice
  refunded, lab report ready, prescription ready, and follow-up advice.
  Tenants can also register their own approved custom templates.
- **Documents delivered inside the message.** Paid invoices and finalised
  lab reports are attached as PDFs, served from a signed, long-lived link so
  the provider can still fetch the file when it gets round to it.
- **Language-aware templates.** A template identifier can be registered per
  language, and each patient's preferred language selects the right one,
  falling back to the tenant default.
- **Recipient safeguards.** Patient and doctor notifications can be disabled
  independently, patient consent status is tracked and honoured, and a
  patient who has opted out is skipped without failing the queue.
- **Delivery queue with operational health.** Every message is queued with a
  deduplication key, tracked through queued → sent/failed with attempt
  counts and failure reasons, retryable from the UI, and surfaced as
  24-hour sent/failed/stuck counters and a failure-rate indicator.
- **Plan-enforced quota.** Monthly message volume is bounded by the tenant's
  subscription plan, with remaining allowance shown in settings.
- **Rollout readiness checklist** in WhatsApp Settings that blocks go-live
  until the integration, credential, template identifiers, receipt base URL,
  and a successful test delivery are all in place.

### Added

- Date-specific practitioner schedules: a schedule can now apply to a single
  calendar date and either replace ("override") or supplement ("extra") the
  weekly recurrence for that date. The schedule form gained "Applies To" and
  "On That Date" controls for this.
- Home care bookings can restrict visits to alternate days or to specific
  weekdays, so a fortnight booking that only runs Tue/Thu/Sat is planned and
  estimated as 7 visits instead of 15.
- Home care hourly pricing gained a 6-hour tier.
- Lab reports can be sent (and re-sent) to the patient on WhatsApp from the
  Lab & Service screen, and are sent automatically once a report is
  uploaded or re-uploaded.

### Changed — URLs and routing

Every module screen now has its own address. Previously a module had a
single URL (for example `/admin`) and the list, create, detail, and edit
screens were internal component state, so a screen could not be linked,
bookmarked, or restored after a refresh, and browser back/forward did not
move between them.

- Tenant Admin: `/admin/{section}`, `/admin/{section}/new`,
  `/admin/{section}/{id}` and `/admin/{section}/{id}/edit` across users,
  roles, medical departments, branches, suppliers, tax, discounts &
  offers, and patient membership.
- Platform (Super Admin): `/superadmin/{section}` plus `/new`,
  `/{id}/edit`, `/{id}/permissions` and `/{id}/assign` for tenants, roles,
  users, departments, and branches.
- Patients: `/patients`, `/patients/new`, `/patients/{id}`,
  `/patients/{id}/edit`.
- Home care: `/home_care`, `/new`, `/{id}`, `/{id}/edit`, `/{id}/invoice`.
- IP admission: `/ip`, `/ip/convert`, `/ip/direct`, `/ip/{id}`.
- Physiotherapy: `/physiotherapy`, `/op`, `/ip`, `/physiotherapy/{id}`.
- Practitioners and scheduling: `/{module}`, `/new`, `/{id}/edit`.
- Appointments: `/appointments` and `/appointments/new`. The booking
  wizard's internal steps stay in component state, since a link to a
  half-filled step could not be restored meaningfully.
- Reports: `/reports/{tab}` for each of the six report tabs.
- Error logs: `/error_logs` and `/error_logs/{id}`.

### Changed

- `GET /api/v1/practitioners/schedules/grouped` returns one row per editable
  schedule with its timings nested under `slots`, replacing the regrouping
  the scheduling screen used to do in the browser. The original flat
  `GET /api/v1/practitioners/schedules` is unchanged.
- Patient contact resolution falls back primary → alternate → guardian for
  patient lists, patient detail, the appointment grid, invoice receipts, and
  outbound messaging. Messaging sends to exactly one number, so a patient
  with several numbers on file never receives duplicate invoices or
  reminders.
- A practitioner may hold several schedules per department (for example
  separate morning and evening sessions); only genuinely overlapping time
  windows are rejected. Back-to-back sessions are allowed.

### Fixed

- WhatsApp invoice and document delivery no longer hands providers a
  short-lived S3 presigned URL, which could expire before the provider
  fetched the media and left messages marked "sent" with a broken
  attachment.
- Refunded amounts no longer appear as outstanding "due" in billing lists and
  dashboards, and partially refunded invoices are no longer dropped entirely
  from revenue, profit, and settlement reporting.
- The primary platform tenant is provisioned automatically instead of
  returning 402 from every module-gated endpoint.
- Patients whose only number is an alternate or guardian mobile are no
  longer shown as having no contact number.

### Project structure

New files:

- `backend/app/modules/home_care/visit_days.py` — expands a booking's date
  span into its planned visit dates; the single source of truth shared by
  billing estimates, the read model, and the UI.
- `backend/app/modules/patients/contact.py` — patient contact-number
  resolution shared by display and outbound messaging.
- `backend/alembic/versions/20260805_0102_practitioner_schedule_dates.py`
  and `20260805_0103_home_care_visit_days.py`.
- `frontend/features/admin/AdminDataContext.tsx` — hosts Tenant Admin data
  so navigating between its screens no longer refetches everything.
- `frontend/features/superAdmin/routing.ts` — maps the platform workspace's
  section names to URLs and back.
- `frontend/app/(shell)/(app)/admin/layout.tsx`.
- `frontend/app/(shell)/(app)/{module}/[[...segments]]/page.tsx` for admin,
  appointments, error_logs, home_care, ip, patients, physiotherapy,
  practitioners, reports, scheduling, and superadmin — each replacing that
  module's former single `page.tsx`.

Removed:

- `frontend/app/(shell)/(app)/subscriptions/` — an unreachable duplicate of
  the patient membership screen, which is reached at `/admin/membership`.
- `groupSchedules` and `scheduleGroupKey` from
  `frontend/features/scheduling/helpers.ts`, now that the server returns
  schedules already grouped.

## [1.0.0] - 2026-07-28

### Added

- Enterprise release-version management based on the root `VERSION` file.
- Tenant-scoped `@user` mentions in reusable document comments with in-app
  mention notifications.

## [0.1.0] - 2026-07-19

- Established the first tracked MedizinHub HMS release baseline.
