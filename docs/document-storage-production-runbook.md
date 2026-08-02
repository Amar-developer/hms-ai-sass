# Document Storage Production Runbook

This runbook covers the Phase 5 rollout for permanent invoice, report, and
clinical document storage and artifact-pinned email/WhatsApp delivery. It does
not authorize deletion of production healthcare data.

## Environment ownership

| Environment | Recommended bucket | Treatment |
| --- | --- | --- |
| Local S3 testing | `medizinhub-local-documents` | Disposable probe data only |
| Development/UAT | `medizinhub-dev-documents` | Persistent environment; clean explicit test prefixes |
| Production | `medizinhub-prod-documents` | Permanent sensitive healthcare records |

Do not delete the development bucket after a normal test cycle. Keep it for
repeatable UAT and let lifecycle rules delete objects explicitly tagged
`retention=temporary`. The supplied cleanup command is restricted to
`phase4-probes/` and refuses production.

## Provision AWS resources

Validate the S3 template before deployment:

```bash
cd backend
PYTHONPATH=. .venv/bin/python -m scripts.validate_cloudformation_templates
cd ..
aws cloudformation validate-template \
  --template-body file://infra/aws/document-storage.yaml
```

Deploy the dev bucket:

```bash
aws cloudformation deploy \
  --stack-name medizinhub-dev-document-storage \
  --template-file infra/aws/document-storage.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=development \
    BucketName=medizinhub-dev-documents
```

Deploy production with `Environment=production`, the production bucket name,
and the approved KMS ARN when customer policy requires a customer-managed key.
Attach the output managed-policy ARN only to the backend and document-delivery
worker role. The frontend must never receive AWS credentials.

## Three-level verification

### Local

```bash
cd backend
PYTHONPATH=. .venv/bin/python -m scripts.verify_document_storage
pytest -q tests/test_file_storage.py tests/test_document_optimization.py \
  tests/test_invoice_receipt_delivery.py tests/test_storage_metrics.py
```

Confirm first send creates one finalized artifact, resend creates none, and
regeneration creates exactly one new immutable version.

### Development S3

Use the staging environment configuration and the EC2/task IAM role:

```bash
cd backend
PYTHONPATH=. .venv/bin/python -m scripts.verify_document_storage --live
PYTHONPATH=. .venv/bin/python -m scripts.verify_document_storage --live --write-probe
```

The write probe creates, reads and deletes one tagged object. List any remaining
probe versions without changing AWS state:

```bash
PYTHONPATH=. .venv/bin/python -m scripts.cleanup_document_test_objects
```

Cleanup is deliberately explicit:

```bash
PYTHONPATH=. .venv/bin/python -m scripts.cleanup_document_test_objects \
  --execute --confirm-bucket medizinhub-dev-documents
```

### Production

1. Back up the database and verify restore instructions.
2. Deploy the S3 storage stack and attach its IAM policy to the EC2 role.
3. Run the verifier with `--live` only; do not start with a write probe.
4. Apply Alembic migrations through `20260729_0101`.
5. Deploy the worker, API and frontend from the same release.
6. Keep `MEDIZINHUB_PERMANENT_INVOICE_DELIVERY_ENABLED=false` initially.
7. Enable it for the controlled rollout and restart API/worker processes.
8. Finalize and send one authorized internal test invoice.
9. Confirm resend does not increase the S3 object count.
10. Inspect delivery failures, queue age, and tenant storage metrics for 24–48
    hours before wider rollout.

## Acceptance checks

- Bucket public access is completely blocked.
- Default encryption and TLS-only bucket policy are active.
- Production versioning is enabled.
- Required lifecycle rules exist; permanent artifacts have no expiry rule.
- IAM cannot access another environment's bucket.
- Object keys contain opaque tenant/entity identifiers, not patient names.
- Every new invoice delivery row has an artifact file ID and version.
- Report and lab deliveries contain the exact stored artifact IDs they sent.
- Report resend creates a new delivery row but no new S3 object.
- Regeneration reason is present in the audit trail.
- Expired signed URLs do not remove the stored object.
- `duplicate_active_invoice_artifacts` is zero.

## Rollback

Disable `MEDIZINHUB_PERMANENT_INVOICE_DELIVERY_ENABLED` to stop new finalization,
regeneration and sends. Existing permanent objects remain untouched. Roll back
the application release only after confirming its database compatibility; do
not delete the bucket or migration-created artifact metadata during rollback.

## Existing-document migration

Back up and restore-test the database before migration. The migration command is
dry-run by default and leaves local source bytes in place even after a successful
copy, so application rollback remains possible.

```bash
cd backend
PYTHONPATH=. .venv/bin/python -m scripts.migrate_documents_to_s3
PYTHONPATH=. .venv/bin/python -m scripts.migrate_documents_to_s3 \
  --execute --confirm-bucket medizinhub-dev-documents
```

After a development/UAT pass, reconcile database metadata against S3 without
changing either system:

```bash
PYTHONPATH=. .venv/bin/python -m scripts.reconcile_document_storage
PYTHONPATH=. .venv/bin/python -m scripts.reconcile_document_storage --list-orphans
```

Do not delete reported orphans automatically. Investigate each key against a
database backup and audit records first. Repeat the same process in production
with the production bucket confirmation only during an approved maintenance
window.

## Recovery exercises

Run these exercises in development before production enablement and at least
quarterly afterward:

1. Restore a database backup into an isolated environment without changing S3.
2. Point the isolated API at a read-only copy or tightly scoped restore-test
   bucket and run reconciliation.
3. Download one invoice, report, and lab artifact by stored file ID and compare
   SHA-256 checksums with database metadata.
4. Queue a resend and verify it references the same artifact ID/version and does
   not create an object.
5. Simulate SMTP failure, verify bounded retry/backoff, then restore SMTP and
   confirm the queued delivery succeeds once.
6. Verify a legal-hold document cannot be deactivated and a permanent document
   deletion is metadata-only.
7. Record recovery time, missing-object count, checksum failures, and corrective
   actions in the incident log.

S3 versioning protects overwritten/deleted object versions, but it is not a
database backup. Database and object recovery must be tested together because
delivery rows reference exact file IDs and versions.
