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
| CI | `.github/workflows/ci.yml` | Runs frontend tests/build, backend lint/tests, and Docker Compose validation |
| CD | `.github/workflows/deploy-ec2.yml` | Deploys `main` to EC2 only after CI succeeds |

## Test Levels

### 1. Static Checks

Purpose: catch code quality and syntax issues early.

Current backend command:

```bash
ruff check backend/app backend/tests
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

Current backend API tests already behave like lightweight integration tests because they use FastAPI `TestClient` and a real SQLModel test database.

Recommended next step:

```text
Mark tests that require real PostgreSQL/Redis with pytest markers.
Run those in a separate CI job with Docker service containers.
```

Example future commands:

```bash
pytest backend/tests -q -m "not external"
pytest backend/tests -q -m "integration"
```

### 4. Docker Build Test

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

### 5. Smoke Test After Deploy

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
Pull request: lint + unit tests + lightweight integration tests + frontend build
Main branch: same CI checks
Deploy: only after main CI succeeds
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
- require `CI / Docker Compose Config`
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

- add Playwright end-to-end tests for login, appointment booking, billing, reports
- add PostgreSQL/Redis integration test job in CI
- add `docker compose build` to CI
- add deployment smoke test in `deploy-ec2.yml`
- add staging deployment before production
- add database backup before each production deploy
- add rollback command or image tag based deployment
