# Production Backup and Restore Runbook

This runbook covers the PostgreSQL recovery point created before every
production deployment and the isolated restore drill used to prove that the
backup can be recovered. It never restores into the live application database.

## Required controls

- Store backups outside the application checkout on an encrypted, access-
  controlled volume or transfer them to restricted object storage.
- Load `MEDIZINHUB_BACKUP_PASSPHRASE` from the deployment secret manager. It
  must contain at least 16 characters and must never be passed as a command-line
  argument, logged, or stored in the application `.env` file.
- Grant backup access only to production operations staff.
- Enable versioning and lifecycle retention independently for the S3 document
  bucket. A database backup does not contain invoice PDFs or uploaded files.
- Never use a production application database name as a restore target. The
  verification script only accepts names ending in `_restore_verify` and drops
  only that exact database when it exits.

## Create an encrypted backup

Run from the repository root on the production host:

```bash
export MEDIZINHUB_BACKUP_PASSPHRASE='value-loaded-from-secret-manager'
bash scripts/backup_postgres.sh \
  --compose-file docker-compose.yml \
  --env-file .env \
  --output-dir /var/backups/medizinhub \
  --application-commit "$(git rev-parse HEAD)"
unset MEDIZINHUB_BACKUP_PASSPHRASE
```

The command streams `pg_dump` directly through AES-256 encryption; it does not
write a plaintext dump. Success creates:

- `*.dump.enc`: encrypted PostgreSQL custom archive;
- `*.dump.enc.sha256`: integrity checksum;
- `*.dump.enc.manifest.json`: creation time, application commit, and format.

The command decrypts the completed file into `pg_restore --list` before
reporting success. Retention and off-host transfer belong to infrastructure
policy; this script intentionally never deletes older backups.

## Verify a restore

Run monthly and before a high-risk migration on an isolated operations or
staging database host. The PostgreSQL container needs enough free storage for a
second temporary database.

```bash
export MEDIZINHUB_BACKUP_PASSPHRASE='value-loaded-from-secret-manager'
bash scripts/verify_postgres_restore.sh \
  --backup /var/backups/medizinhub/medizinhub-postgres-YYYYMMDDTHHMMSSZ.dump.enc \
  --compose-file docker-compose.yml \
  --env-file .env
unset MEDIZINHUB_BACKUP_PASSPHRASE
```

The drill verifies the checksum when present, restores with `--exit-on-error`,
checks that the public schema and Alembic revision exist, then drops the exact
temporary database. Record the backup timestamp, result, duration, operator,
and ticket/incident reference. A successful script implementation is not a
substitute for recording a real drill.

## Recovery objectives

- With one successful backup per day, the maximum database recovery-point gap
  is 24 hours. Configure managed PostgreSQL point-in-time recovery when a
  smaller RPO is required.
- Measure restore duration during every drill before committing to an RTO.
  Include database restore, object-storage validation, migrations, application
  health checks, and business workflow verification.

## Release rollback

The production workflow records the currently deployed Git commit in the
pre-deploy backup manifest. If a release fails:

1. Keep the failed release and its logs available for investigation.
2. Prefer a forward application fix when the migrated schema is compatible.
3. Redeploy the recorded prior commit only after confirming that its code can
   run against the current schema.
4. Restore the database only for confirmed data/schema corruption, during an
   approved maintenance window. Do not run an automatic Alembic downgrade.
5. Validate `/health`, `/api/v1/health`, `/api/v1/readiness`, login, patient
   lookup, appointment booking, billing, queues, workers, and document access.

## Deployment secrets

The production GitHub environment must define:

- `PRODUCTION_BACKUP_PASSPHRASE`: encryption secret loaded only for the SSH
  deployment step;
- `PRODUCTION_BACKUP_DIR`: absolute off-checkout directory on the EC2 host.

The deployment fails closed when either setting is absent or when backup/archive
verification fails. Test the scripts and secret permissions in staging before
the first production deployment. `.github/workflows/production-backup.yml`
runs the same verified backup every day at 20:30 UTC (02:00 IST) and can also be
started manually. Configure GitHub Actions failure notifications for the
production operations team.
