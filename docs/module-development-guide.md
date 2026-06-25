# Module Development Guide

This guide defines how the MedizinHub HMS team should add or enhance modules without breaking tenancy, RBAC, subscription entitlement, audit, compliance, or frontend consistency.

## Before Starting A Module

Read these documents first:

- `docs/developer-setup.md`: local setup for macOS, Windows, and Linux.
- `docs/developer-handover-pack.md`: current project status, run commands, fresh super admin setup, and code map.
- `docs/development-master-prompt.md`: engineering rules that every module must follow.
- `docs/backend-architecture-spec.md`: backend architecture, tenant isolation, RBAC, audit, and integration boundaries.
- `docs/api-permission-matrix.md`: API permission and entitlement expectations.
- `docs/module-catalog.md`: planned module behavior and feature scope.
- `docs/production-readiness-plan.md`: automated tests, deployment, compliance, and QA gates.

## Required Backend Structure

For a new module named `example`, use this backend layout:

```text
backend/app/modules/example/
  __init__.py
  models.py
  schemas.py
  service.py

backend/app/api/v1/example.py
backend/tests/test_example.py
backend/alembic/versions/<revision>_example_module.py
```

Use the existing modules as references:

- Simple tenant-scoped module: `backend/app/modules/patients`
- Workflow module: `backend/app/modules/appointments`
- Financial workflow: `backend/app/modules/billing`
- Inventory workflow: `backend/app/modules/pharmacy`
- Platform/admin workflow: `backend/app/modules/tenants`

## Backend Rules

Every module must follow these rules:

- Models live in `backend/app/modules/<module>/models.py`.
- Request/response contracts live in `schemas.py`.
- Business rules live in `service.py`; avoid putting complex rules directly in API route handlers.
- API routes live in `backend/app/api/v1/<module>.py`.
- Register the router in `backend/app/api/router.py`.
- Add the module entry to `backend/app/modules/manifest.py` with category, entitlement key, dependencies, permissions, settings, routes, and reports.
- Add new permissions to `backend/app/modules/identity/permissions.py` when needed.
- Add or update the API permission matrix in `docs/api-permission-matrix.md`.
- Add an Alembic migration for every database schema change.
- Seed only useful demo data in `backend/scripts/seed_demo.py`; keep production seed separate from demo assumptions.

## Required Data Controls

Every business table should include, where applicable:

- `tenant_id`
- `branch_id` when branch-scoped
- `created_at`
- `updated_at`
- `created_by_user_id`
- `updated_by_user_id`
- status or active flag

Every API must enforce:

- Authentication.
- Tenant isolation.
- Branch scope where applicable.
- Module entitlement through the active subscription plan.
- Granular permission check.
- Audit event for sensitive read/write/export/status-change workflows.
- Clear error response for disabled module, missing permission, invalid branch, or expired subscription.

Super admin behavior:

- Super admin belongs to the primary tenant `MedizinHub HMS`.
- Super admin can access platform workflows and all tenant records where platform permissions allow it.
- Super admin role must not be copied to customer tenants.

Tenant admin behavior:

- Tenant admin can manage only their own tenant scope.
- Tenant admin must not receive `platform.*` permissions.
- Tenant admin can manage local users, roles, departments, branches, and settings only according to assigned permissions and subscription entitlements.

## Required Frontend Structure

For a new frontend module named `Example`, use this layout:

```text
features/example/Example.tsx
lib/exampleData.ts            # only if shared data mapping/helpers are needed
```

Then wire it into:

- `lib/navigation.ts` for navigation metadata.
- `features/shell/AppShell.tsx` for route rendering.
- `lib/moduleAccess.ts` if the module is entitlement or role controlled in the UI.
- `features/shell/useAppController.ts` only if the module needs shared live state.

Frontend rules:

- Use `apiFetch` from `lib/api.ts`; do not call external systems directly.
- Do not hardcode tenant access. Use the logged-in session and backend-scoped APIs.
- Do not show other tenant data to tenant admins.
- Keep screens tablet-friendly and mobile-responsive.
- Row listing pages need search, filters where useful, pagination, and responsive card fallback.
- Create/edit pages should be separate when records are complex.
- After successful create/update, redirect to the listing page, scroll/focus top, and show latest record first.
- Use existing shared UI components from `components/ui.tsx`.
- Add loading, empty, error, and success states.

## Testing Requirements

Every backend module must add tests in `backend/tests/test_<module>.py`.

Minimum backend tests:

- Create/read/update/delete or status-change happy path.
- Tenant isolation: tenant A cannot access tenant B records.
- Branch isolation: branch-scoped users cannot access other branches.
- RBAC: users without permission are rejected.
- Entitlement: disabled module is rejected.
- Audit: sensitive view/write/export/action creates audit log.
- Validation: bad IDs, invalid branch, invalid status, duplicate records, and missing required fields.
- Migration coverage: new tables/columns migrate cleanly with `alembic upgrade head`.

Minimum frontend checks:

- TypeScript check passes.
- Main screen renders with loaded backend data.
- Create/edit/cancel flows work.
- Empty/error states are usable.
- Mobile/tablet layout does not overflow.

Recommended commands:

```bash
cd /Users/balaji/dev/medizinhub_hms/backend
.venv/bin/ruff check app tests
.venv/bin/pytest
```

```bash
cd /Users/balaji/dev/medizinhub_hms
npm test
npm run build
```

If local Next.js build has a machine-specific SWC issue, at minimum run:

```bash
/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit
```

## Module Completion Checklist

Before a module is considered complete:

- Backend models, schemas, service, API routes, and router registration are done.
- Alembic migration exists and runs from a clean PostgreSQL database.
- Module registry entry exists.
- Permissions and API permission matrix are updated.
- Subscription entitlement is enforced at API level.
- Tenant and branch isolation are tested.
- Audit logging is added and tested for sensitive workflows.
- Keep customer demo data separate from the fresh SaaS setup path.
- Frontend screen is connected to backend, not mock-only.
- Listing page has search/filter/pagination where appropriate.
- Create/edit pages redirect back to listing after success.
- Tablet/mobile layout is checked.
- Documentation is updated.
- Tests pass.

## Pull Request Expectations

Each PR should include:

- What module/workflow changed.
- Database migration notes.
- New permissions and entitlements.
- Tenant/branch/RBAC/audit impact.
- Tests added and commands run.
- Screenshots for frontend changes on desktop and tablet/mobile where practical.
- Any known limitations or follow-up tasks.
