#!/usr/bin/env bash
# Restore an encrypted backup into a disposable, suffix-protected database.

set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=""
BACKUP_FILE=""
VERIFY_DB="medizinhub_$(date -u +%Y%m%dT%H%M%SZ)_restore_verify"

usage() {
  echo "Usage: $0 --backup ABSOLUTE_FILE [--database NAME_restore_verify] [--compose-file FILE] [--env-file FILE]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup) BACKUP_FILE="${2:-}"; shift 2 ;;
    --database) VERIFY_DB="${2:-}"; shift 2 ;;
    --compose-file) COMPOSE_FILE="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    *) usage; exit 2 ;;
  esac
done

if [[ -z "${BACKUP_FILE}" || "${BACKUP_FILE}" != /* || ! -f "${BACKUP_FILE}" ]]; then
  echo "--backup must be an existing absolute file" >&2
  exit 2
fi
if [[ ! "${VERIFY_DB}" =~ ^[a-zA-Z0-9_]+_restore_verify$ ]]; then
  echo "Verification database must contain only letters/numbers/_ and end with _restore_verify" >&2
  exit 2
fi
backup_passphrase="${MEDIZINHUB_BACKUP_PASSPHRASE:-}"
if [[ ${#backup_passphrase} -lt 16 ]]; then
  echo "MEDIZINHUB_BACKUP_PASSPHRASE must contain at least 16 characters" >&2
  exit 2
fi

compose=(docker compose)
if [[ -n "${ENV_FILE}" ]]; then compose+=(--env-file "${ENV_FILE}"); fi
compose+=(-f "${COMPOSE_FILE}")

checksum="${BACKUP_FILE}.sha256"
if [[ -f "${checksum}" ]]; then
  (cd "$(dirname "${BACKUP_FILE}")" && sha256sum -c "$(basename "${checksum}")")
fi

drop_verify_database() {
  "${compose[@]}" exec -T postgres sh -eu -c \
    'dropdb -U "$POSTGRES_USER" --if-exists --force "$1"' sh "${VERIFY_DB}" >/dev/null
}
trap 'drop_verify_database >/dev/null 2>&1 || true' EXIT
drop_verify_database
"${compose[@]}" exec -T postgres sh -eu -c \
  'createdb -U "$POSTGRES_USER" "$1"' sh "${VERIFY_DB}"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:MEDIZINHUB_BACKUP_PASSPHRASE -in "${BACKUP_FILE}" \
  | "${compose[@]}" exec -T postgres sh -eu -c \
      'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-privileges --exit-on-error' \
      sh "${VERIFY_DB}"

table_count="$("${compose[@]}" exec -T postgres sh -eu -c \
  'psql -U "$POSTGRES_USER" -d "$1" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\''"' \
  sh "${VERIFY_DB}")"
revision_count="$("${compose[@]}" exec -T postgres sh -eu -c \
  'psql -U "$POSTGRES_USER" -d "$1" -Atc "SELECT count(*) FROM alembic_version"' \
  sh "${VERIFY_DB}")"

if [[ "${table_count}" -lt 1 || "${revision_count}" -lt 1 ]]; then
  echo "Restore verification failed: schema or Alembic revision is missing" >&2
  exit 1
fi
echo "Restore verified in isolated database ${VERIFY_DB}: tables=${table_count}; alembic_rows=${revision_count}"
