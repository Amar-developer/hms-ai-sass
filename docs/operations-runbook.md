# Operations Runbook

## Purpose

This runbook covers staging and production operations for MedizinHub HMS: deployment, environment checks, backup and restore, logging, document storage, performance, scaling, release acceptance, rollback, and incident response.

## Environments

| Environment | Compose file | Use |
| --- | --- | --- |
| Local | `docker-compose.local.yml` | Developer workstation |
| Staging | `docker-compose.staging.yml` | Release verification and production rehearsal |
| Production-like | `docker-compose.yml` | Production or production-style Docker deployment |

## Required Production Controls

- HTTPS for frontend and backend public access.
- Secure auth cookies in production.
- HTTPS-only CORS origins.
- PostgreSQL database URL, not SQLite.
- Migration database URL points to direct PostgreSQL, not PgBouncer transaction pool.
- S3-compatible document storage for production documents.
- Encrypted database backups.
- Tested restore process.
- Central log access.
- Release rollback plan.

## Deployment Checklist

1. Confirm branch and version.
2. Confirm `.env` secrets are present and not committed.
3. Run quality gates.
4. Confirm migrations.
5. Build images.
6. Start services.
7. Run health checks.
8. Run smoke tests.
9. Check logs for errors.
10. Record release evidence.

## CI/CD Deployment Pipeline

The recommended deployment pipeline has four gates.

### Gate 1: Pull Request

1. Backend lint.
2. Backend unit and integration tests.
3. API documentation route coverage test.
4. Frontend unit tests.
5. Frontend TypeScript check.
6. Frontend production build.

### Gate 2: Merge To Protected Branch

1. Repeat automatic CI checks.
2. Build backend image.
3. Build frontend image.
4. Tag images with commit SHA or release version.
5. Keep migration artifacts with the release evidence.

### Gate 3: Staging

1. Deploy with `docker-compose.staging.yml`.
2. Apply migrations.
3. Run runtime readiness scripts.
4. Run smoke tests.
5. Review backend, frontend, database, worker, and provider-delivery logs.

### Gate 4: Production

1. Confirm staging evidence.
2. Confirm a recent restorable backup exists.
3. Deploy production compose stack or production images.
4. Apply migrations.
5. Run health checks.
6. Run smoke tests.
7. Monitor logs for at least 15 minutes.

Do not skip staging for migrations, billing changes, permissions, authentication, file storage, notifications, tenant isolation, or branch isolation changes.

## Local Docker

```bash
docker compose -f docker-compose.local.yml up --build
```

Stop:

```bash
docker compose -f docker-compose.local.yml down
```

## Staging Docker

```bash
docker compose -f docker-compose.staging.yml up -d --build
```

Inspect:

```bash
docker compose -f docker-compose.staging.yml ps
docker compose -f docker-compose.staging.yml logs backend --since 15m --no-color
docker compose -f docker-compose.staging.yml logs frontend --since 15m --no-color
```

## Production Docker

```bash
docker compose up -d --build
```

Inspect:

```bash
docker compose ps
docker compose logs backend --since 15m --no-color
docker compose logs frontend --since 15m --no-color
docker compose logs postgres --since 15m --no-color
```

## EC2 Deployment Outline

1. Create EC2 instance.
2. Open only required security group ports:
   - SSH from trusted IPs.
   - HTTP/HTTPS from public internet if serving directly.
   - Do not expose PostgreSQL publicly.
3. Install Docker and Docker Compose plugin.
4. Clone repository.
5. Create `.env`.
6. Build and start compose stack.
7. Configure domain and reverse proxy if used.
8. Validate health and smoke tests.

Useful commands:

```bash
ssh ubuntu@<server-ip>
git pull
docker compose up -d --build
docker compose ps
docker compose logs backend --since 15m --no-color
```

## Environment Variables To Verify

Backend:

- `MEDIZINHUB_DATABASE_URL`
- `MEDIZINHUB_MIGRATION_DATABASE_URL`
- `MEDIZINHUB_CORS_ORIGINS`
- auth secret settings
- storage backend settings
- S3 bucket and credentials when S3 is enabled
- notification provider credentials where enabled

Frontend:

- `NEXT_PUBLIC_MEDIZINHUB_API_URL`

Database:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

## Runtime Readiness

Run available readiness scripts before production release:

```bash
cd backend
source .venv/bin/activate
python scripts/verify_runtime_readiness.py
python scripts/verify_production_environment.py
```

When document storage is enabled:

```bash
cd backend
source .venv/bin/activate
python scripts/verify_document_storage.py
```

## Release Acceptance

Automated gate:

```bash
cd frontend
npm run quality:frontend
npm run quality:backend
```

Manual staging smoke:

1. Login.
2. Tenant switch or tenant context loads.
3. Dashboard loads.
4. Patient list loads.
5. Create or open a patient.
6. OPD appointments load.
7. OPD consultation route opens at `/opd/consultation`.
8. Billing list loads.
9. File upload or file download works if changed.
10. In-app notifications open.
11. Error logs are clean for the smoke period.

Release evidence:

- Git commit SHA.
- Version.
- Migration head.
- Quality commands run.
- Smoke test result.
- Known risks.
- Rollback command or rollback image.

## PostgreSQL Dump And Restore

Use this section for production backup, staging refresh, and safe prod-to-dev restore. A fresher should read this before touching database dumps.

### Required Controls

- Backups must be encrypted.
- Backups must include PostgreSQL data.
- File storage backup must be covered by S3 versioning, bucket replication, lifecycle, or documented storage backup process.
- Restore must be tested.
- Backup credentials must not be stored in git.
- Never store dumps in the repository.
- Never restore production data into an unapproved developer machine without masking or approval.

### Dump From Docker PostgreSQL

Plain SQL dump:

```bash
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  "$POSTGRES_DB" \
  > medizinhub_$(date +%Y%m%d_%H%M%S).sql
```

Custom-format dump, recommended for larger databases:

```bash
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -Fc \
  "$POSTGRES_DB" \
  > medizinhub_$(date +%Y%m%d_%H%M%S).dump
```

### Dump From A Direct PostgreSQL URL

```bash
pg_dump "$MEDIZINHUB_MIGRATION_DATABASE_URL" \
  -Fc \
  > medizinhub_$(date +%Y%m%d_%H%M%S).dump
```

Use the migration/direct database URL for maintenance tasks. Do not use PgBouncer transaction pooling for dump or restore jobs.

### Encrypt Dump

Use the team's approved encryption method. Example with GPG symmetric encryption:

```bash
gpg --symmetric --cipher-algo AES256 medizinhub_YYYYMMDD_HHMMSS.dump
```

After encryption, move only the encrypted file to backup storage.

### Restore Plain SQL Dump

Restore to a non-production database first:

```bash
createdb medizinhub_restore_check
psql medizinhub_restore_check < medizinhub_YYYYMMDD_HHMMSS.sql
```

### Restore Custom Dump

```bash
createdb medizinhub_restore_check
pg_restore \
  --dbname medizinhub_restore_check \
  --clean \
  --if-exists \
  medizinhub_YYYYMMDD_HHMMSS.dump
```

### Restore Into Docker PostgreSQL

```bash
docker compose exec -T postgres createdb -U "$POSTGRES_USER" medizinhub_restore_check
docker compose exec -T postgres pg_restore \
  -U "$POSTGRES_USER" \
  --dbname medizinhub_restore_check \
  --clean \
  --if-exists \
  < medizinhub_YYYYMMDD_HHMMSS.dump
```

### Restore Verification

1. Migration head.
2. Tenant count.
3. Patient count.
4. Invoice count.
5. Recent audit events.
6. Sample file metadata.
7. Application boots against restored database.

Useful verification queries:

```sql
select count(*) from tenants;
select count(*) from patients;
select count(*) from invoices;
select count(*) from audit_events;
```

Backend migration verification:

```bash
cd backend
source .venv/bin/activate
MEDIZINHUB_DATABASE_URL="<restore_database_url>" alembic current
```

### Prod To Dev Restore Safety

When restoring production data into development:

- Use a secure transfer channel.
- Redact or mask patient data if the environment is not approved for PHI.
- Do not point development services at production storage buckets.
- Do not enable real WhatsApp, SMS, or email delivery.
- Rotate credentials if a dump is mishandled.

### Backup Schedule

Minimum recommended schedule:

- Daily encrypted PostgreSQL dump.
- Weekly restore verification.
- Monthly full recovery drill including database and document storage.
- Fresh backup before every production migration, or explicit confirmation that the latest backup is recent and restorable.

## Document Storage Operations

Provision production storage with:

- Private bucket.
- Public access block enabled.
- Server-side encryption.
- Least-privilege IAM credentials.
- Lifecycle and retention policy.
- Backup or replication policy.

Verification levels:

1. Local: upload, download, delete or cleanup local test file.
2. Development S3: upload/download test object using development bucket.
3. Production: run verification script against production bucket before enabling user uploads.

Migration of existing local documents:

```bash
cd backend
source .venv/bin/activate
python scripts/migrate_documents_to_s3.py --dry-run
python scripts/migrate_documents_to_s3.py
```

Reconciliation:

```bash
cd backend
source .venv/bin/activate
python scripts/reconcile_document_storage.py
```

## Logging

Log types:

- Backend application logs.
- Frontend build/runtime logs.
- Client error logs from browser.
- Database logs.
- PgBouncer logs.
- Worker logs.
- Audit events.

Common commands:

```bash
docker compose logs backend --since 15m --no-color
docker compose logs frontend --since 15m --no-color
docker compose logs postgres --since 15m --no-color
docker compose logs pgbouncer --since 15m --no-color
```

Incident log workflow:

1. Identify timeframe.
2. Check frontend/client error first if user reports UI problem.
3. Check backend logs for request failure.
4. Check audit events for actor and action.
5. Check database logs for connection, lock, or query issues.
6. Check provider queues for WhatsApp, SMS, email, and file delivery failures.

## Performance Baseline

Check:

- API response percentiles.
- Database CPU and memory.
- Slow queries.
- PgBouncer pool saturation.
- Backend worker count and CPU.
- Frontend build and runtime errors.
- File storage latency for uploads and downloads.

Initial alert thresholds should be conservative:

- Health endpoint unavailable.
- API p95 above expected workflow tolerance.
- Database connection pool near saturation.
- Repeated 5xx errors.
- Failed notification delivery spike.
- Storage verification failure.

## Scaling

Primary scaling controls:

- Increase backend replicas.
- Tune worker processes.
- Use PgBouncer for connection pooling.
- Add database indexes for hot filters.
- Move documents to S3-compatible storage.
- Keep long-running provider calls off request path.
- Add async workers for delivery and scheduled jobs.

Capacity formula:

```text
required_backend_capacity =
  concurrent_users
  * average_requests_per_user_per_second
  * p95_request_cost
```

Safe load gate:

1. Run staging load check.
2. Verify API p95.
3. Verify database connections.
4. Verify CPU and memory.
5. Verify no error spike.
6. Verify business workflows still pass smoke tests.

## Rollback

Rollback options:

- Re-deploy previous image.
- Revert configuration change.
- Disable feature flag or tenant module.
- Apply database rollback only if safe and tested.
- Restore from backup only for data-loss scenarios.

Before rollback:

1. Capture logs.
2. Capture current commit and image.
3. Identify migration impact.
4. Confirm if new writes happened after deploy.
5. Choose least destructive rollback.

## Incident Response

1. Triage severity.
2. Stabilize service.
3. Preserve evidence.
4. Communicate status.
5. Mitigate.
6. Verify recovery.
7. Write incident note.
8. Add tests or runbook updates.

Severity examples:

- Sev 1: outage, data exposure, data loss, payment failure across tenants.
- Sev 2: major module unavailable, high error rate, provider outage with workaround.
- Sev 3: single workflow bug, isolated tenant issue, non-critical UI regression.

## Post-Deploy Monitoring

For at least 15 minutes after release:

```bash
docker compose ps
docker compose logs backend --since 15m --no-color
docker compose logs frontend --since 15m --no-color
```

Smoke:

- Login.
- Dashboard.
- Patient list.
- OPD.
- Billing.
- File access if storage changed.
- Notifications if communication changed.
