#!/usr/bin/env bash
# Runs the automatic GitHub Actions quality gates in the same order CI runs
# them, so failures surface here instead of after a push. Nothing in this
# script is wired into a git hook — it's meant to be run manually, on demand,
# before `git push`.
#
# One-time prerequisites (see backend/README.md "Before Pushing Backend
# Changes" and docker-compose.yml):
#   docker compose up -d postgres redis
#   PGPASSWORD=medizinhub_dev createdb -h 127.0.0.1 -p 5433 -U medizinhub medizinhub_e2e
#   PGPASSWORD=medizinhub_dev createdb -h 127.0.0.1 -p 5433 -U medizinhub medizinhub_frontend_e2e
#   cd frontend && npx playwright install --with-deps chromium firefox webkit
#
# Usage:
#   bash scripts/verify_all.sh                 # automatic CI gates
#   bash scripts/verify_all.sh --fast          # skip backend E2E
#   bash scripts/verify_all.sh --frontend-e2e  # also run manual Playwright E2E

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAST=0
FRONTEND_E2E=0
CREATED_STAGING_ENV=0

cleanup() {
  if [[ "${CREATED_STAGING_ENV}" -eq 1 ]]; then
    rm -f "${ROOT_DIR}/.env.staging"
  fi
}
trap cleanup EXIT

for arg in "$@"; do
  case "${arg}" in
    --fast)
      FAST=1
      ;;
    --frontend-e2e)
      FRONTEND_E2E=1
      ;;
    *)
      echo "Unknown option: ${arg}" >&2
      echo "Usage: bash scripts/verify_all.sh [--fast] [--frontend-e2e]" >&2
      exit 2
      ;;
  esac
done

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
if [[ ! -f "${ROOT_DIR}/.env.staging" ]]; then
  cp "${ROOT_DIR}/.env.staging.example" "${ROOT_DIR}/.env.staging"
  CREATED_STAGING_ENV=1
fi
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
  echo "--fast: skipped backend E2E. Run without --fast before pushing."
  exit 0
fi

step "5/6 Backend E2E (live Postgres-backed API suite)"
bash "${ROOT_DIR}/backend/scripts/run_backend_e2e.sh"

if [[ "${FRONTEND_E2E}" -eq 1 ]]; then
  step "6/6 Frontend E2E (Playwright, cross-browser) — manual CI workflow"
  (cd "${ROOT_DIR}/frontend" && npm run test:e2e:cross-browser)
else
  echo ""
  echo "Skipped frontend Playwright E2E. It is manual-only in CI now."
  echo "Run with --frontend-e2e when you specifically want browser E2E coverage."
fi

echo ""
echo "All checks passed locally — safe to push."
