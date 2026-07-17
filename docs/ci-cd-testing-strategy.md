# CI/CD Testing Strategy

Use CI/CD as a release gate, not only as automation. Production deploy should happen only after the correct checks pass.

## Recommended Flow

```text
Developer branch -> Pull request -> CI -> Merge to main -> CI on main -> CD to EC2
```

Do not deploy directly from a local machine for normal releases. Use GitHub Actions so every production deploy has the same repeatable process.

## Current Pipeline

This project has:

| Workflow | File | Purpose |
| --- | --- | --- |
| CI | `.github/workflows/ci.yml` | Runs frontend checks, backend unit/integration/API tests, backend E2E tests, and Docker builds |
| CD | `.github/workflows/deploy-ec2.yml` | Deploys `main` to EC2 only after CI succeeds |

## Test Levels

### 1. Static Checks

Purpose: catch code quality and syntax issues early.

Current backend command:

```bash
ruff check backend/app backend/tests backend/e2e
```

Recommended future additions:

```bash
npm run typecheck
```

Add this only after a `typecheck` script exists in `package.json`.

### 2. Unit Tests

Purpose: test small functions and business logic without external services.

Frontend:

```bash
npm test
```

Backend:

```bash
pytest backend/tests -q
```

Current backend tests use SQLite test fixtures, so they are fast enough for every pull request.

### 3. Integration Tests

Purpose: test real service wiring such as FastAPI routes, database sessions, auth, reports, billing, and module permissions.

Current backend API tests behave like lightweight integration tests because
they use FastAPI `TestClient`, dependency wiring, and a SQLModel test database.
They remain in `backend/tests` and run on every pull request.

### 4. Backend End-to-End Tests

Purpose: prove critical workflows work through a live Uvicorn process, Alembic
migrations, authentication middleware, RBAC, and PostgreSQL.

Current command:

```bash
bash backend/scripts/run_backend_e2e.sh
```

The suite is stored in `backend/e2e` and is marked `e2e`. It covers:

- health, login, logout, and session revocation
- tenant onboarding, tenant-admin access, granular permissions, and isolation
- subscription-plan module entitlements and live plan upgrades
- patient, appointment, queue, consultation, invoice, payment, and audit flow
- patient membership purchase, activation, benefit application, and usage
- advanced billing with partial payments, payment guardrails, and refunds
- lab catalog, orders, samples, results, billing, and payment
- pharmacy purchase, stock, dispensing, billing, and payment
- home-care service, booking, visit, billing, and payment
- inpatient admission, running charges, discharge, billing, and payment
- physiotherapy equipment, case, session, billing, and payment
- persisted backend errors, resolution status, and read/manage permissions

The runner only accepts a database name ending in `_e2e`, resets that
database's `public` schema, applies Alembic migrations, starts Uvicorn, waits
for health, runs real HTTP tests, and cleans up the server.

Redis, workers, email, and external APIs are intentionally outside the first
backend E2E scope. Those integrations keep their focused integration tests.

### 5. Docker Build Test

Purpose: prove production containers can build before deployment.

Current check:

```bash
docker compose config --quiet
```

Recommended stronger check before production:

```bash
docker compose build
```

This is slower but catches missing production dependencies.

### 6. Frontend Browser End-to-End Tests

The frontend keeps Vitest for unit/component tests and uses Playwright for
browser workflows against a real Next.js server, FastAPI process, and isolated
PostgreSQL database. The safe runner accepts only databases ending in
`_e2e`, applies Alembic migrations, starts both servers, and cleans them up.

```bash
cd frontend
npm run test:e2e                 # Chromium critical suite
npm run test:e2e:extended        # Chromium extended suite
npm run test:e2e:cross-browser   # Critical Chromium/Firefox/WebKit suite
npm run test:e2e:ui              # Local Playwright UI mode
```

CI uploads Playwright reports and traces only when a test fails, and the dev
deployment job depends on the full frontend E2E job.

### 7. Smoke Test After Deploy

Purpose: confirm the deployed EC2 app is alive.

Recommended checks:

```bash
curl -f http://YOUR_EC2_PUBLIC_IP:8080/health
curl -f http://YOUR_EC2_PUBLIC_IP:8080/api/v1/health
```

For production with a domain:

```bash
curl -f https://api.yourdomain.com/health
curl -f https://api.yourdomain.com/api/v1/health
```

## Best Practice Gates

Use this rule:

```text
Pull request: lint + unit + integration + API + backend E2E + frontend build + critical frontend Chromium E2E
Main branch: same CI checks + extended frontend Chromium E2E
Nightly/manual: critical cross-browser frontend E2E
Deploy: only after main CI succeeds, including frontend E2E
After deploy: smoke test
```

## Environment Strategy

Use separate environment values:

| Environment | Purpose | `.env` location |
| --- | --- | --- |
| local | developer machine | local only |
| CI | GitHub Actions test values | workflow env/secrets |
| staging | test EC2/server before production | server only |
| production | real users | server only |

Never commit real `.env` files.

## Recommended Branch Protection

In GitHub:

```text
Settings -> Branches -> Add branch protection rule
```

For `main`, enable:

- require pull request before merging
- require status checks to pass
- require `CI / Frontend`
- require `CI / Backend`
- require `CI / Backend E2E`
- require `CI / Docker Images`
- block force pushes

This prevents code from reaching production without passing CI.

## Handling Bugs Safely

When a bug is found:

1. Create a bugfix branch.
2. Add or update a failing test that reproduces the bug.
3. Fix the bug.
4. Confirm CI passes.
5. Merge to `main`.
6. Let CD deploy automatically.
7. Confirm health checks and important user flows.

## Future Improvements

Recommended when the app becomes more production-critical:

- add Redis/worker E2E only for workflows where process-boundary behavior is critical
- add deployment smoke test in `deploy-ec2.yml`
- add staging deployment before production
- add database backup before each production deploy
- add rollback command or image tag based deployment
