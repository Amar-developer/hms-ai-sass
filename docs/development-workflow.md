# Development Workflow

## Purpose

This guide is the source of truth for local setup, daily development, module implementation, testing, source control, and release preparation.

## Prerequisites

- Node.js `>=24 <25`
- npm `>=10`
- Python `>=3.10`
- Docker and Docker Compose
- PostgreSQL if running without Docker
- Git

## Local Setup With Docker

1. Copy environment file:

```bash
cp .env.example .env
```

2. Start local stack:

```bash
docker compose -f docker-compose.local.yml up --build
```

3. Open:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8080/api/v1/health`

4. Stop stack:

```bash
docker compose -f docker-compose.local.yml down
```

## Local Setup Without Docker

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Set frontend API URL if needed:

```bash
NEXT_PUBLIC_MEDIZINHUB_API_URL=http://127.0.0.1:8000/api/v1
```

## Daily Workflow

1. Pull latest changes.
2. Install changed dependencies.
3. Run migrations if backend schema changed.
4. Start backend and frontend.
5. Make a small scoped change.
6. Add or update tests.
7. Run focused tests.
8. Run quality gate before pushing.
9. Update docs when behavior, setup, APIs, permissions, deployment, or security rules change.

## Module Development Steps

### 1. Define Scope

Document:

- User role.
- Workflow entry point.
- Data owned by the module.
- Permissions required.
- Tenant and branch behavior.
- Billing, notification, file, or audit side effects.

### 2. Backend

1. Add models or schema changes.
2. Generate Alembic migration.
3. Add service methods.
4. Add API routes.
5. Add permission keys.
6. Add audit events for sensitive mutations.
7. Add tests.
8. Update `api-permission-matrix.md`.

### 3. Frontend

1. Add route under `frontend/app/(shell)/(app)`.
2. Add feature workspace under `frontend/features/<module>`.
3. Add API helpers under `frontend/features/<module>/api`.
4. Use shared shell navigation and breadcrumbs.
5. Use shared UI components for tables, filters, modals, forms, badges, pagination, and loading states.
6. Add Vitest tests for helpers and component behavior.
7. Add Playwright test for critical user flow.

### 4. Data and Permissions

Every module must answer:

- Which tenant owns the data?
- Is the data branch-scoped?
- Which roles can read?
- Which roles can create?
- Which roles can edit or sign?
- Which actions must be audited?
- Which actions trigger notifications?
- Which actions create billable records?

## Routing Rules

- Top-level authenticated routes live under `frontend/app/(shell)/(app)`.
- Feature UI lives under `frontend/features`.
- Create route segment format: `new-<entity>`.
- Edit route segment format: `edit-<entity>`.
- Breadcrumb labels are derived from route segments where possible.
- OPD consultation route is `/opd/consultation`; do not link new UI to bare `/opd` for the consultation tab.

## Database Rules

- Every schema change requires Alembic migration.
- Migrations must be reviewed before commit.
- New tenant-owned tables need `tenant_id`.
- Branch-scoped tables need `branch_id`.
- Add indexes for common list filters and foreign keys.
- Avoid destructive data migrations without a rollback note.

Commands:

```bash
cd backend
source .venv/bin/activate
alembic revision --autogenerate -m "short_description"
alembic upgrade head
```

## Testing Commands

### Backend

```bash
cd backend
source .venv/bin/activate
ruff check app tests e2e scripts
pytest tests -q -m "unit and not e2e"  # fast PR-style backend gate
pytest tests -q                       # full develop/main backend gate
```

### Frontend

```bash
cd frontend
npm test
npm run typecheck
npm run build
```

### Frontend E2E

```bash
cd frontend
npm run test:e2e
```

### Full Frontend Quality

```bash
cd frontend
npm run quality:frontend
```

### Full Backend Quality From Frontend Script

```bash
cd frontend
npm run quality:backend:fast
npm run quality:backend:full
```

## CI/CD Pipeline

The project uses local quality scripts plus GitHub Actions-style CI gates. A fresher should understand the pipeline in this order:

1. Developer writes code locally.
2. Developer runs focused tests for the changed area.
3. Developer runs the local quality gate before push.
4. Git hooks run the automatic pre-push checks when installed.
5. Pull request CI runs backend lint, Alembic migration validation, fast backend unit tests, frontend tests, typecheck, build, and Docker validation.
6. Protected branch CI on `develop` and `main` runs the full backend suite and backend E2E.
7. Staging deployment builds Docker images, applies migrations, starts the compose stack, and runs smoke checks.
8. Production deployment repeats the same release gate, then monitors logs and health after release.

### One-Time Hook Setup

```bash
cd frontend
npm run hooks:install
```

### Local Automatic CI Gate

Run from the repo root:

```bash
bash scripts/verify_all.sh
```

Fast mode for quick iteration:

```bash
bash scripts/verify_all.sh --fast
```

Include frontend Playwright E2E:

```bash
bash scripts/verify_all.sh --frontend-e2e
```

### CI Checks By Layer

| Layer | Command | Purpose |
| --- | --- | --- |
| Backend lint | `ruff check backend/app backend/tests backend/e2e backend/scripts` | Python style and obvious code issues |
| Backend fast PR gate | `pytest backend/tests -q -m "unit and not e2e"` | Fast business rules, architecture, API docs, and static-like backend checks |
| Backend full protected-branch gate | `pytest backend/tests -q` | Unit, integration, API, repository, permission, isolation, and workflow coverage |
| Backend E2E protected-branch gate | `bash backend/scripts/run_backend_e2e.sh` | Live API workflow coverage |
| Frontend unit | `cd frontend && npm test` | React, hooks, helpers, API mapping |
| Frontend typecheck | `cd frontend && npm run typecheck` | TypeScript contract safety |
| Frontend build | `cd frontend && npm run build` | Production build validation |
| Frontend E2E manual | `cd frontend && npm run test:e2e` | Critical browser workflows |

### CI/CD Rules

- A pull request should not merge when the automatic CI gate fails.
- Pull requests run the fast backend pytest gate. `develop` and `main` pushes run the full backend suite and backend E2E.
- Backend routes must stay documented; `backend/tests/test_api_docs.py` compares live FastAPI routes with docs.
- Migrations must apply cleanly before a staging deployment.
- Staging must pass smoke tests before production.
- Production deploys must record release evidence: commit SHA, migration head, quality commands, smoke result, and rollback plan.

## Test Coverage Expectations

Backend:

- Permission allow and deny paths.
- Tenant isolation.
- Branch isolation.
- Validation failures.
- Workflow transitions.
- Billing calculations.
- File access rules.
- Notification enqueue behavior.

Frontend:

- Route parsing.
- API mapping.
- Helper logic.
- Critical forms.
- Shared table/filter/sort/pagination behavior.
- Access-dependent UI.
- Responsive critical flows where applicable.

E2E:

- Login.
- Tenant and branch context.
- Patient registration.
- OPD appointment and consultation.
- Billing and payment.
- Lab and pharmacy conversion.
- Home care or physiotherapy if changed.

## Source Control Rules

- Keep commits scoped.
- Do not commit secrets or local generated artifacts.
- Do not mix unrelated refactors with feature work.
- Include migrations with backend schema changes.
- Include docs updates with behavior or operational changes.
- Use clear commit messages:

```text
area: short action-oriented summary
```

Examples:

```text
opd: route consultation tab through explicit url
billing: enforce credit note permission checks
docs: consolidate deployment runbooks
```

## Pull Request Checklist

- Scope is clear.
- UI screenshots or notes are included for visible changes.
- Permission impact is listed.
- Migration impact is listed.
- Tests run are listed.
- Documentation updates are included.
- Rollback risk is noted for production-sensitive changes.

## Release Preparation

1. Confirm version and branch.
2. Run frontend quality.
3. Run backend quality.
4. Confirm migrations apply cleanly.
5. Build Docker images.
6. Deploy to staging.
7. Run release acceptance smoke tests.
8. Record release evidence.
9. Deploy production.
10. Monitor logs and metrics.

## Versioning

- Use semantic versioning for production releases.
- Runtime version identity should be visible in platform/admin diagnostics where available.
- Release notes should mention migrations, feature flags, operational changes, and rollback notes.

## Common Issues

### Backend is not reachable

1. Check backend process.
2. Open `/api/v1/health`.
3. Check `NEXT_PUBLIC_MEDIZINHUB_API_URL`.
4. Check CORS origins.
5. Check Docker port mapping.

### Frontend dependency issues

```bash
cd frontend
npm install
```

If local dependencies are corrupted, remove `node_modules` manually and reinstall.

### Python environment issues

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

### Database migration mismatch

```bash
cd backend
source .venv/bin/activate
alembic current
alembic heads
alembic upgrade head
```

### Permission appears wrong

1. Check frontend permission gating.
2. Check role permissions in backend.
3. Check tenant and branch context.
4. Check module entitlement.
5. Check `api-permission-matrix.md`.

## Documentation Update Rule

Update documentation in the same change when you modify:

- Setup commands.
- Docker or environment variables.
- API routes or permissions.
- Schema or migrations.
- Production deployment process.
- Security, audit, file, backup, or incident behavior.
- Module user workflows.
