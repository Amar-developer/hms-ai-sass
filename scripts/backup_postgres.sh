#!/usr/bin/env bash
# Stream an encrypted PostgreSQL custom-format backup to an operator directory.

set -euo pipefail
umask 077

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=""
OUTPUT_DIR=""
APPLICATION_COMMIT="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"

usage() {
  echo "Usage: $0 --output-dir ABSOLUTE_PATH [--compose-file FILE] [--env-file FILE] [--application-commit SHA]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir) OUTPUT_DIR="${2:-}"; shift 2 ;;
    --compose-file) COMPOSE_FILE="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --application-commit) APPLICATION_COMMIT="${2:-}"; shift 2 ;;
    *) usage; exit 2 ;;
  esac
done

if [[ -z "${OUTPUT_DIR}" || "${OUTPUT_DIR}" != /* || "${OUTPUT_DIR}" == "/" ]]; then
  echo "--output-dir must be an explicit absolute directory other than /" >&2
  exit 2
fi
backup_passphrase="${MEDIZINHUB_BACKUP_PASSPHRASE:-}"
if [[ ${#backup_passphrase} -lt 16 ]]; then
  echo "MEDIZINHUB_BACKUP_PASSPHRASE must contain at least 16 characters" >&2
  exit 2
fi
if [[ ! "${APPLICATION_COMMIT}" =~ ^([0-9a-fA-F]{7,64}|unknown)$ ]]; then
  echo "--application-commit must be a Git SHA or 'unknown'" >&2
  exit 2
fi

mkdir -p "${OUTPUT_DIR}"
OUTPUT_DIR="$(cd "${OUTPUT_DIR}" && pwd -P)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="medizinhub-postgres-${timestamp}"
temporary="${OUTPUT_DIR}/.${name}.tmp"
backup="${OUTPUT_DIR}/${name}.dump.enc"
cleanup() { rm -f -- "${temporary}"; }
trap cleanup EXIT

compose=(docker compose)
if [[ -n "${ENV_FILE}" ]]; then compose+=(--env-file "${ENV_FILE}"); fi
compose+=(-f "${COMPOSE_FILE}")

"${compose[@]}" exec -T postgres sh -eu -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
      -pass env:MEDIZINHUB_BACKUP_PASSPHRASE > "${temporary}"

test -s "${temporary}"
mv "${temporary}" "${backup}"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:MEDIZINHUB_BACKUP_PASSPHRASE -in "${backup}" \
  | "${compose[@]}" exec -T postgres pg_restore --list >/dev/null

(
  cd "${OUTPUT_DIR}"
  sha256sum "$(basename "${backup}")" > "$(basename "${backup}").sha256"
)
cat > "${backup}.manifest.json" <<EOF
{"created_at":"${timestamp}","application_commit":"${APPLICATION_COMMIT}","format":"postgres-custom+aes-256-cbc-pbkdf2","encrypted":true}
EOF

echo "Encrypted backup created and archive-verified: ${backup}"
