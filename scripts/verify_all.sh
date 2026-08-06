#!/usr/bin/env bash
# Runs every check GitHub Actions runs, in the same order CI runs them, so
# failures (backend regressions, Playwright locator issues, etc.) surface
# here instead of after a push. Nothing in this script is wired into a git
# hook — it's meant to be run manually, on demand, before `git push`.
#
# One-time prerequisites (see backend/README.md "Before Pushing Backend
# Changes" and docker-compose.yml):
#   docker compose up -d postgres redis
#   PGPASSWORD=medizinhub_dev createdb -h 127.0.0.1 -p 5433 -U medizinhub medizinhub_e2e
#   PGPASSWORD=medizinhub_dev createdb -h 127.0.0.1 -p 5433 -U medizinhub medizinhub_frontend_e2e
#   cd frontend && npx playwright install --with-deps chromium firefox webkit
#
# Usage:
#   bash scripts/verify_all.sh          # full run, matches CI exactly
#   bash scripts/verify_all.sh --fast   # skip both E2E suites (unit/lint/build only)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAST=0
if [[ "${1:-}" == "--fast" ]]; then
  FAST=1
fi

step() {
  echo ""
  echo "==> $1"
}

step "1/6 Release configuration and recovery-script validation"
git -C "${ROOT_DIR}" diff --check
node "${ROOT_DIR}/scripts/version.mjs" check
bash -n "${ROOT_DIR}/scripts/backup_postgres.sh"
bash -n "${ROOT_DIR}/scripts/verify_postgres_restore.sh"
docker compose --env-file "${ROOT_DIR}/.env.production.example" \
  -f "${ROOT_DIR}/docker-compose.yml" config --quiet
docker compose --env-file "${ROOT_DIR}/.env.staging.example" \
  -f "${ROOT_DIR}/docker-compose.staging.yml" config --quiet
docker compose --env-file "${ROOT_DIR}/.env.example" \
  -f "${ROOT_DIR}/docker-compose.local.yml" config --quiet

step "2/6 Backend lint (ruff)"
"${ROOT_DIR}/backend/.venv/bin/ruff" check \
  "${ROOT_DIR}/backend/app" "${ROOT_DIR}/backend/tests" "${ROOT_DIR}/backend/e2e"

step "3/6 Backend unit tests (pytest)"
"${ROOT_DIR}/backend/.venv/bin/pytest" "${ROOT_DIR}/backend/tests" -q

step "4/6 Frontend unit tests + typecheck + build"
(cd "${ROOT_DIR}/frontend" && npm test && npm run typecheck && npm run build)

if [[ "${FAST}" -eq 1 ]]; then
  echo ""
  echo "--fast: skipped backend E2E and frontend E2E. Run without --fast before pushing."
  exit 0
fi

step "5/6 Backend E2E (live Postgres-backed API suite)"
bash "${ROOT_DIR}/backend/scripts/run_backend_e2e.sh"

step "6/6 Frontend E2E (Playwright, cross-browser, @critical) — same job as CI"
(cd "${ROOT_DIR}/frontend" && npm run test:e2e:cross-browser)

echo ""
echo "All checks passed locally — safe to push."
