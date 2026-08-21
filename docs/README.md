# MedizinHub HMS Documentation

This folder is the canonical documentation set for the MedizinHub HMS project. It replaces the older scattered notes and repeated runbooks with a smaller set of source-of-truth documents.

## Reading Order

1. [Complete Project Documentation](complete-project-documentation.md)
   - Product purpose, architecture, modules, user journeys, setup, deployment, testing, and maintenance steps in one document.
2. [Architecture and Data Reference](architecture-and-data.md)
   - Backend, frontend, database, tenancy, permissions, APIs, storage, notifications, and integration boundaries.
3. Focused architecture files:
   - [Frontend Architecture](frontend-architecture.md)
   - [Backend Architecture](backend-architecture.md)
   - [API Design And Request Lifecycle](api-design-and-request-lifecycle.md)
   - [Database Connection And Data](database-connection-and-data.md)
   - [External Integrations](external-integrations.md)
   - [Authentication And Authorization](authentication-and-authorization.md)
   - [Design Patterns And SOLID Principles](design-patterns-and-solid.md)
   - [Logging, Tracing, And Observability](logging-tracing-observability.md)
4. [Development Workflow](development-workflow.md)
   - Local setup, daily workflow, module development steps, quality gates, source control, releases, and troubleshooting.
5. [Operations Runbook](operations-runbook.md)
   - Docker deployment, staging and production checks, backup and restore, logs, document storage, performance, scaling, rollback, and incident response.
6. [API Performance Hotspots](api-performance-hotspots.md)
   - Likely slow backend APIs, measurement commands, and optimization checklist.
6. [Security and Compliance](security-compliance.md)
   - Healthcare data handling, RBAC, audit, privacy, India compliance posture, incident readiness, and retention rules.
7. [Product and Roadmap](product-and-roadmap.md)
   - Product blueprint, module catalog, SaaS packaging, roadmap, production readiness, and refactoring priorities.
8. [API Permission Matrix](api-permission-matrix.md)
   - Detailed API endpoint and permission reference. Keep this as the endpoint-level authority.

## Fresher First-Day Path

1. Read `Complete Project Documentation` sections 1-7 to understand what the product does.
2. Read `Architecture and Data Reference` sections on request lifecycle, backend structure, frontend structure, tenancy, and permissions.
3. Run the app using `Development Workflow` local setup.
4. Open the frontend and follow one patient journey: patient registration, OPD appointment, consultation, billing.
5. Read `API Permission Matrix` public/auth APIs and the module section you are working on.
6. Before making a change, read `Development Workflow` module development steps and CI/CD pipeline.
7. Before deployment, read `Operations Runbook` deployment checklist, CI/CD deployment pipeline, and PostgreSQL dump/restore.
8. For any patient, billing, file, communication, or production-data work, read `Security and Compliance`.

## Documentation Rules

- Do not create a new doc when an existing canonical doc already has the same topic.
- Update the most specific canonical doc:
  - Product behavior: `product-and-roadmap.md`
  - Code structure, schema, APIs: `architecture-and-data.md`
  - Setup and contribution steps: `development-workflow.md`
  - Deployment and production operations: `operations-runbook.md`
  - Security and compliance: `security-compliance.md`
  - Endpoint permissions: `api-permission-matrix.md`
- Keep step-by-step commands copyable.
- Remove stale implementation history unless it describes a current rule, risk, or recovery process.
- When adding a feature, update the module table and any setup, permission, or runbook steps affected by that feature.
