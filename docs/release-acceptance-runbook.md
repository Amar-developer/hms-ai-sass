# Release Acceptance Runbook

Phase 16 makes deployment acceptance an executable gate instead of relying on
someone refreshing the browser after a release.

## Automated staging gate

Every successful push to `develop` deploys the production images with staging
configuration and then verifies:

- backend root health;
- versioned API health;
- database readiness;
- expected version, Git commit, build timestamp, and environment;
- frontend reachability;
- a bounded 30-request health baseline at concurrency 5.

The workflow fails when readiness is degraded, the wrong image was deployed,
the frontend is unavailable, a probe exceeds three seconds, the health baseline
has any error, or its p95 exceeds one second. The JSON report and load summary
remain in the GitHub Actions deployment log as release evidence.

Production deployment runs the same identity, health, readiness, and frontend
checks. It deliberately does not run a load test against live users.

## Manual staging verification

Run on the staging host from the repository root:

```bash
python3 backend/scripts/verify_deployment.py \
  --api-origin http://127.0.0.1:8081 \
  --frontend-origin http://127.0.0.1:3001 \
  --expected-version "$(tr -d '\r\n' < VERSION)" \
  --expected-commit "$(git rev-parse --short=12 HEAD)" \
  --expected-environment staging
```

Remote operator machines must use HTTPS origins. Plain HTTP is accepted only
for localhost because it does not leave the deployment host.

Then run the existing critical backend/frontend E2E suites against the staging
test tenant. Do not point state-changing E2E tests at production.

## Release evidence

For a pilot release, record:

- version and commit;
- CI and deployment workflow links;
- deployment-verifier JSON result;
- bounded load-gate result;
- latest encrypted backup timestamp;
- latest monthly restore-drill record;
- critical workflow E2E result;
- approver and release time.

Automated checks establish technical readiness. The release is not fully
approved until the restore drill and clinic workflow checks have real recorded
results.
