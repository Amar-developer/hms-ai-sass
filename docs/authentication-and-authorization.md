# Authentication And Authorization

## Purpose

This document explains login, session identity, tenant context, roles, permissions, branch scope, module entitlements, and authorization rules.

## Authentication

Authentication identifies the user.

Main routes:

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/change-password`

Protected APIs require:

```text
Authorization: Bearer <token>
```

Tenant APIs also require:

```text
X-Tenant-ID: <tenant_id>
```

## Authorization

Authorization decides what the user may do.

Inputs:

- user active status
- tenant status
- tenant membership
- roles
- permissions
- branch assignment
- practitioner linkage for doctor users
- module entitlement
- platform/super-admin state

## Roles And Permissions

Permissions are string keys such as:

- `patients.read`
- `patients.create`
- `consultations.sign`
- `billing.manage`
- `communications.whatsapp.manage`

Backend routes must check permissions even when frontend hides UI.

## Tenant Scope

Tenant users can access only their tenant. Super admins and explicit platform routes can cross tenant boundaries.

Rules:

- Do not trust tenant ids in request bodies.
- Use resolved tenant context.
- Tenant-owned records must be filtered by tenant.
- Suspended tenants are blocked from protected tenant APIs.

## Branch Scope

Branch-scoped users can access only assigned branches for branch-sensitive workflows.

Branch-sensitive areas include:

- patients
- appointments
- queue
- consultations
- lab
- pharmacy
- billing
- IP
- physiotherapy
- home care

## Doctor Scope

Doctor users are additionally scoped to their linked active practitioner profile.

They can only access appointments, queue entries, and consultations assigned to their practitioner profile inside the current tenant and branch scope.

## Module Entitlement

Tenant modules can be enabled or disabled. Backend APIs must enforce module access for protected module behavior.

Examples:

- patients
- appointments
- queue
- consultations
- billing
- lab
- pharmacy
- home care
- physiotherapy

## Authorization Checklist For New APIs

1. Is the endpoint public or protected?
2. Does it need tenant context?
3. Does it need branch scope?
4. Which permission key is required?
5. Does a doctor need practitioner scoping?
6. Does module entitlement apply?
7. Should the action be audited?
8. Is the endpoint listed in `api-permission-matrix.md`?
