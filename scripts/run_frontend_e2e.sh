#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
# Prefer the repository virtualenv for local runs, while still working in CI
# where setup-python installs dependencies into the job's regular `python`.
if [[ -n "${PYTHON_BIN:-}" ]]; then
  :
elif [[ -x "${BACKEND_DIR}/.venv/bin/python" ]]; then
  PYTHON_BIN="${BACKEND_DIR}/.venv/bin/python"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
else
  echo "Python is required to run frontend E2E tests (set PYTHON_BIN to override)." >&2
  exit 127
fi
if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1 && [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "Configured PYTHON_BIN is not executable: ${PYTHON_BIN}" >&2
  exit 127
fi
E2E_DATABASE_URL="${MEDIZINHUB_FRONTEND_E2E_DATABASE_URL:-postgresql+psycopg://medizinhub:medizinhub_dev@127.0.0.1:5433/medizinhub_frontend_e2e}"
API_BASE_URL="${MEDIZINHUB_FRONTEND_E2E_API_URL:-http://127.0.0.1:8091/api/v1}"
FRONTEND_BASE_URL="${MEDIZINHUB_FRONTEND_E2E_BASE_URL:-http://127.0.0.1:3100}"
BACKEND_LOG="$(mktemp -t medizinhub-frontend-e2e-backend.XXXXXX.log)"
FRONTEND_LOG="$(mktemp -t medizinhub-frontend-e2e-web.XXXXXX.log)"
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  exit_code=$?
  for pid in "${FRONTEND_PID}" "${BACKEND_PID}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  if [[ "${exit_code}" -ne 0 ]]; then
    echo "Frontend E2E backend log:"
    tail -n 250 "${BACKEND_LOG}" || true
    echo "Frontend E2E Next.js log:"
    tail -n 250 "${FRONTEND_LOG}" || true
  elif ! find "${FRONTEND_DIR}/test-results" -type f \
    \( -name 'trace.zip' -o -name '*.webm' -o -name 'test-failed-*.png' \) \
    -print -quit 2>/dev/null | grep -q .; then
    # A successful retry exits with status 0 but still has diagnostics from
    # its failed attempt. Preserve those artifacts; remove output only for a
    # clean first-pass run.
    rm -rf "${FRONTEND_DIR}/playwright-report" "${FRONTEND_DIR}/test-results"
  fi
  rm -f "${BACKEND_LOG}" "${FRONTEND_LOG}"
  exit "${exit_code}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Never mix diagnostics from a previous invocation into this run's report.
rm -rf "${FRONTEND_DIR}/playwright-report" "${FRONTEND_DIR}/test-results"

CONNECTION_OUTPUT="$("${PYTHON_BIN}" - "${E2E_DATABASE_URL}" "${API_BASE_URL}" "${FRONTEND_BASE_URL}" <<'PY'
import sys
from sqlalchemy.engine import make_url
from urllib.parse import urlsplit

database_url = make_url(sys.argv[1])
if not database_url.drivername.startswith("postgresql"):
    raise SystemExit(
        "Refusing to reset database: frontend E2E database URL must use PostgreSQL"
    )
database_name = database_url.database or ""
if not database_name.endswith("_e2e"):
    raise SystemExit(
        "Refusing to reset database: frontend E2E database name must end with '_e2e'"
    )

api_url = urlsplit(sys.argv[2])
frontend_url = urlsplit(sys.argv[3])
for label, value in (("API", api_url), ("frontend", frontend_url)):
    if value.scheme != "http" or value.hostname not in {"127.0.0.1", "localhost"}:
        raise SystemExit(f"{label} E2E URL must use localhost over HTTP")

print(database_url.host or "127.0.0.1")
print(database_url.port or 5432)
print(database_name)
print(database_url.username or "")
print(database_url.password or "")
print(api_url.hostname)
print(api_url.port or 80)
print(frontend_url.hostname)
print(frontend_url.port or 80)
PY
)"
readarray -t CONNECTION_PARTS <<<"${CONNECTION_OUTPUT}"

DB_HOST="${CONNECTION_PARTS[0]}"
DB_PORT="${CONNECTION_PARTS[1]}"
DB_NAME="${CONNECTION_PARTS[2]}"
DB_USER="${CONNECTION_PARTS[3]}"
DB_PASSWORD="${CONNECTION_PARTS[4]}"
API_HOST="${CONNECTION_PARTS[5]}"
API_PORT="${CONNECTION_PARTS[6]}"
FRONTEND_HOST="${CONNECTION_PARTS[7]}"
FRONTEND_PORT="${CONNECTION_PARTS[8]}"

DB_HOST="${DB_HOST}" DB_PORT="${DB_PORT}" DB_NAME="${DB_NAME}" \
DB_USER="${DB_USER}" DB_PASSWORD="${DB_PASSWORD}" \
"${PYTHON_BIN}" - <<'PY'
import os
import psycopg

with psycopg.connect(
    host=os.environ["DB_HOST"],
    port=int(os.environ["DB_PORT"]),
    dbname=os.environ["DB_NAME"],
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    autocommit=True,
) as connection:
    with connection.cursor() as cursor:
        cursor.execute("DROP SCHEMA IF EXISTS public CASCADE")
        cursor.execute("CREATE SCHEMA public")
PY

export MEDIZINHUB_DATABASE_URL="${E2E_DATABASE_URL}"
export MEDIZINHUB_ENVIRONMENT="e2e"
export MEDIZINHUB_AUTO_CREATE_TABLES="false"
export MEDIZINHUB_ENABLE_DOCS="false"
export MEDIZINHUB_MEDICINE_GRAPHQL_URL=""
export MEDIZINHUB_CORS_ORIGINS="[\"${FRONTEND_BASE_URL}\"]"
export MEDIZINHUB_FRONTEND_E2E_API_URL="${API_BASE_URL}"
export MEDIZINHUB_FRONTEND_E2E_BASE_URL="${FRONTEND_BASE_URL}"
export NEXT_PUBLIC_MEDIZINHUB_API_URL="${API_BASE_URL}"
export NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS="false"

cd "${BACKEND_DIR}"
PYTHONPATH=. "${PYTHON_BIN}" -m alembic -c alembic/alembic.ini upgrade head
PYTHONPATH=. "${PYTHON_BIN}" -m uvicorn app.main:app \
  --host "${API_HOST}" --port "${API_PORT}" >"${BACKEND_LOG}" 2>&1 &
BACKEND_PID=$!

"${PYTHON_BIN}" - "${API_BASE_URL}" "${BACKEND_PID}" <<'PY'
import os
import sys
import time
from urllib.request import urlopen

base_url = sys.argv[1].removesuffix("/api/v1")
pid = int(sys.argv[2])
last_error = None
for _ in range(90):
    try:
        with urlopen(f"{base_url}/health", timeout=2) as response:
            if response.status == 200:
                raise SystemExit(0)
    except OSError as exc:
        last_error = exc
    try:
        os.kill(pid, 0)
    except OSError:
        raise SystemExit("FastAPI exited before becoming healthy")
    time.sleep(1)
raise SystemExit(f"FastAPI did not become healthy: {last_error}")
PY

cd "${FRONTEND_DIR}"
rm -rf e2e/.state
npm run build
npm run start -- --hostname "${FRONTEND_HOST}" --port "${FRONTEND_PORT}" \
  >"${FRONTEND_LOG}" 2>&1 &
FRONTEND_PID=$!

"${PYTHON_BIN}" - "${FRONTEND_BASE_URL}" "${FRONTEND_PID}" <<'PY'
import os
import sys
import time
from urllib.request import urlopen

url = sys.argv[1]
pid = int(sys.argv[2])
last_error = None
for _ in range(90):
    try:
        with urlopen(url, timeout=2) as response:
            if response.status == 200:
                raise SystemExit(0)
    except OSError as exc:
        last_error = exc
    try:
        os.kill(pid, 0)
    except OSError:
        raise SystemExit("Next.js exited before becoming healthy")
    time.sleep(1)
raise SystemExit(f"Next.js did not become healthy: {last_error}")
PY

npx playwright test "$@"
