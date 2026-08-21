# API Design And Request Lifecycle

## Purpose

This document explains how frontend requests become backend work, how APIs should be designed, and how endpoint documentation must stay current.

## End-To-End Request Flow

```text
React feature component
  -> feature API helper
  -> frontend/lib/api.ts
  -> FastAPI /api/v1 route
  -> auth and tenant dependencies
  -> permission dependency
  -> domain service
  -> SQLAlchemy session
  -> PostgreSQL
  -> audit/notification/file side effects
  -> JSON response
  -> frontend state update
```

## Frontend API Rules

- Use `apiFetch` for JSON requests.
- Use file helpers for uploads/downloads.
- Keep module API functions under `frontend/features/<module>/api`.
- Do not build raw URLs in components when an API helper can own them.
- Pass `apiSession` into API helpers.
- Keep patient-facing or staff-facing error messages clean.

## Backend API Rules

- All versioned APIs live under `/api/v1`.
- Route files live in `backend/app/api/v1`.
- Routes call module services.
- Protected routes require authentication.
- Tenant routes require tenant context.
- Permission checks happen in backend dependencies or service guardrails.
- Branch-sensitive routes must check branch scope.
- Public routes must be documented as public.

## Endpoint Naming

Use resource routes:

```text
GET    /api/v1/patients
POST   /api/v1/patients
GET    /api/v1/patients/{patient_id}
PATCH  /api/v1/patients/{patient_id}
DELETE /api/v1/patients/{patient_id}
```

Use action routes only for workflow actions:

```text
POST /api/v1/consultations/{consultation_id}/sign
POST /api/v1/queue/{entry_id}/call
POST /api/v1/billing/invoices/{invoice_id}/send
```

## List API Shapes

Most table-backed modules use:

```text
GET /api/v1/<resource>
GET /api/v1/<resource>/page
GET /api/v1/<resource>/filter-options
```

- Plain list supports simple dropdowns and internal workflows.
- `/page` supports paginated tables.
- `/filter-options` supports adaptive filter builders.

## API Permission Matrix Rule

Every live FastAPI route must be documented in `docs/api-permission-matrix.md`.

Verification:

```bash
cd frontend
../backend/.venv/bin/pytest ../backend/tests/test_api_docs.py -q
```

This test compares live `/api/...` routes with Markdown endpoint rows.

## Response Design

Responses should:

- Include stable ids.
- Include display names when the frontend should not refetch.
- Avoid leaking internal implementation details.
- Return normalized status strings.
- Return computed totals from backend for billing.
- Avoid returning cross-tenant data.

## Error Design

- Permission errors should be clear and not scary.
- Validation errors should identify the field or workflow rule.
- Internal errors should be logged with correlation context.
- Provider errors should be normalized before reaching users.

## Adding A New API

1. Add route.
2. Add or update service method.
3. Add permission.
4. Add tenant and branch checks.
5. Add tests.
6. Add frontend API helper.
7. Add UI integration.
8. Update `api-permission-matrix.md`.
9. Run API docs route coverage test.
