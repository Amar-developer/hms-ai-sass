# Backend Pytest Guide

## Purpose

This folder contains backend unit, integration, architecture, and API contract tests. Tests should protect real business behavior first: tenancy, permissions, branch scope, workflow state, billing totals, file security, notification delivery, and data integrity.

Do not add tests only because a module, class, or endpoint exists. Add the smallest useful test for what can break:

- Use unit tests for business rules, validation, calculations, permissions, state transitions, date/time rules, data transformation, and pure service decisions.
- Use integration tests for repository/database behavior, transactions, constraints, relationships, storage adapters, queues, and provider boundaries with fakes.
- Use API tests for HTTP status codes, request/response contracts, authentication, authorization, validation errors, and route-level behavior.
- Use E2E tests only for critical workflows such as login -> patient -> appointment -> invoice -> payment.

## Test Organization

- `test_<module>.py`: module workflow tests.
- `test_repository_filters.py`: shared repository list/filter/sort/filter-option behavior.
- `test_settings_catalog_filters.py`: catalog repository filters plus catalog audit/update services.
- `test_*_permissions.py`: permission decision tests when the behavior spans modules.
- `test_architecture.py`: architecture guardrails, including external adapter isolation and integration port boundaries.
- `test_api_docs.py`: verifies every live FastAPI route is documented in `docs/`.

## Coverage Rule

Backend module coverage is based on business risk, not folder count. A module does not need a direct unit test just because it exists, but any module behavior that owns money, permissions, tenant/branch isolation, workflow state, external side effects, or patient data integrity needs an appropriate unit, integration, or API test.

When adding a new module:

1. Add business workflow tests.
2. Add permission denied tests.
3. Add tenant isolation tests.
4. Add branch isolation tests if branch scoped.
5. Add API documentation rows.
6. Run:

```bash
backend/.venv/bin/pytest backend/tests/test_architecture.py backend/tests/test_api_docs.py -q
```

## Business Logic Test Checklist

For any module change, prefer tests that prove:

- happy path succeeds
- invalid data is rejected
- wrong permission is rejected
- wrong tenant is rejected
- wrong branch is rejected
- workflow state transition is valid
- audit event is written for sensitive mutations
- notification/file/billing side effects happen exactly once
- totals and decimal values are backend-authoritative

## Avoiding Duplicate Tests

Before adding a new file:

1. Search existing tests:

```bash
rg -n "keyword|service_name|endpoint|permission" backend/tests
```

2. Add the test to the existing module file when possible.
3. Use `test_repository_filters.py` for repeated list/filter/sort behavior.
4. Use focused helper functions inside the test file rather than copying large setup blocks.
5. Do not duplicate API smoke coverage when a service-level unit test would isolate the business rule better.
6. Remove pass-through tests such as "service calls repository" unless the test asserts a business/security decision.

## Running Tests

Focused file:

```bash
backend/.venv/bin/pytest backend/tests/test_repository_filters.py -q
```

Fast PR-style backend gate:

```bash
backend/.venv/bin/pytest backend/tests -q -m "unit and not e2e"
```

Full backend tests for `develop` / `main`:

```bash
backend/.venv/bin/pytest backend/tests -q
```

Marker meanings:

- `unit`: isolated backend business rules, calculations, validation, permissions, or transformations.
- `integration`: database/repository/service collaboration behavior.
- `api`: FastAPI `TestClient` HTTP contract, auth, permission, and route behavior.
- `slow`: large workflow suites saved for full CI or deliberate local runs.
- `e2e`: live backend end-to-end tests outside `backend/tests`.

Lint:

```bash
backend/.venv/bin/ruff check backend/app backend/tests backend/e2e backend/scripts
```
