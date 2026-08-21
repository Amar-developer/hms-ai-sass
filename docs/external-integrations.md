# External Integrations

## Purpose

This document explains external API boundaries for object storage, WhatsApp, SMS, email reports, invoice/document delivery, and future integrations.

## Integration Rule

External providers must be behind adapters or service boundaries. Do not call provider SDKs directly from route handlers or React components.

## Object Storage And S3

Production document storage should use S3-compatible storage.

Responsibilities:

- Store file metadata in PostgreSQL.
- Store file bytes in S3 or local storage.
- Download through backend authorization routes.
- Use short-lived signed links only when public delivery is intentionally signed.
- Block public bucket access.
- Use least-privilege credentials.
- Verify storage before production rollout.

Important scripts:

```bash
cd backend
source .venv/bin/activate
python scripts/verify_document_storage.py
python scripts/migrate_documents_to_s3.py --dry-run
python scripts/reconcile_document_storage.py
```

## WhatsApp

WhatsApp is used for operational communication and document delivery where configured.

Rules:

- Templates should be approved and tenant scoped where needed.
- Message creation should happen from domain services or notification processors.
- Provider calls should happen through gateway/adapters.
- Queue records must store status, retryable failure, terminal failure, and provider response safely.
- Invoice/document delivery should use signed or server-mediated URLs.

## SMS

SMS is a provider boundary for appointment, billing, patient engagement, and notification workflows.

Rules:

- Keep provider-specific code behind an adapter.
- Store tenant provider settings securely.
- Respect patient communication preferences when implemented.
- Avoid unnecessary clinical detail in SMS body.
- Do not enable real SMS delivery in development restores.

## Email Reports

Email/monthly reports are handled by report APIs and worker scripts.

Rules:

- Scheduled reports should not run inside request handlers.
- Generated artifacts must be tenant scoped.
- Downloads must be authorized or signed.
- Failures must be logged and retryable where appropriate.

## Public Document Delivery

Public document endpoints must use signatures bound to:

- tenant
- artifact/file id
- expiry
- intended delivery purpose

Never expose long-lived raw object storage URLs for protected patient documents.

## Adding A New External API

1. Define provider boundary.
2. Create adapter.
3. Store credentials in environment or secret manager.
4. Add tenant settings if provider is tenant configurable.
5. Add queue/retry model if delivery can fail.
6. Add tests with fake provider.
7. Add logs and audit events.
8. Update this document and operations runbook.
