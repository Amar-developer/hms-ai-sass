# Data, Security, and India Compliance

## Compliance Position

MedizinHub HMS should be designed for Indian healthcare from the beginning. This document is a product and engineering checklist, not legal advice. Final compliance should be reviewed with healthcare and privacy counsel before production launch.

Key India-facing areas:

- Digital Personal Data Protection Act, 2023 readiness.
- ABDM/ABHA interoperability readiness.
- Telemedicine Practice Guidelines readiness if online consultation is offered.
- Clinical establishment, medical record, prescription, billing, and professional conduct requirements applicable to the clinic/hospital type and state.
- Tamil Nadu-first regional language support, with PAN India multilingual expansion readiness.
- Secure handling of sensitive health records.
- Consent, auditability, retention, and breach response.

## Compliance Operating Principles

- Treat health information as sensitive personal data even when a law uses broader terminology.
- Collect only data needed for care, billing, compliance, SaaS operations, or consented communication.
- Keep MedizinHub HMS as the source of truth for clinical records; external systems such as ERPNext must not rewrite clinical history.
- Use explicit patient consent for communication, teleconsultation, report sharing, ABHA/ABDM linking, marketing, and family access.
- Apply tenant isolation, branch scoping, RBAC, module entitlements, audit logging, and purpose tracking consistently in every module.
- Provide clear patient-facing notices in the patient's preferred language when data is collected or shared.
- Maintain a compliance matrix per release and review it before pilot, production, and PAN India rollout.

## Data Classification

| Data Type | Examples | Protection |
| --- | --- | --- |
| Identity data | Name, mobile, age, gender, address | Restricted access, encrypted transport |
| Sensitive health data | Diagnosis, prescription, lab report, allergies | Strong access control, audit, encryption |
| Financial data | invoices, payments, refunds | Role-based access, audit |
| Operational data | schedules, queue, branch metrics | Tenant-restricted |
| Platform data | subscription, plan limits, admin logs | SaaS admin restricted |

## Patient Record Rules

- Signed consultation records are immutable.
- Corrections must use addendum/versioning.
- A doctor can create a new record, not rewrite another doctor's history.
- Other doctors in the same tenant may view important history only for treatment purpose.
- Access must be logged.
- Patients should be able to receive their own records through secure channels.

## Access Control

Use both role-based access control and purpose-based access.

Recommended roles:

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

Access examples:

| Role | Allowed | Not Allowed |
| --- | --- | --- |
| Doctor | View patient clinical history for treatment, create consultation | Alter signed history from another doctor |
| Receptionist | Register patient, book appointment, manage queue | View private doctor notes unless allowed |
| Lab Staff | View lab orders, update test results | View full consultation notes |
| Pharmacy | View prescription and dispense medicines | View full EMR timeline |
| Billing | View invoice/payment data | View detailed clinical notes |
| Owner/Admin | Configure clinic and view business analytics | Casually inspect clinical records without policy-backed permission |

## Audit Events

Audit these actions:

- Patient record viewed.
- Clinical note created/updated/signed.
- Prescription created/shared.
- Lab report uploaded/shared.
- Appointment booked/cancelled/requeued.
- Emergency priority used.
- Invoice generated/refunded.
- Payment collected.
- User role changed.
- Data exported.
- Consent granted/revoked.
- Failed login.
- Suspicious access pattern.

Audit fields:

- Actor user ID.
- Role.
- Tenant and branch.
- Patient ID.
- Action.
- Timestamp.
- Device/session/IP.
- Purpose where required.
- Before/after values for configuration changes.

## Consent Management

Track consent for:

- WhatsApp communication.
- SMS communication.
- Email communication.
- Teleconsultation.
- Sharing reports/prescriptions.
- ABDM/ABHA linking where applicable.
- Marketing campaigns.
- Family member access.

Consent records should include:

- Consent purpose.
- Consent channel.
- Consent language and translated consent version.
- Timestamp.
- Expiry if applicable.
- Revocation status.
- Evidence or source.

## Multilingual Compliance

Initial deployment is Tamil Nadu-first. The platform should support English and Tamil for launch, then add Hindi and other Indian languages for PAN India expansion.

Multilingual requirements:

- Patient-facing consent, appointment reminders, payment reminders, lab-ready messages, follow-up reminders, token announcements, and invoices should support Tamil and English.
- Each patient should have a preferred communication language.
- Each tenant and branch should have default language settings.
- Token voice calling must respect branch/token language settings.
- Legal notices, consent text, privacy text, and teleconsultation disclaimers must be versioned per language.
- Stored consent must capture the exact language and version shown or communicated.
- Clinical records should preserve original doctor-entered text. Any translated display should be marked as translated and should never replace the source clinical record.
- Automated translation must not be used for prescription dosage, allergy, diagnosis, lab result, or legal consent without review and clear user indication.
- Notification templates must be parameterized and approved per language to avoid unsafe free-form medical messages.

Suggested language settings:

- `patient.preferred_language`
- `user.preferred_language`
- `tenant.default_language`
- `tenant.supported_languages`
- `branch.default_language`
- `queue.token_language`
- `communication.default_language`
- `template.language`
- `template.version`

## Security Requirements

Minimum production requirements:

- HTTPS everywhere.
- Encryption at rest for database backups and files.
- Strong password policy or passwordless OTP with abuse protection.
- MFA for admins and high-privilege users.
- Tenant isolation at database query and API layer.
- Secure session management.
- Short-lived signed links for prescriptions/reports.
- Object storage access through private buckets.
- Regular backup and restore testing.
- Least-privilege service accounts.
- Rate limits on authentication and public booking APIs.
- Vulnerability scanning and dependency updates.
- Centralized logging and alerting.

## India Healthcare Compliance Checklist

Before production release, review each module against this checklist:

- Patient registration: privacy notice, minimum necessary data, duplicate prevention, consent capture, guardian handling for minors.
- Appointment and queue: consented communication, emergency priority audit, no-show/cancel audit, token display privacy.
- Consultation: doctor identity, immutable signed record, addendum workflow, prescription safety, teleconsultation disclaimers where applicable.
- Patient history: purpose-based access, view audit, role restriction, no casual owner/admin access to clinical notes.
- Lab: sample tracking, result release audit, report sharing consent, secure report links.
- Pharmacy: prescription-based dispensing, medicine issue audit, stock/batch/expiry controls when inventory is enabled.
- Billing/payments: GST/tax readiness, receipt numbering, refund/credit note audit, no unnecessary clinical detail in invoices.
- Notifications: consent, opt-out/revocation, language/template version, secure links for sensitive records.
- AI features: doctor-in-the-loop, source traceability, no autonomous diagnosis/treatment, no unnecessary sensitive data retention.
- Super admin/support: cross-tenant access purpose, support-session audit, least privilege, no silent clinical data edits.
- Exports/reports: explicit export permission, audit event, data minimization, secure file expiry.
- Data retention/deletion: legal hold, medical retention policy, tenant cancellation policy, secure deletion for non-required data.
- Breach readiness: incident workflow, customer/patient notification process, audit export, credential rotation, recovery test.

Detailed implementation gates for consent, retention, audit export, breach workflow, ABDM readiness, backup/restore, monitoring, and release QA are tracked in [Production Readiness Plan](./production-readiness-plan.md).

## Data Residency and Hosting

For Indian healthcare SaaS, prefer:

- Indian cloud region for primary data.
- Indian region for backups where possible.
- Explicit data processing agreements with cloud and communication providers.
- Clear customer contract terms for data ownership, retention, and deletion.

## WhatsApp and Messaging Safety

Avoid sending full medical details directly in chat messages. Use messages like:

```text
Your prescription is ready. View securely: <secure-link>
```

The secure link should:

- Expire.
- Require OTP or patient authentication for sensitive records.
- Log access.
- Support revoke/reissue.

## AI Safety

AI features should follow these rules:

- Doctor remains final decision maker.
- AI-generated summaries should show source records.
- AI outputs should be editable or dismissible.
- AI should not issue diagnosis or treatment independently.
- AI should avoid exposing patient records outside approved infrastructure.
- AI logs should not store unnecessary protected health details.

## Breach and Incident Readiness

Prepare:

- Incident response policy.
- Breach impact assessment workflow.
- Customer notification workflow.
- Patient notification workflow where required.
- Audit export.
- Credential rotation process.
- Recovery playbook.

## Retention and Deletion

The platform should support:

- Tenant-configurable retention policy within legal constraints.
- Patient data export.
- Deactivation instead of hard delete where medical retention is required.
- Legal hold.
- Secure deletion for non-required data.
- Subscription cancellation data policy.
