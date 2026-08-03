# MedizinHub HMS Documentation

Use this page as the documentation entry point. Current implementation and
operations documents take priority over older product-planning material.

## Start Here

- [Developer setup](developer-setup.md) — install, configure, migrate, and run
  the frontend/backend on supported operating systems.
- [Project workflow and code map](project-workflow-and-code-map.md) — current
  frontend/backend structure, request lifecycle, and common change paths.
- [Module development guide](module-development-guide.md) — required module
  structure, permissions, tenancy, tests, and pull-request checklist.
- [Source control and quality](source-control-and-quality-guide.md) — branch,
  migration, verification, and review rules.

## Architecture and Data

- [Backend architecture](backend-architecture-spec.md)
- [Database schema and rules](database-schema-and-rules.md)
- [Database ERD and production gaps](db-design-erd-production-gaps.md)
- [API permission matrix](api-permission-matrix.md)
- [Module catalog](module-catalog.md)
- [In-app notifications](in-app-notifications.md)

## Testing, Deployment, and Operations

- [CI/CD testing strategy](ci-cd-testing-strategy.md)
- [Versioning and releases](versioning-and-releases.md)
- [Pending frontend/backend testing checklist](testing-pending-checklist.md)
- [EC2 Docker deployment](ec2-docker-deployment.md)
- [Production logging runbook](production-logging-runbook.md)
- [Scalability and capacity runbook](scalability-capacity-runbook.md)
- [Production backup and restore runbook](backup-restore-runbook.md)
- [Release acceptance runbook](release-acceptance-runbook.md)
- [Production-to-development database restore](prod-to-dev-db-restore.md)
- [Production readiness plan](production-readiness-plan.md)

## Product and Security

- [Product blueprint](product-blueprint.md)
- [SaaS plans and roadmap](saas-plans-roadmap.md)
- [Data security and India compliance](data-security-compliance.md)
- [Development rules](development-master-prompt.md)

## API Documentation

FastAPI serves the current API contract directly from the running backend:

- Swagger UI: `http://localhost:8000/docs`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

Use the live OpenAPI URL for Postman imports so the collection cannot drift
from the implemented routes and schemas.

## Historical Implementation Notes

[Backend refactoring implementation strategy](refactoring-implementation-strategy.md)
is retained as implementation history. It is not the primary source for
current run commands or architecture decisions.
