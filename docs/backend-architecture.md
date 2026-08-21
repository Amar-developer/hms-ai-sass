# Backend Architecture

## Purpose

This document explains backend folder structure, request layers, service boundaries, module ownership, authorization dependencies, and testing expectations.

## Technology

- FastAPI.
- Python.
- SQLAlchemy.
- Alembic.
- PostgreSQL.
- pytest.
- ruff.

## Folder Structure

```text
backend/
  app/
    main.py                   FastAPI application factory and middleware
    api/
      router.py               Aggregates versioned routers
      v1/                     HTTP route modules
    core/
      auth.py                 Authentication and permission dependencies
      config.py               Settings and environment
      database.py             Engine/session setup
      security.py             Password/token/security helpers
    infrastructure/
      integrations/           External provider adapters
    modules/
      appointments/
      audit/
      billing/
      consultations/
      error_logs/
      expenses/
      files/
      home_care/
      identity/
      integrations/
      ip/
      lab/
      notifications/
      patient_intelligence/
      patient_subscriptions/
      patients/
      pharmacy/
      physiotherapy/
      practitioners/
      queue/
      reports/
      settings/
      subscriptions/
      tenants/
  alembic/
    versions/                 Database migrations
  e2e/                        Live API workflow tests
  scripts/                    Seed, readiness, storage, deployment helpers
  tests/                      Unit and integration tests
```

## Backend Layers

### API Layer

Files: `backend/app/api/v1/*.py`

Responsibilities:

- Declare routes.
- Parse request bodies and query params.
- Resolve dependencies.
- Call services.
- Return response models.

Routes should not contain heavy business logic.

### Dependency Layer

Files: `backend/app/core/auth.py`, `backend/app/core/database.py`

Responsibilities:

- Current user/session.
- Tenant context.
- Permission checks.
- Branch scope checks.
- Database session lifecycle.

### Domain Service Layer

Files: `backend/app/modules/<module>/services/*`

Responsibilities:

- Business rules.
- Workflow state transitions.
- Tenant and branch validation.
- Cross-module orchestration.
- Audit and notification side effects.
- Billing source generation where the module owns billable events.

### Persistence Layer

Files: `backend/app/modules/<module>/models.py`, repository helpers where present.

Responsibilities:

- SQLAlchemy table mapping.
- Query helpers.
- Persistence-specific filtering.

## Request Handling Flow

1. Request enters FastAPI app.
2. Middleware handles CORS, tenant context, static/local uploads, and error handling where configured.
3. Router resolves `/api/v1/...`.
4. Dependencies authenticate the bearer token.
5. Dependencies resolve tenant and permission context.
6. Route parses request.
7. Service validates business rules.
8. Service reads/writes database through SQLAlchemy session.
9. Service emits audit/notification/file/billing side effects when required.
10. Route returns response.

## Module Rules

- A module owns its data and core workflow.
- Shared cross-cutting rules belong in `core` only when reused broadly.
- External providers belong behind adapters.
- Billing integrations should use billing service boundaries.
- Notification integrations should enqueue or create notification intent instead of calling providers directly from routes.

## Testing

Backend tests should cover:

- Success path.
- Permission denied.
- Tenant isolation.
- Branch isolation.
- Validation errors.
- Workflow state transitions.
- Billing totals.
- File access.
- Notification enqueue behavior.

Commands:

```bash
cd backend
source .venv/bin/activate
ruff check app tests e2e scripts
pytest tests -q
```
