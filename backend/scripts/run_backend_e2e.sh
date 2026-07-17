#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
PYTHON_BIN="${PYTHON_BIN:-python}"
E2E_DATABASE_URL="${MEDIZINHUB_E2E_DATABASE_URL:-postgresql+psycopg://medizinhub:medizinhub_dev@127.0.0.1:5433/medizinhub_e2e}"
E2E_BASE_URL="${MEDIZINHUB_E2E_BASE_URL:-http://127.0.0.1:8090/api/v1}"
SERVER_LOG="$(mktemp -t medizinhub-backend-e2e.XXXXXX.log)"
SERVER_PID=""

cleanup() {
  exit_code=$?
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  if [[ "${exit_code}" -ne 0 ]]; then
    echo "Backend E2E server log:"
    tail -n 300 "${SERVER_LOG}" || true
  fi
  rm -f "${SERVER_LOG}"
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

export MEDIZINHUB_E2E_DATABASE_URL="${E2E_DATABASE_URL}"
export MEDIZINHUB_E2E_BASE_URL="${E2E_BASE_URL}"
export MEDIZINHUB_DATABASE_URL="${E2E_DATABASE_URL}"
export MEDIZINHUB_ENVIRONMENT="e2e"
export MEDIZINHUB_AUTO_CREATE_TABLES="false"
export MEDIZINHUB_ENABLE_DOCS="false"
export MEDIZINHUB_MEDICINE_GRAPHQL_URL=""

readarray -t CONNECTION_PARTS < <(
  "${PYTHON_BIN}" - "${E2E_DATABASE_URL}" "${E2E_BASE_URL}" <<'PY'
import sys
from sqlalchemy.engine import make_url
from urllib.parse import urlsplit

database_url = make_url(sys.argv[1])
database_name = database_url.database or ""
if not database_name.endswith("_e2e"):
    raise SystemExit(
        "Refusing to reset database: E2E database name must end with '_e2e'"
    )

base_url = urlsplit(sys.argv[2])
if base_url.scheme not in {"http", "https"} or not base_url.hostname:
    raise SystemExit("MEDIZINHUB_E2E_BASE_URL must be a valid HTTP URL")

print(database_url.host or "127.0.0.1")
print(database_url.port or 5432)
print(database_name)
print(database_url.username or "")
print(database_url.password or "")
print(base_url.hostname)
print(base_url.port or (443 if base_url.scheme == "https" else 80))
PY
)

DB_HOST="${CONNECTION_PARTS[0]}"
DB_PORT="${CONNECTION_PARTS[1]}"
DB_NAME="${CONNECTION_PARTS[2]}"
DB_USER="${CONNECTION_PARTS[3]}"
DB_PASSWORD="${CONNECTION_PARTS[4]}"
API_HOST="${CONNECTION_PARTS[5]}"
API_PORT="${CONNECTION_PARTS[6]}"

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

cd "${BACKEND_DIR}"
PYTHONPATH=. "${PYTHON_BIN}" -m alembic -c alembic/alembic.ini upgrade head

PYTHONPATH=. "${PYTHON_BIN}" -m uvicorn app.main:app \
  --host "${API_HOST}" \
  --port "${API_PORT}" \
  >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

"${PYTHON_BIN}" - "${E2E_BASE_URL}" "${SERVER_PID}" <<'PY'
import sys
import time
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen

base_url = urlsplit(sys.argv[1])
health_url = f"{base_url.scheme}://{base_url.netloc}/health"
server_pid = int(sys.argv[2])
last_error = None

for _ in range(60):
    try:
        with urlopen(health_url, timeout=2) as response:
            if response.status == 200:
                raise SystemExit(0)
    except (OSError, URLError) as exc:
        last_error = exc
    try:
        import os

        os.kill(server_pid, 0)
    except OSError:
        raise SystemExit("Uvicorn exited before becoming healthy")
    time.sleep(1)

raise SystemExit(f"Backend did not become healthy at {health_url}: {last_error}")
PY

"${PYTHON_BIN}" -m pytest "${BACKEND_DIR}/e2e" -m e2e -q
