# Backend Test Suite Audit

## A. Existing Problems Found

The suite already protects many production-critical behaviors, but the audit found these maintainability issues:

- Repository list/filter/sort/filter-option behavior was split across several small files with repeated setup patterns.
- Some test files are organized by historical feature additions rather than testing layer or business capability.
- Several large workflow files mix API, integration, and unit-style tests. This is acceptable for now because they protect business flows, but future additions should be placed more deliberately.
- The previous module-coverage guard encouraged tests because a module folder exists. That is not a useful backend quality rule, so it was removed.
- `test_engine` uses SQLite for speed. This is useful locally, but PostgreSQL-specific constraints, query behavior, indexes, and transaction semantics still need CI/staging coverage.
- External integrations are mostly tested with fakes and monkeypatches, which is appropriate, but true provider contract checks remain operational/manual unless a sandbox is configured.
- Full E2E coverage is intentionally limited; critical flows are present, but broad browser/API E2E should stay selective to avoid flakiness.

No test-order dependency or arbitrary sleep problem was found in the touched suite. Mocking is concentrated around external providers, startup environment, and isolated permission decisions.

## B. Tests Removed Or Consolidated

Consolidated repeated repository filter tests:

| Old test file | New location | Reason |
| --- | --- | --- |
| `test_appointment_consultation_filters.py` | `test_repository_filters.py` | Same repository filter/sort/filter-option concern as other list repositories |
| `test_expenses_filters.py` | `test_repository_filters.py` | Same repository list behavior, repeated tenant/branch/user setup |
| `test_practitioner_filters.py` | `test_repository_filters.py` | Became the base consolidated repository suite |
| `test_tenant_reference_filters.py` | `test_repository_filters.py` | Same tenant reference repository filter/sort/options behavior |

The consolidation keeps the business assertions intact while reducing file scatter.

Removed low-value coverage-count test:

| Removed test | Reason |
| --- | --- |
| `test_every_backend_module_has_pytest_coverage_reference` | It rewarded coverage references by folder name rather than meaningful business, security, integration, or API behavior |

## C. Tests Added

No new business tests were added during the second pass. The only added test from the first pass was removed because it did not match the desired testing strategy.

Added documentation:

- `backend/tests/README.md`

Purpose:

- Explains where tests should live.
- Defines business-logic checklist.
- Documents duplicate avoidance and when to choose unit, integration, API, or E2E coverage.
- Warns against tests that only prove a class, module, or pass-through wrapper exists.

## D. Final Test Structure

Current top-level test organization remains flat to match the existing project convention, with focused consolidation where it had clear value:

```text
backend/tests/
  README.md
  TEST_AUDIT.md
  conftest.py
  test_activity_log.py
  test_alembic_migrations.py
  test_api_docs.py
  test_appointments_queue.py
  test_architecture.py
  test_automated_access_matrix.py
  test_billing.py
  test_billing_adjustment_permissions.py
  test_billing_decimal_precision.py
  test_billing_invoice_list_performance.py
  test_comment_mentions.py
  test_consultations.py
  test_document_delivery.py
  test_document_optimization.py
  test_error_logs.py
  test_file_storage.py
  test_files.py
  test_foundation.py
  test_home_care.py
  test_identity_auth.py
  test_in_app_notifications.py
  test_invoice_receipt_delivery.py
  test_ip_management.py
  test_item_catalog_validation.py
  test_lab_pharmacy.py
  test_membership_discount_exclusivity.py
  test_module_entitlements.py
  test_notification_triggers.py
  test_notifications.py
  test_observability.py
  test_patient_intelligence.py
  test_patient_membership_rules.py
  test_patient_mobile_validation.py
  test_patients.py
  test_payments_settlements.py
  test_permission_catalog.py
  test_pgbouncer_admin.py
  test_pharmacy_dosing.py
  test_physiotherapy.py
  test_platform.py
  test_practitioners.py
  test_privileged_access.py
  test_rbac_enforcement.py
  test_repository_filters.py
  test_report_calculations.py
  test_report_discount_breakdown.py
  test_reports_email.py
  test_reports_snapshots.py
  test_role_permission_scope.py
  test_seed_demo.py
  test_settings.py
  test_settings_catalog_filters.py
  test_sidebar_setting_removed.py
  test_storage_metrics.py
  test_subscriptions_enforcement.py
  test_tenant_onboarding.py
  test_whatsapp_field_catalog.py
  test_whatsapp_gateway.py
  test_whatsapp_integration_settings.py
  test_whatsapp_notification_queue.py
  test_workflow_schema_validation.py
  test_zzz_role_keys_patch.py
```

## E. Business-Critical Coverage

| Domain | Critical behavior protected |
| --- | --- |
| Authentication and identity | bootstrap, login, logout, password change, session revocation, rate limiting, tenant admin scope, privileged access |
| Authorization and RBAC | permission catalog, role scope, inactive role behavior, tenant isolation, branch scope, module entitlements |
| Patients | registration, mobile uniqueness, search, filter/sort, tenant isolation, summary audit, Patient 360 contact rules |
| Appointments and queue | booking, duplicate prevention, doctor scoping, queue transitions, emergency/requeue/no-show behavior, appointment grid projection |
| Consultations | draft/update/sign/addendum behavior, signed immutability, tenant/doctor scope, audit |
| Billing and payments | invoice generation, fee rules, taxes, discounts, offers, membership exclusions, payments, refunds, credit notes, settlements |
| Lab and pharmacy | catalog, order/issue workflows, consultation conversion, result/report/file behavior, stock and dispense logic |
| IP, physiotherapy, home care | admission/care/invoice workflows, physio sessions/equipment/invoices, home-care booking/visit/invoice workflows |
| Files and documents | upload/list/update/delete, tenant isolation, S3/local storage contracts, optimization, signed delivery, legal hold |
| Notifications and integrations | in-app, WhatsApp, SMS boundary, email/report delivery, retries, idempotency, provider failure handling |
| Reports and observability | monthly snapshots, revenue/profit calculations, email jobs, runtime metrics, error logs, PgBouncer helper behavior |

This audit does not treat "one test per module" as a quality target. Coverage should follow risk: money, permissions, tenant/branch isolation, workflow state, external side effects, and patient data integrity.

## F. Production Code Changes

No production code was changed for this audit/refactor.

## G. Execution Results

Focused verification run after refactor:

```text
backend/.venv/bin/pytest backend/tests/test_repository_filters.py backend/tests/test_architecture.py backend/tests/test_api_docs.py -q
18 passed
```

Collection verification:

```text
backend/.venv/bin/pytest backend/tests --collect-only -q
564 tests collected
```

Lint verification:

```text
backend/.venv/bin/ruff check backend/tests/test_repository_filters.py backend/tests/test_architecture.py
All checks passed
```

Full-suite runtime limitation in this local session:

```text
backend/.venv/bin/pytest backend/tests -q
Started successfully but was interrupted after an extended quiet run with no failure output captured.
```

The same quiet long-run behavior appeared when trying a broad business-critical subset covering auth, RBAC, patients, appointments, and consultations. Run the full suite in CI or a longer local shell before merge so slow tests can complete naturally.

## H. Remaining Risks And Future Improvements

- Add a PostgreSQL-backed CI job for database behavior that SQLite cannot faithfully catch.
- Gradually split very large files such as billing, lab/pharmacy, identity, and patient intelligence by testing layer only when editing those areas.
- Add shared factories only after repeated setup blocks become painful enough to justify the abstraction.
- Keep E2E coverage focused on critical workflows rather than expanding for coverage percentage.
- Add provider sandbox/contract checks for WhatsApp/SMS/email only if the team has stable non-production credentials.
- Consider markers such as `unit`, `integration`, `api`, and `slow` after the suite needs selective CI timing control.
