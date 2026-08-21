# Frontend Architecture

## Purpose

This document explains the frontend folder structure, routing model, API handling, state ownership, UI patterns, and module development rules.

## Technology

- Next.js app router.
- React and TypeScript.
- Tailwind CSS.
- Lucide icons.
- Vitest for unit/component tests.
- Playwright for browser E2E tests.

## Folder Structure

```text
frontend/
  app/
    (shell)/
      (app)/                  Authenticated application routes
      login/                  Login route
    api/
      backend/                Local proxy to FastAPI backend
      backend-root/           Local proxy to backend root endpoints
    components/               Shared app-level components
    validations/              Shared validation helpers

  features/
    admin/                    Tenant admin and settings
    appointments/             Appointment booking and calendar
    auth/                     Login and password flows
    billing/                  Invoices, payments, settlements
    consulation/              Doctor consultation workspace
    dashboard/                Dashboard widgets
    doctors/                  Practitioner UI compatibility
    error-logs/               Error log UI
    expenses/                 Expense management
    home-care/                Home-care booking and visits
    ip/                       IP admission workflow
    lab/                      Lab catalog, orders, results
    opd/                      Unified OPD workspace
    patients/                 Patient registry and Patient 360
    pharmacy/                 Medicine catalog and pharmacy issues
    physiotherapy/            Physio cases and sessions
    reports/                  Reports and analytics
    scheduling/               Practitioner schedules
    shell/                    AppShell, context, data controller
    superAdmin/               Platform admin UI

  hooks/                      Shared React hooks
  lib/                        API client, contracts, navigation, helpers
  utils/                      Shared utilities
  e2e/                        Playwright tests
```

## Route Ownership

Routes live under `frontend/app/(shell)/(app)` and should stay thin. A route page should:

1. Read URL params.
2. Resolve view mode, selected id, tab, or section.
3. Get shared workspace context.
4. Render the owning feature component.

Feature components live under `frontend/features/<module>` and own module UI behavior.

## App Shell

`frontend/features/shell/AppShell.tsx` owns:

- Sidebar navigation.
- Header controls.
- Tenant, branch, and department context controls.
- Breadcrumbs.
- Global search command routing.
- Shell-owned sub-section state for admin, clinic, reports, and platform routes.
- Module skeletons during navigation.

`frontend/features/shell/useAppController.ts` owns:

- Current session context.
- Tenant, clinic, branch, department, and permission-derived navigation.
- Shared operational data loaded for workspaces.
- Live summaries used by dashboard/header/module badges.

## API Handling

Shared API behavior lives in `frontend/lib/api.ts`.

Rules:

- Use `apiFetch` for JSON APIs.
- Use upload helpers for file APIs.
- Do not call `fetch` directly in feature components unless there is a strong reason.
- Keep feature API wrappers under `frontend/features/<module>/api`.
- API helpers should accept `apiSession` and produce typed or normalized data.
- Access-denied errors should become clean user-facing messages.

Pattern:

```ts
export function listPatients(session: ApiSession, params: URLSearchParams) {
  return apiFetch(`/patients/page?${params.toString()}`, session);
}
```

## Data Loading

Preferred ownership:

- Shell data: current user, tenant, branch, departments, navigation availability, global summaries.
- Feature data: list rows, detail rows, form data, module-specific filters.
- Shared query keys: place in feature `api/` files when multiple components need the same data.

## UI Patterns

Use shared components where possible:

- `DataTable`
- `Pagination`
- adaptive filters and sort triggers
- result count
- skeleton loaders
- shared buttons and form controls
- `BreadcrumbSlot` for filter/sort tools in the shell breadcrumb row

Rules:

- Create pages should use `new-<entity>` route segments.
- Edit pages should use `edit-<entity>` route segments.
- Breadcrumb labels are route-derived.
- Do not add a landing page for an operational module. Open the usable workspace directly.
- Dense operational modules should prioritize scan speed over marketing-style layout.

## Testing

Unit and component:

```bash
cd frontend
npm test
```

Typecheck:

```bash
cd frontend
npm run typecheck
```

Build:

```bash
cd frontend
npm run build
```

E2E:

```bash
cd frontend
npm run test:e2e
```

## Adding A Frontend Module

1. Add route under `frontend/app/(shell)/(app)/<module>`.
2. Add feature folder under `frontend/features/<module>`.
3. Add API wrappers under `frontend/features/<module>/api`.
4. Add list, create, edit, detail, empty, loading, and error states.
5. Add shell navigation entry where appropriate.
6. Add permissions to navigation gating.
7. Add tests.
8. Update docs if routes, APIs, permissions, or user workflow changed.
