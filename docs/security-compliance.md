# Security and Compliance

## Purpose

This guide defines the security, privacy, and compliance operating rules for MedizinHub HMS. It is written for engineers, operators, administrators, and reviewers.

## Compliance Position

MedizinHub HMS handles healthcare data and must be treated as a sensitive clinical system. The project should follow strong healthcare data protection practices, India data protection expectations, and organization-specific legal requirements. This document is an engineering control guide, not legal advice.

## Data Classification

| Class | Examples | Handling |
| --- | --- | --- |
| Public | marketing text, public status pages | No patient or tenant secrets |
| Internal | feature docs, non-sensitive config | Team-only |
| Confidential | tenant settings, operational logs, staff data | Access controlled |
| Restricted healthcare data | patient records, consultations, invoices, reports, prescriptions | Strong access control, audit, retention, secure transport |
| Secrets | database passwords, auth secrets, provider keys | Secret manager or environment only, never git |

## Patient Data Rules

- Collect only what the workflow needs.
- Display only what the role needs.
- Do not log patient records, prescriptions, reports, or invoices unless masked and explicitly required for debugging.
- File downloads must pass backend authorization.
- Patient data exports must be permission controlled and audited.
- Production data copied to development must be approved and masked when required.

## Access Control

Controls:

- Authentication required for protected APIs.
- Tenant context required for tenant data.
- Branch checks required for branch-scoped data.
- Role-based permissions required for sensitive actions.
- Module entitlement required for disabled or paid modules.
- Platform-only actions stay platform scoped.

Rules:

- Frontend hiding is not security.
- Backend must enforce every permission.
- New API routes must be added to `api-permission-matrix.md`.
- Privileged permission changes must be auditable.

## Tenant Isolation

Tenant isolation is mandatory.

Every tenant-scoped query must:

1. Resolve current tenant.
2. Filter by tenant id.
3. Check branch access when applicable.
4. Avoid cross-tenant joins unless the route is explicitly platform scoped.
5. Avoid returning raw ids that allow cross-tenant guessing.

## Audit Events

Audit sensitive actions:

- Login and logout events where available.
- Role and permission changes.
- Tenant settings changes.
- Patient create, update, export, or merge.
- Consultation sign or correction.
- Invoice issue, payment, credit note, void, or settlement.
- File upload, protected download, delivery, or deletion.
- Notification template changes.
- Provider credential changes.
- Production support access.

Audit records should include:

- Actor.
- Tenant.
- Branch if applicable.
- Action.
- Target type and id.
- Timestamp.
- Request or correlation id where available.
- Safe metadata only.

## Authentication and Sessions

- Production cookies must be secure.
- Session and token secrets must be long, random, and private.
- Password reset and forced password change flows must not leak account existence.
- Logout should clear client and server session state where applicable.
- Privileged accounts should use strong password policies and operational controls.

## Communication Safety

Channels:

- In-app notifications.
- WhatsApp.
- SMS.
- Email reports.

Rules:

- Use templates for provider-delivered messages.
- Avoid unnecessary diagnosis, prescription, and report detail in message body.
- Use signed links or server-mediated downloads for protected documents.
- Store provider delivery status without storing excessive patient content.
- Respect patient communication preferences when implemented.
- Do not enable real provider delivery in development restore environments.

## File and Document Security

- Production files should use private S3-compatible storage.
- Buckets must block public access.
- Use least-privilege credentials.
- Use server-side encryption.
- Do not expose long-lived raw object URLs.
- Signed URLs must be short lived.
- Protected document access must check tenant, branch, role, and document ownership.
- File deletion must respect retention and legal hold rules.

## Backup Security

- Encrypt backups.
- Restrict backup access.
- Test restore regularly.
- Do not leave dumps in public directories.
- Mask production data when restored to non-approved environments.
- Rotate credentials if backup exposure is suspected.

## Logging Safety

Allowed in normal logs:

- Request path.
- Status code.
- Correlation id.
- Tenant id when operationally required.
- Safe error category.

Avoid:

- Patient names and mobile numbers.
- Full addresses.
- Prescriptions.
- Lab reports.
- Invoice PDFs or document content.
- Passwords, tokens, cookies, provider keys.

## India Compliance Checklist

Engineering controls should support:

- Consent-aware patient communication.
- Purpose-limited data collection.
- Role-based access.
- Auditability.
- Data correction workflows.
- Retention and deletion policy enforcement.
- Breach readiness.
- Secure storage and transport.
- Vendor/provider due diligence for messaging and storage.
- Data residency decisions documented by the business.

## Incident Readiness

Potential incidents:

- Tenant data exposure.
- Unauthorized patient record access.
- Lost or corrupted data.
- Payment or invoice integrity issue.
- Compromised credentials.
- Public file exposure.
- Provider misdelivery.

Initial response:

1. Stop active exposure.
2. Preserve logs and audit evidence.
3. Identify tenants and records affected.
4. Rotate credentials if needed.
5. Restore service safely.
6. Notify internal stakeholders.
7. Follow legal notification process where required.
8. Add prevention controls.

## AI and Automation Safety

- AI features must not make final clinical decisions without clinician review.
- AI-generated summaries must show source context or confidence where relevant.
- Do not send restricted patient data to third-party AI services unless approved.
- Automation must be reversible or auditable when it changes clinical, billing, or communication state.

## Retention and Deletion

Retention policy must account for:

- Patient records.
- Invoices and payments.
- Lab reports.
- Prescriptions.
- IP records.
- Audit events.
- Communication delivery records.
- File storage objects.
- Backups.

Deletion rules:

- Soft delete is preferred for clinical and financial records.
- Hard delete must be restricted and audited.
- Legal hold must block destructive actions.
- File metadata and object deletion must stay consistent.

## Security Review Checklist

Before merging sensitive changes:

- Permissions are enforced in backend.
- Tenant and branch isolation tests exist.
- Audit event exists where required.
- No secrets in code or docs.
- Logs do not expose patient data.
- Files are accessed through authorized routes.
- Provider calls are behind adapters.
- New environment variables are documented.
- Incident or rollback impact is understood.
