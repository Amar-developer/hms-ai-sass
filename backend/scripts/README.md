# Backend Scripts Inventory

This folder contains backend-only operational helpers. Keep scripts here when they need backend imports, database models, storage adapters, or deployment-time checks.

## Runtime And Deployment

| Script | Use case | Used by |
| --- | --- | --- |
| `start_api.py` | Container entrypoint. Runs production env validation, Alembic migrations under a PostgreSQL advisory lock, runtime readiness checks, then execs Uvicorn. | `backend/Dockerfile`, `docker-compose.yml`, `docker-compose.staging.yml` |
| `verify_production_environment.py` | Fails startup/deploy when production environment settings are unsafe. | `start_api.py`, deployment workflow |
| `verify_runtime_readiness.py` | Verifies DB migration head and optional PostgreSQL telemetry extension. | `start_api.py`, local compose readiness |
| `verify_deployment.py` | Read-only deployed API/frontend smoke contract check. | GitHub deploy workflows |
| `load_test_api.py` | Small read-only API load gate for local/staging health baselines. | GitHub dev deploy workflow |
| `run_backend_e2e.sh` | Starts live backend E2E API suite against a suffix-protected `_e2e` database. | GitHub CI, local verification |

## Database And Demo Operations

| Script | Use case | Notes |
| --- | --- | --- |
| `reset_super_admin.py` | Repairs primary tenant, super admin, super admin role, tenant admin template role, and permissions. | Prompts for credentials interactively; non-interactive runs require explicit email/password. Production also requires `MEDIZINHUB_SUPER_ADMIN_CONFIRM=RESET_SUPER_ADMIN_PRODUCTION`. |
| `reset_demo_data.py` | Deletes all rows from the configured DB and recreates fresh SaaS bootstrap data only. | Requires `MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV`. Use only local/dev databases. |
| `seed_demo.py` | Creates rich demo clinic data for manual testing and demos. | Large but intentional; keep separate from reset logic. |

## Document Storage

| Script | Use case | Notes |
| --- | --- | --- |
| `verify_document_storage.py` | Read-only S3/local storage readiness checks, with optional explicit write probe. | Referenced by integration and operations docs. |
| `migrate_documents_to_s3.py` | Dry-run-first migration of legacy local file metadata/content to S3. | Requires configured S3 backend and bucket confirmation for execute mode. |
| `reconcile_document_storage.py` | Read-only reconciliation between file metadata, delivery rows, and S3 objects. | Can list orphan S3 objects. |
| `cleanup_document_test_objects.py` | Cleans only `phase4-probes/` S3 write-probe objects outside production. | Generated test-probe cleanup, not general bucket cleanup. |
| `validate_cloudformation_templates.py` | Offline structural validation of the document-storage CloudFormation template. | Requires PyYAML from backend dev dependencies. |

## Observability And Database Pooling

| Script | Use case | Notes |
| --- | --- | --- |
| `summarize_api_metrics.py` | Summarizes structured request logs into latency/error percentiles. | Complements in-memory metrics endpoint for deployment-wide logs. |
| `pgbouncer_admin.py` | Verifies PgBouncer config and samples pool contention through the admin console. | Operational tool for capacity diagnosis. |

## Audit Findings

- No tracked script was removed. The real scripts each map to a deployment, storage, demo, E2E, or observability use case.
- `backend/scripts/__pycache__/` is generated local clutter and should not be committed. It is already ignored by `.gitignore`.
- Stale cache file `seed_demo_new.cpython-311.pyc` may appear locally even though there is no `seed_demo_new.py` source file. Delete the cache directory with owner permissions when cleaning the workspace.
- Avoid adding one-off experimental scripts here. If a helper is temporary, keep it outside the repo or document its deletion date.
