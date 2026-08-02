# Backend external integration boundaries

External services use a ports-and-adapters boundary under
`backend/app/infrastructure/integrations`.

```text
app/
├── modules/                         # Healthcare and application behavior
│   ├── appointments/                # Decides when booking events occur
│   ├── billing/                     # Decides when invoices/payments change
│   ├── notifications/               # Queue, retry and delivery orchestration
│   ├── reports/                     # Report jobs and scheduling
│   └── integrations/                # Tenant settings, consent and flow policy
└── infrastructure/integrations/
    ├── ports/                       # Stable provider-neutral contracts
    │   ├── cache.py
    │   ├── email.py
    │   ├── messaging.py
    │   └── object_storage.py
    ├── factories.py                 # Runtime adapter selection/composition
    └── adapters/                    # Network and provider implementations
        ├── cache/redis.py
        ├── email/smtp.py
        ├── messaging/http_template.py
        └── object_storage/s3.py
```

## Ownership rules

- Domain modules own use cases, authorization, tenant configuration, consent,
  idempotency, queues, retry policy, audit events and database records.
- Ports define the smallest operations the application needs and contain no
  provider SDK imports.
- Adapters translate a port operation into an external protocol. Provider SDKs,
  HTTP payloads, connection construction and transport error translation belong
  only here.
- API routes call application/domain services; they never call an adapter
  directly.
- Secrets remain in the existing application configuration or encrypted tenant
  integration record. They are passed to adapters at execution time and are not
  copied into domain models or logs.

`app/modules/integrations` intentionally remains an application module: it owns
tenant integration settings and notification policy. It does not own the
provider HTTP client. Renaming that module would change many public imports
without improving the runtime boundary, so compatibility imports are retained
while new code uses the infrastructure contracts.

## Current mappings

| Capability | Application owner | External adapter |
| --- | --- | --- |
| Document storage | `modules/files` | `adapters/object_storage/s3.py` |
| Approved template messages | `modules/notifications` and tenant settings | `adapters/messaging/http_template.py` |
| Document/report email | `modules/notifications` and `modules/reports` | `adapters/email/smtp.py` |
| Auth cache and report queue | `core/auth_cache.py` and `modules/reports` | `adapters/cache/redis.py` |

The old S3 and message gateway module paths are compatibility facades. They may
be removed only after downstream imports have migrated.
