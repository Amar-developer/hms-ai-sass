# MedizinHub HMS Production-Readiness Audit

Audit date: 2026-08-26
Scope: repository architecture, 402 FastAPI routes, critical workflows, tests, integrations, database pooling, security, deployment, and targeted fixes.

## 1. PROJECT OVERVIEW

MedizinHub HMS is a multi-tenant healthcare management system with a Next.js 16/React 19 frontend and a synchronous FastAPI/SQLModel backend. PostgreSQL is the production system of record, Redis supports queues, locks, health and short-lived authorization caches, and a separate report worker processes reports, email and WhatsApp delivery, reminders, retention, snapshots, and patient-intelligence refreshes.

Repository inventory:

| Area | Location | Notes |
| --- | --- | --- |
| Backend API | `backend/app/api/v1` | 402 live operations including root/platform aliases |
| Domain code | `backend/app/modules` | Models, schemas, repositories, services and workers by domain |
| Integration adapters | `backend/app/infrastructure/integrations` | Redis, SMTP, S3 and template messaging ports/adapters |
| Database migrations | `backend/alembic/versions` | 127 files, one linear head: `20260824_0127` |
| Backend tests | `backend/tests` | 583 collected tests after this audit; pytest markers are assigned by fixtures |
| Live backend E2E | `backend/e2e` | 13 PostgreSQL/Uvicorn workflow files |
| Frontend | `frontend/app`, `frontend/features`, `frontend/lib` | Next.js feature-oriented application |
| Frontend tests | colocated `*.test.ts(x)` | 178 Vitest tests in 38 files |
| Browser E2E | `frontend/e2e` | Playwright critical/extended/cross-browser suites |
| CI/CD | `.github/workflows` | CI, EC2 deploy, browser E2E and backup workflows |
| Deployment | `Dockerfile*`, `docker-compose*.yml`, `infra/aws` | Local, staging and production topologies with PgBouncer |
| Documentation | `README.md`, `backend/README.md`, `docs` | Architecture, permissions, operations, security and workflow guides |

No production credentials were used or printed during this audit.

## 2. ARCHITECTURE ANALYSIS

Current request flow:

```text
Next.js feature API helper
  -> frontend/lib/api.ts
  -> FastAPI route
  -> security/CORS/observability/tenant middleware
  -> session + authentication + tenant + permission dependencies
  -> module service
  -> repository/SQLModel
  -> PostgreSQL
  -> optional durable event/file/integration boundary
  -> response model
```

Strengths:

- API, module, repository/service, and provider-adapter boundaries are explicit.
- Authorization is enforced server-side and route documentation is checked against the live route graph.
- Tenant-sensitive repositories generally accept `tenant_id`; branch and doctor scoping have shared guardrails.
- Provider calls have explicit timeouts. S3 uses bounded timeouts/retries; WhatsApp has a durable queue, leases, retries and idempotency; SMTP work is worker-owned.
- PostgreSQL transaction timeouts, pool instrumentation, overload responses and PgBouncer administration tooling are present.

Architectural risks:

- Transaction ownership is inconsistent: many services commit internally while some routes and orchestration services also commit. This makes multi-step composition and rollback reasoning harder.
- `patient_intelligence/service.py` (1,526 lines), `api/v1/patient_intelligence.py` (1,374), `api/v1/billing/invoices.py` (989), report profit logic (941), and the WhatsApp processor (932) are high-change-risk modules.
- Most route handlers are synchronous. Capacity is therefore constrained by the AnyIO thread pool as well as Uvicorn admission limits, SQLAlchemy pools and PgBouncer.
- The SQLite service/API suite is valuable but does not reproduce PostgreSQL locks, constraints, `SKIP LOCKED`, isolation, timeouts or PgBouncer behavior. The live E2E suite is essential, not optional evidence.

## 3. API INVENTORY

The authoritative per-operation inventory, including exact method, path and permission, is `docs/api-permission-matrix.md`. `backend/tests/test_api_docs.py` compares it to the live FastAPI graph. This audit added the missing patient-communications operation; the contract now passes.

Live graph summary:

| Module/tag | Operations | Auth/tenant model | DB | External integration | Test status | Main issues/risk |
| --- | ---: | --- | --- | --- | --- | --- |
| Platform/root | 3 | Public | readiness only | Redis/readiness | Contract tests | Root advertises docs even when docs are disabled (low) |
| Health | 2 | Public | readiness probe | Redis | API tests exist | Must remain shallow under DB saturation |
| Files | 12 | Permission + tenant/branch | Yes | S3/local | Strong unit/API tests | Storage compensation is not an atomic DB/object transaction |
| Modules | 1 | Public | No | No | Contract | Public capability metadata is intentional |
| Identity/auth | 28 | Public bootstrap/login; otherwise auth/RBAC | Yes | Redis rate limit/cache | Extensive API/unit/E2E | Redis outage makes login limiting fail open |
| Error logs | 6 | Auth + tenant + permission | Yes | No | Unit/API/E2E | Stack traces require continuing PHI review |
| Tenants | 25 | Platform or tenant admin | Yes | File storage for logos | API/E2E | Onboarding has several commits and compensations |
| Subscriptions | 18 | Platform/tenant permissions | Yes | No | API/E2E | Payment operations are internal state transitions, not a gateway contract |
| Audit/activity | 7 | Auth + tenant + permission | Yes | In-app notification | Unit/API/E2E | Audit writes sometimes commit independently |
| Patients | 18 | Entitlement + tenant + permission + branch | Yes | Files/notifications | Strong API/E2E | Communication endpoint was undocumented; fixed |
| Patient subscriptions | 9 | Tenant + permission | Yes | Billing | API/E2E | Delete behavior includes hard delete for some enrollment data |
| Patient intelligence | 16 | Tenant + permission | Yes | WhatsApp queue | Unit/API | Very large service/route and bulk synchronous work |
| Practitioners | 21 | Tenant + permission + doctor scope | Yes | No | API/E2E | Scheduling races rely on DB checks/constraints |
| Appointments | 8 | Entitlement + tenant + permission + doctor/branch | Yes | Notification outbox | Strong API/E2E | Availability is race-sensitive; idempotency is present |
| Queue | 8 | Entitlement + tenant + permission + doctor/branch | Yes | Notifications | Strong API/E2E | Token allocation/concurrent transitions require PostgreSQL evidence |
| Reports | 10 | Tenant/report permission | Yes | Redis, SMTP, storage | Unit/API | Worker is a broad scheduler and failure domain |
| Consultations | 13 | Entitlement + tenant + clinical permission | Yes | Billing/notifications | Strong API/E2E | Signing and billing span service boundaries |
| Billing | 48 | Entitlement + granular billing/payment permissions | Yes | Storage, email/WhatsApp delivery | Strong unit/API/E2E | Largest financial surface; mixed transaction ownership |
| Inpatient | 29 | Tenant + permission | Yes | Files/billing | API/E2E | Multi-step clinical/billing consistency risk |
| Lab | 31 | Tenant + permission | Yes | Files, GraphQL catalog, delivery | API/E2E | Provider errors were exposed; fixed |
| Pharmacy | 28 | Tenant + permission | Yes | GraphQL catalog | API/E2E | Stock concurrency requires PostgreSQL testing |
| Physiotherapy | 14 | Tenant + permission | Yes | Files/billing | API/E2E | Service commits internally |
| Home care | 14 | Tenant + permission | Yes | Billing | API/E2E | Booking/visits/invoice are separate commits |
| Settings | 4 | Tenant + permission | Yes | Provider configuration | API tests | Dynamic configuration affects security boundaries |
| Notifications | 6 | Tenant + permission/auth | Yes | Provider queues | Unit/API | Delivery status is eventually consistent |
| Observability | 1 | Super admin | Yes/read-only metrics | Redis/worker health | API/unit | In-process metrics are not deployment-wide |
| Communications | 8 | Two signed public reads; otherwise tenant permission | Yes | WhatsApp/storage | Strong unit/API | Signed URLs valid up to 24 hours |
| Expenses | 14 | Tenant + granular permission | Yes | File receipts | Unit/API | Approval/reimbursement requires audit consistency |

Method totals: 185 GET, 149 POST, 41 PATCH, 24 DELETE and 3 PUT.

## 4. CRITICAL BUSINESS FLOWS

Patient creation:

```text
POST /patients -> entitlement/RBAC/tenant/branch -> schema/mobile/duplicate checks
-> patient-number generation -> Patient insert -> audit -> response
```

Implemented safeguards include normalized mobile validation, tenant-scoped duplicates, plan patient limits, creator attribution and cross-tenant tests. Remaining concern: validate duplicate behavior under concurrent PostgreSQL writes, not only sequential SQLite requests.

Appointment to consultation to billing:

```text
POST /appointments -> patient/practitioner/branch validation -> schedule/conflict checks
-> idempotency key + appointment/token -> notification outbox
-> queue transition -> consultation draft -> immutable sign
-> invoice generation -> ledger -> payment/refund/adjustment -> document delivery
```

Implementation is materially aligned with the expected flow. DB constraints and idempotency migrations protect duplicate appointment/consultation-invoice creation. Remaining concern: concurrency/load evidence is required for availability, token numbering and payment/adjustment execution.

Invoice/payment:

```text
source item(s) -> pricing/discount/membership/tax -> invoice + items + ledger
-> payment -> status/balance -> final artifact -> email/WhatsApp delivery queue
```

Money fields use fixed decimal storage and dedicated precision tests. Provider delivery is asynchronous and does not hold a financial transaction open. A failed delivery leaves the paid invoice intact and retryable, which is the correct consistency boundary.

Home care:

```text
patient + catalog -> booking/plan/location -> visits -> invoice generation -> payment
```

The workflow is implemented, but booking, visit updates and invoice generation commit independently. That is acceptable for separately authorized lifecycle actions; orchestration that promises all-or-nothing behavior must not compose them without a higher transaction boundary.

Lab/pharmacy:

Consultation referrals become tenant-scoped lab orders or pharmacy issues, then source-specific invoices. Lab artifacts and reports are authorization checked; stock and batch operations are repository-backed. The external medicine catalog is optional and local catalog behavior remains available when it is disabled.

## 5. UNIT TEST ANALYSIS

The suite contains meaningful rule, repository, calculation and transformation tests, including decimal precision, permissions, branch/tenant scoping, idempotency, document signatures, S3 contracts, WhatsApp mappings/retries, report calculations and query-count regressions.

Findings:

- Tests are currently organized mostly by feature file rather than `unit/services`, `integration/api` folders. Markers are assigned dynamically from fixtures, which keeps migration effort low but hides classification during source review.
- Assertions are generally behavioral and stronger than status-only checks.
- A billing query-count test created invoices without matching patients even though production has foreign keys and the repository intentionally inner-joins patients. The fixture was corrected.
- Some tests use `asyncio.run()` around code that delegates to `run_in_threadpool`; this cannot execute in the current restricted runner, so thread-capable CI remains required.
- Missing direct unit coverage was found for GraphQL response limits/encoding/provider errors and login stdout; both were added.

Recommended additions: property/boundary tests for monetary allocations; concurrent PostgreSQL tests for appointment slots, token numbering, stock and adjustment execution; explicit transaction-failure tests around tenant onboarding and file metadata/storage compensation.

## 6. INTEGRATION TEST ANALYSIS

| Boundary | Present | Quality | Missing/high-value work | Priority |
| --- | --- | --- | --- | --- |
| SQLModel + SQLite | Yes | Broad service/repository collaboration | Enable SQLite FK enforcement or consistently create valid references | Medium |
| PostgreSQL + Alembic + live API | Yes, `backend/e2e` | Correct black-box design | Must run on every protected branch and release | High |
| PgBouncer saturation | Admin script/tests | Strong diagnostics | Scheduled staging saturation baseline | High |
| Redis | Fakes and failure tests | Good for queue/cache logic | Live Redis contract/TTL test in isolated CI | Medium |
| S3 | Fake client + readiness/CloudFormation checks | Good contract/security coverage | Emulator/AWS test bucket upload/download/delete in isolated CI | High |
| WhatsApp | Fake gateway + queue processor tests | Strong | Provider sandbox contract/webhook tests; no webhook route exists | High |
| SMTP | Fake delivery/worker tests | Good | TLS/auth failure contract against local SMTP emulator | Medium |
| GraphQL catalog | Fake boundary tests added | Covers safe failures and limits | Contract test against approved staging endpoint | Medium |

## 7. API TEST ANALYSIS

There are 265 fixture-classified API tests and 13 live E2E workflow files. Important auth, RBAC, cross-tenant, inactive-user, suspended-tenant, entitlement, file, billing and clinical workflows are represented.

The current execution sandbox cannot start Starlette `TestClient`: a minimal FastAPI application hangs during `TestClient.__enter__`, before any application request. Therefore this audit does not claim the 265 API tests passed locally. CI or a normal thread-capable container must execute them. This is an environment limitation, not evidence of an API defect.

## 8. S3 INTEGRATION ANALYSIS

S3 is behind `ObjectStorage` and `S3ObjectStorage`; business services use the port/factory rather than boto3 directly. Keys are server-generated and include environment/tenant/module/document/entity segments. Unsafe path segments are rejected. Uploads are bounded to 10 MiB and magic-number validated; executable SVG/HTML are excluded. S3 writes include checksums, metadata, tags and SSE-S3 or KMS encryption. Connect/read timeouts are 5/10 seconds with adaptive retries.

Tenant isolation is enforced both in DB metadata lookup and object-key construction. Downloads pass backend authorization or use HMAC-signed, bounded-TTL delivery URLs. Production configuration rejects local storage, custom S3 endpoints, unsafe bucket names and presign TTLs over one hour.

Remaining gaps: no live test-bucket lifecycle in this audit; delete/write compensation cannot be atomic with PostgreSQL; bucket policy/versioning/lifecycle must be verified during deployment with `verify_document_storage.py`.

## 9. WHATSAPP INTEGRATION ANALYSIS

Flow:

```text
domain event -> durable NotificationEvent -> consent/entitlement/template checks
-> tenant credential decrypt -> context and ordered variables
-> normalized destination -> HTTPS adapter -> result normalization
-> sent/retry/failed state + delivery/audit update
```

Positive controls: encrypted tenant credentials, HTTPS/public-address validation, redirect refusal, normalized E.164-like numbers, patient consent, language/template mapping, monthly limits, durable lease claiming with `SKIP LOCKED`, exponential retry, attempt limits, masked queue reads, idempotency keys, signed media URLs and no real calls in tests.

Fixed: provider HTTP error bodies are no longer logged because they may echo destinations, credentials, patient names or template values.

Remaining gaps: no inbound provider webhook/delivery/read-status route was found; DNS validation and the later HTTP connection are separate, so a determined DNS-rebinding threat is not fully eliminated; rate-limit responses use exponential retry but do not honor a provider `Retry-After` header.

## 10. DATABASE CONNECTION POOL ANALYSIS

Current production/staging topology:

```text
2 Uvicorn processes
  x SQLAlchemy QueuePool (10 base + 10 overflow)
report worker QueuePool (5 base + 5 overflow)
  -> PgBouncer transaction pool (20 base + 5 reserve per user/database)
  -> PostgreSQL max_connections 100
```

SQLAlchemy uses `pool_pre_ping`, 30-minute recycle, 5-second deployment pool timeout, instrumentation and per-transaction statement/lock/idle-transaction timeouts. `get_session()` uses a context manager and rolls back on errors, so request sessions return connections to the pool. PgBouncer transaction mode is paired with prepared-statement disabling in staging/production examples. Migrations connect directly to PostgreSQL using `NullPool`.

Capacity reasoning: application processes can open up to 50 PgBouncer client connections, but PgBouncer caps real server connections at 25 for the application user/database pool. With PostgreSQL max 100 this leaves substantial headroom for migration, backup and administration, assuming no additional user/database pools consume it. The 40-thread limit per web process is larger than its 20-connection pool, so at peak up to 20 handler threads per process can wait; Uvicorn admission (80/process) remains much larger. These values are defensible starting points, not proof of capacity.

Observed static problems: none indicating a request-session leak. The real risk is queueing across multiple layers and long synchronous handlers. Recommendation: keep current pool sizes, measure `checked_out`, checkout wait, PgBouncer `cl_waiting/maxwait`, p95 query and request time under representative staging load, then tune worker/admission limits before increasing pools.

## 11. REDIS ANALYSIS

Redis supports report queues/dedupe, scheduler locks, worker heartbeat, login rate limits and short-lived auth/tenant caches. Cache failures generally fall back to PostgreSQL or durable DB queues, and report jobs remain recoverable from the DB.

Security/reliability concern: login rate limiting fails open when Redis is unavailable. This preserves availability but removes brute-force protection during an outage. Add an ingress/WAF rate limit and alert on `auth.rate_limit_unavailable`; do not rely on Redis application limiting as the sole control.

## 12. AUTHENTICATION & AUTHORIZATION

Opaque random session tokens are stored only as SHA-256 hashes in the DB and expire after 12 hours. Browser cookies are HttpOnly, SameSite=Lax and Secure by production default. Passwords use PBKDF2-HMAC-SHA256 with random salts and 260,000 iterations. Password changes revoke other sessions. Production bootstrap requires a deployment token and refuses a second super admin.

Authentication and authorization are separated through `get_current_user`, tenant context, permission dependencies, support-grant policy, tenant status, branch scope and doctor-practitioner scope. Redis authorization caches have a 30-second TTL and proactive invalidation on key writes; revoked access can therefore remain effective for up to the configured TTL.

Fixed: removed an unconditional login debug print that bypassed structured logging.

## 13. MULTI-TENANT SECURITY

Tenant context is required on protected tenant routes, and permission evaluation rejects cross-tenant access except explicit primary-tenant platform permissions or active support grants. Repositories and service lookups usually re-check `tenant_id`; branch-scoped users are constrained through shared helpers. S3 keys, notification events, signed document links and integration settings are tenant-bound.

Existing tests cover cross-tenant RBAC and live E2E isolation. Residual risk remains in 210 direct `session.get()` call sites: many correctly validate the returned row immediately, but this pattern is review-sensitive. Prefer tenant-scoped repository methods for new code and add a static/architecture test for tenant-owned models where practical.

## 14. TRANSACTION & DATA CONSISTENCY

Good boundaries:

- WhatsApp claims a row in a short transaction, performs the network call after releasing the claim transaction, then persists the result.
- Financial writes complete before delivery work; delivery failures do not roll back payment state.
- File upload uses compensating object deletion if DB metadata persistence fails.
- Appointment and consultation-invoice idempotency have DB-backed constraints/migrations.

Risks:

- Service-level commits make larger all-or-nothing orchestration difficult.
- Tenant onboarding performs several commits/compensations rather than one explicit unit of work.
- Object storage and DB state can diverge when compensation deletion itself fails; reconciliation scripts exist and must be scheduled/monitored.
- Some audit events commit after the primary domain commit, so an audit failure may not be atomic with the action.

## 15. PERFORMANCE ANALYSIS

Highest static risks are patient-intelligence dashboards/bulk actions, profit/revenue reports, billing list/detail, patient history, file optimization/synchronization, WhatsApp queue display context, and the broad report-worker cycle. Pagination and composite-index migrations exist for common lists, patient search and tenant list queries. Query-count regression tests cover invoices and several projections.

Potential N+1 patterns remain in display/context builders that call `session.get()` per event. Confirm through measured query counts before refactoring. Bulk patient-intelligence work uses a bounded limit but still runs synchronously in the worker cycle and can delay communication/report work.

## 16. SECURITY FINDINGS

CRITICAL: none confirmed after fixes.

HIGH:

- Provider response disclosure: WhatsApp error bodies and GraphQL error details could expose PHI/PII/provider internals. Fixed by discarding/safely normalizing responses and adding regression tests.
- Migration CLI deployment failure: documented Alembic invocation could not import `app`, blocking safe schema rollout. Fixed with explicit path configuration and CLI regression coverage.

MEDIUM:

- Redis-outage login limiting fails open; mitigate at ingress and alert operationally.
- No WhatsApp webhook signature/status implementation was found, so delivery/read state cannot be provider-confirmed.
- Signed clinical/financial delivery links may remain valid for up to 24 hours. Confirm this duration against privacy policy and provider-fetch requirements.
- GraphQL endpoint configuration is not restricted to public HTTPS at settings validation time. Treat the environment value as privileged and validate production deployment configuration.
- Global JSON logging trusts caller-provided `extra` values; continue enforcing sanitized metadata at every call site.

LOW:

- Root response advertises `/docs` even when production docs are disabled.
- Authorization cache revocation may lag by its configured 30-second TTL.
- Dependency files use pinned ranges rather than hash-locked Python dependencies.

## 17. BUGS FOUND

| Issue | Location/root cause | Impact | Fix/test |
| --- | --- | --- | --- |
| Alembic CLI cannot discover revisions | `backend/alembic/alembic.ini`, `env.py`; app path configured too late | Deployment/migration blocker | Added `prepend_sys_path`, reordered setup, CLI subprocess test |
| Login writes debug output | `identity/services/auth_service.py`; stray `print` | Unstructured operational output and possible future leakage | Removed; stdout regression test |
| WhatsApp logs provider body | messaging HTTP adapter | Possible PHI/credential/provider detail leakage | Body discarded; sensitive-body regression test |
| GraphQL exposes/unbounds provider response | `integrations/graphql_catalog.py` | Internal detail leak and memory pressure | Safe errors, 1 MiB limit, UTF-8 handling and three tests |
| Patient communications absent from API docs | `docs/api-permission-matrix.md` | Permission inventory drift; contract failure | Added exact route row; contract passes |
| Invoice performance fixture creates orphan invoices | billing performance test | False failure, unrealistic query behavior | Added valid patients |
| WhatsApp UI test races settings load | frontend settings test | Flaky deterministic-suite failure | Wait for enabled control before interaction |

## 18. CODE QUALITY / REFACTORING

High impact / low risk:

- Add a shared safe external-error normalization/logging helper.
- Add tenant-scoped `get_for_tenant` repository methods for remaining sensitive direct lookups.
- Make test fixtures enforce valid patient/tenant/branch references.
- Add GraphQL production URL validation and provider timeout/response metrics.

High impact / medium risk:

- Split patient-intelligence route/service into dashboard, rules, content, engagement and refresh units.
- Split the WhatsApp processor into claim, context, media, provider and result-state collaborators.
- Introduce explicit transaction/unit-of-work ownership; services should either commit or be composable, not both unpredictably.
- Separate report scheduling, notification processing and patient-intelligence refresh into independently scalable workers/queues.

High impact / high risk:

- Database-enforced tenant isolation/RLS would materially reduce IDOR risk but requires careful platform/support-access design and migration.
- Reworking all domain writes to outbox/unit-of-work semantics would improve atomicity but touches every major workflow.

## 19. TEST COVERAGE

`pytest-cov`/`coverage.py` is not installed in the backend environment, so no percentage is reported. A percentage would also be misleading while API tests cannot execute in this sandbox.

| Module | Unit | Integration/API | E2E | Missing/high-risk tests | Priority |
| --- | --- | --- | --- | --- | --- |
| Auth/RBAC/tenancy | Strong | Strong | Yes | Redis outage + ingress limit; cache revocation window | P0 |
| Patients | Strong | Strong | Yes | Concurrent duplicates, deletion/retention | P0 |
| Appointments/queue | Strong | Strong | Yes | Concurrent slot/token tests on PostgreSQL | P0 |
| Consultations | Strong | Strong | Yes | Sign/billing failure injection | P0 |
| Billing/payment | Strong | Strong | Yes | Concurrent adjustment/refund, gateway contract | P0 |
| Files/S3 | Strong fake/contract | Strong | Partial | Live isolated bucket lifecycle/failures | P0 |
| WhatsApp | Strong | Strong fake | Workflow E2E | Webhook/signature/provider sandbox | P0 |
| Lab/pharmacy | Good | Strong | Yes | Stock concurrency and GraphQL contract | P1 |
| Home care/IP/physio | Good | Strong | Yes | Multi-step rollback/failure injection | P1 |
| Reports/email | Good | Good | Limited | SMTP emulator and worker crash recovery | P1 |
| Patient intelligence | Good but concentrated | API | No dedicated live flow | Bulk load, query budget, retry/idempotency | P1 |
| Frontend | 178 passing | API helpers mocked | Playwright exists | Run Node 24 build and browser suites | P1 |

## 20. CHANGES IMPLEMENTED

1. Restored documented Alembic CLI operation and added a subprocess regression test.
2. Removed login debug stdout and added a regression test.
3. Prevented WhatsApp provider-body logging and added a sensitive-data regression test.
4. Added bounded, safe GraphQL provider handling and three new tests.
5. Completed the API permission inventory for patient communication history.
6. Repaired an invalid billing performance fixture.
7. Made the WhatsApp UI test wait for asynchronous settings readiness.
8. Added this production-readiness report.

No business rules or API response contracts were intentionally changed, except that unsafe GraphQL provider details are now replaced by safe 502 messages.

## 21. TEST RESULTS

| Check | Result |
| --- | --- |
| Targeted backend regressions | PASS: 13 |
| API documentation contract | PASS |
| Billing performance regression | PASS after valid fixture |
| Ruff backend/tests/e2e/scripts | PASS |
| Alembic revision discovery | PASS; one head `20260824_0127` |
| Frontend Vitest | PASS: 178/178 in 38 files |
| Frontend TypeScript | PASS |
| Frontend production build | BLOCKED: host Node 18.20.4; Next requires >=20.9 and repository requires Node 24 |
| Full backend pytest | BLOCKED: restricted runner hangs even a minimal FastAPI `TestClient` before requests |
| Backend non-API run | First 50 passed, then blocked at threadpool-dependent file test in this runner |
| Coverage report | NOT AVAILABLE: pytest-cov/coverage not installed |
| PostgreSQL/Uvicorn E2E | NOT RUN: Docker socket unavailable and no isolated E2E DB was started |
| Docker config | Local/production parsed; staging requires the intentionally absent `.env.staging` |

## 22. REMAINING RISKS

- The complete API and live PostgreSQL suites still need execution in supported CI before release.
- No measured production/staging p95, query time, pool wait or PgBouncer saturation sample was available; pool recommendations are therefore capacity estimates.
- WhatsApp has no inbound delivery/read webhook contract.
- Mixed commit ownership and cross-system compensation remain architectural consistency risks.
- The worker combines multiple operational responsibilities, so one slow domain can delay others.
- Legal retention/hold behavior is not uniformly evident for every DELETE endpoint; clinical and financial deletion policy needs a domain-by-domain legal review.
- Dependency/SCA, container image and IaC security scanners were not available in this local audit.

## 23. RECOMMENDED NEXT STEPS

1. Run the protected-branch gate in Node 24 and a thread-capable backend container: full pytest, Ruff, Vitest, typecheck and Next build.
2. Run `backend/scripts/run_backend_e2e.sh` against a disposable `_e2e` PostgreSQL database and the frontend Playwright critical suite.
3. Run PgBouncer `verify`, `sample` and controlled `saturate` against staging; capture request/query/pool p95 and tune admission/workers from evidence.
4. Add live isolated S3, Redis and SMTP contract jobs and a WhatsApp provider sandbox/webhook contract.
5. Add PostgreSQL concurrency tests for appointment conflicts, queue tokens, pharmacy stock and financial adjustment execution.
6. Decide and document acceptable signed-link TTL, auth-cache revocation lag, Redis-outage login behavior and deletion/retention policy.
7. Refactor transaction ownership and the largest patient-intelligence/WhatsApp modules in small behavior-preserving slices.
