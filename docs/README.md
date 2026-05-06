# MedizinHub HMS Smart Healthcare SaaS Documentation

MedizinHub HMS is planned as a plug-and-play healthcare SaaS platform for Indian clinics, polyclinics, multi-speciality hospitals, and multi-branch healthcare groups. The product should be simple enough for a small clinic using a tablet at reception, while strong enough for hospital workflows, revenue tracking, patient history, automation, and compliance.

## Documentation Map

- [Developer Setup Guide](./developer-setup.md): installation and local run instructions for macOS, Windows, and Linux.
- [Developer Handover Pack](./developer-handover-pack.md): current build status, run commands, code map, developer rules, and next tasks.
- [API Permission Matrix](./api-permission-matrix.md): endpoint-by-endpoint RBAC reference for backend and frontend developers.
- [Product Blueprint](./product-blueprint.md): product vision, target users, core workflows, and differentiators.
- [Development Master Prompt](./development-master-prompt.md): reusable engineering prompt for consistent module development.
- [Backend Architecture Spec](./backend-architecture-spec.md): backend architecture, API, database, tenancy, audit, and integration rules.
- [Database Design, ERD, and Production Gaps](./db-design-erd-production-gaps.md): current schema, relationships, tenant isolation, ERPNext positioning, and missing production pieces.
- [Plug-and-Play Architecture](./plug-and-play-architecture.md): modular architecture, extension points, integration strategy, and deployment model.
- [Module Catalog](./module-catalog.md): planned functional modules and configuration needs.
- [Production Readiness Plan](./production-readiness-plan.md): automated test matrix, deployment operations, backup/restore, compliance workflows, and tablet/mobile QA gates.
- [Data, Security, and India Compliance](./data-security-compliance.md): patient data model, access control, auditability, DPDP/ABDM/telemedicine readiness, and security practices.
- [Technology Strategy](./technology-strategy.md): recommended stack, build stages, ERPNext/Frappe positioning, AI/automation approach, and integration layers.
- [SaaS Plans and Roadmap](./saas-plans-roadmap.md): subscription packaging, add-ons, release phases, and market-entry strategy.

## Product Direction

The strongest direction is a custom, mobile-first HMS experience layer with modular backend services. ERPNext/Frappe can be integrated for back-office capabilities such as accounting, inventory, HR, and finance where it speeds up delivery, but the primary clinic, doctor, patient, and automation workflows should remain under MedizinHub HMS control.

The platform should behave like a shared healthcare operating system:

- Reception can book patients quickly.
- Doctors can consult using a focused workspace.
- Patients can book through web, mobile, WhatsApp, or assisted bots.
- Clinics can configure fees, queues, branches, staff, and subscriptions.
- Owners can track revenue, utilization, settlements, and growth.
- Important patient history can be safely viewed by authorized doctors inside the same healthcare organization for treatment purposes.
