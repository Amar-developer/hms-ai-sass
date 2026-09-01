# Design Patterns And SOLID Principles

## Purpose

This document defines design patterns and SOLID rules for MedizinHub HMS development.

## SOLID Principles

### Single Responsibility

Each file should have one clear reason to change.

- Routes handle HTTP.
- Services handle business workflows.
- Models map database tables.
- Adapters talk to external systems.
- Components render UI and handle local interaction.

### Open Closed

Add new behavior through extension points when possible.

Examples:

- Add a notification provider adapter instead of editing route handlers.
- Add billing source logic through billing service boundaries.

### Liskov Substitution

Provider adapters should match their interface contracts so tests can substitute fake providers.

### Interface Segregation

Avoid large service interfaces. Keep provider, storage, billing, and notification contracts focused.

### Dependency Inversion

High-level services should depend on abstractions or module service boundaries, not direct provider SDKs.

## Backend Patterns

### Thin Route Pattern

Route:

1. resolves dependencies
2. parses request
3. calls service
4. returns response

### Service Pattern

Domain services own workflow logic, state transitions, validation, and side effects.

### Repository/Query Helper Pattern

Use query helpers when repeated filtering logic appears, especially tenant, branch, date, and status filters.

### Adapter Pattern

Use adapters for:

- S3/object storage
- WhatsApp
- SMS
- email/report delivery
- future ERP/accounting systems

### Factory Pattern

Use factories when runtime configuration chooses an implementation, such as local storage vs S3 storage.

### Strategy Pattern

Use strategy-style code for billing, discounts, communication providers, and report exports when multiple algorithms share a workflow.

## Frontend Patterns

### Route Adapter Pattern

Next.js route pages adapt URL params to feature component props.

### Feature API Wrapper Pattern

Feature API calls live in `frontend/features/<module>/api`.

### Shared Shell Pattern

AppShell owns global navigation, breadcrumbs, branch/department context, and shared workspace context.

### Shared Table Pattern

List modules use common table, pagination, adaptive filter, sort, count, skeleton, and empty states.

## Refactoring Rules

- Do not refactor billing, clinical signing, permissions, tenant isolation, or migrations without tests.
- Keep behavior stable.
- Move duplicated logic only after understanding owning module boundaries.
- Prefer small safe changes over large rewrites.

## Code Smells

- Route handler contains business workflow.
- React component builds many raw API URLs.
- Provider SDK called outside adapter.
- Tenant filter missing from query.
- Permission is checked only in frontend.
- Billing totals calculated differently in frontend and backend.
- File download bypasses backend authorization.
