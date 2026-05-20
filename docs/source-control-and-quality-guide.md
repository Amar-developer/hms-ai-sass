# Source Control and Quality Guide

This guide defines the MedizinHub HMS development rules for Git, branches, commits, tests, migrations, and pull requests.

## Branch Rules

Do not commit or push directly to protected branches:

- `main`
- `develop`
- `production`
- `release`

Use feature branches:

```bash
git checkout -b feature/patient-duplicate-dob
git checkout -b fix/queue-doctor-name
git checkout -b chore/add-ci-quality-gate
```

Recommended branch prefixes:

- `feature/` for new features
- `fix/` for bugs
- `docs/` for documentation
- `refactor/` for internal code changes
- `test/` for test-only changes
- `chore/` for tooling and maintenance

## Commit Message Rule

Use Conventional Commits:

```text
feat(appointments): add patient duplicate DOB rule
fix(queue): show doctor full name in token queue
docs(handover): add developer quality checklist
test(patients): cover shared family mobile number
```

Allowed types:

- `feat`
- `fix`
- `docs`
- `test`
- `refactor`
- `chore`
- `ci`
- `perf`
- `style`
- `build`
- `revert`

## Install Local Git Hooks

Run once after cloning:

```bash
npm run hooks:install
```

Installed hooks:

- `pre-commit`: blocks direct commits to protected branches and runs fast checks for touched files.
- `commit-msg`: enforces Conventional Commit messages.
- `pre-push`: runs backend lint, backend tests, frontend tests, and frontend build.
- `post-commit`: reminds developers to run full quality checks before push.

## Required Local Verification

Before opening a pull request:

```bash
backend/.venv/bin/ruff check backend/app backend/tests
backend/.venv/bin/pytest backend/tests -q
npm test
npm run build
```

Or run the combined command:

```bash
npm run quality
```

## Ignore And Environment Rules

Generated files, caches, uploads, and local secrets must stay out of Git:

```text
.next/
.next-permission-backup/
__pycache__/
.pytest_cache/
.ruff_cache/
backend/uploads/
.env
.env.*
```

`.env.example` is intentionally tracked as the safe developer template. Add new configuration keys there without real credentials. Real SMTP passwords, app passwords, database URLs with private credentials, and local overrides belong only in `.env`.

## Database and Migration Rules

When adding or changing a database column/table:

1. Update the SQLModel model in `backend/app/modules/<module>/models.py`.
2. Update request/response schemas in `backend/app/modules/<module>/schemas.py`.
3. Add an Alembic migration in `backend/alembic/versions`.
4. Verify PostgreSQL migration:

```bash
cd backend
MEDIZINHUB_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms" .venv/bin/alembic upgrade head
```

5. Update seed data when demo/customer presentation data needs the new field.
6. Add or update backend tests.

Never manually alter production tables without an Alembic migration.

## Healthcare Module Change Checklist

For every module change, confirm:

- Tenant isolation is enforced.
- Branch scope is enforced where applicable.
- RBAC permission is checked.
- SaaS module entitlement is checked.
- Audit event exists for sensitive actions.
- Patient/clinical/revenue impact is reviewed.
- No UI screen displays internal IDs when a human name exists.
- Create/update success redirects to listing page where applicable.
- Latest created/updated record appears first in management listings.
- Search, pagination, empty, loading, and error states still work.

## Pull Request Rules

Every pull request must include:

- Clear summary.
- Screenshots for UI changes.
- Migration notes for DB changes.
- Test command outputs.
- Risk notes for patient, clinical, billing, subscription, audit, or compliance behavior.

Recommended GitHub branch protection for `main` and `develop`:

- Require pull request before merge.
- Require at least one approval.
- Dismiss stale approvals on new commits.
- Require status checks to pass.
- Require `Backend tests and lint`.
- Require `Frontend tests and build`.
- Require branch to be up to date before merge.
- Restrict who can push directly.
- Disallow force pushes.
- Disallow deletions.

## Emergency Fix Process

For urgent production fixes:

1. Create `fix/<short-description>`.
2. Keep the patch small.
3. Add a regression test.
4. Run full quality checks.
5. Open PR with emergency context.
6. Merge only after required checks pass.
