# Database Connection And Data

## Purpose

This document covers database connections, SQLAlchemy sessions, Alembic migrations, tenant/branch data rules, dump/restore references, and schema change workflow.

## Database Technology

- PostgreSQL is the production database.
- SQLAlchemy maps Python models to tables.
- Alembic manages migrations.
- PgBouncer can pool runtime database connections.

## Important Environment Variables

- `MEDIZINHUB_DATABASE_URL`: runtime application database URL.
- `MEDIZINHUB_MIGRATION_DATABASE_URL`: direct migration/maintenance database URL.
- `POSTGRES_USER`: Docker PostgreSQL user.
- `POSTGRES_PASSWORD`: Docker PostgreSQL password.
- `POSTGRES_DB`: Docker PostgreSQL database.

Use direct PostgreSQL URLs for migrations, dumps, and restores. Do not use PgBouncer transaction pooling for migration or restore jobs.

## Backend Session Flow

1. FastAPI route receives request.
2. Database dependency opens SQLAlchemy session.
3. Route/service uses the session.
4. Service commits or route transaction handling commits where configured.
5. Session closes after request.
6. Errors roll back uncommitted work.

## Tenancy Rules

- Tenant-owned tables need `tenant_id`.
- Branch-scoped tables need `branch_id`.
- Queries must filter tenant data before applying user filters.
- Platform cross-tenant queries must be explicit.
- Branch-assigned users must not read or mutate other branches.

## Migration Workflow

```bash
cd backend
source .venv/bin/activate
alembic revision --autogenerate -m "short_description"
alembic upgrade head
```

Before committing:

- Review generated migration.
- Confirm indexes and constraints.
- Confirm downgrade or document why downgrade is unsafe.
- Run backend tests.

## Schema Change Checklist

1. Confirm owning module.
2. Update model.
3. Generate migration.
4. Add tenant/branch fields if needed.
5. Add indexes for filters and joins.
6. Update services.
7. Update API response contracts.
8. Update frontend types and UI.
9. Update tests.
10. Update docs.

## PostgreSQL Dump And Restore

The full operational runbook is in [Operations Runbook](operations-runbook.md).

Quick custom-format dump:

```bash
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -Fc \
  "$POSTGRES_DB" \
  > medizinhub_$(date +%Y%m%d_%H%M%S).dump
```

Quick restore check:

```bash
createdb medizinhub_restore_check
pg_restore \
  --dbname medizinhub_restore_check \
  --clean \
  --if-exists \
  medizinhub_YYYYMMDD_HHMMSS.dump
```

Never store dumps in git.

## Common Database Problems

Missing column:

```bash
cd backend
source .venv/bin/activate
alembic current
alembic heads
alembic upgrade head
```

Wrong tenant data:

1. Check `tenant_id` filters.
2. Check `X-Tenant-ID`.
3. Check platform vs tenant route.
4. Check branch scope.

Connection pressure:

1. Check PgBouncer pool.
2. Check backend worker count.
3. Check slow queries.
4. Add indexes for hot filters.
