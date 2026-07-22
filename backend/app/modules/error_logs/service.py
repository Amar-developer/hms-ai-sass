import hashlib
import json
import re
from datetime import timedelta
from typing import Any

from sqlmodel import Session

from app.modules.error_logs.models import ErrorLog
from app.modules.error_logs.repositories import ErrorLogRepository
from app.modules.tenants.models import now_utc

# Mirrors Frappe's Log Settings default retention (90 days) for the Error
# Log doctype: entries older than this are routine noise, not an audit
# trail, so they're purged rather than kept forever.
ERROR_LOG_RETENTION_DAYS = 90


SECRET_PATTERN = re.compile(
    r"(password|token|secret|authorization)([\"'\s:=]+)[^\s,\"'}]+",
    re.IGNORECASE,
)
BEARER_PATTERN = re.compile(r"Bearer\s+[A-Za-z0-9._~+/-]+", re.IGNORECASE)
EMAIL_PATTERN = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
NUMERIC_PATTERN = re.compile(r"\d+(\.\d+)?")


def sanitize_log_text(value: Any, max_length: int) -> str:
    text = str(value or "")
    text = BEARER_PATTERN.sub("Bearer [redacted]", text)
    text = EMAIL_PATTERN.sub("[email]", text)
    text = SECRET_PATTERN.sub(r"\1\2[redacted]", text)
    return text[:max_length]


def safe_metadata_json(value: str | dict[str, Any] | None) -> str:
    try:
        payload = json.loads(value) if isinstance(value, str) else value or {}
    except (json.JSONDecodeError, TypeError):
        payload = {}
    sanitized = sanitize_log_text(
        json.dumps(payload, default=str, separators=(",", ":")), 8000
    )
    return sanitized or "{}"


def error_fingerprint(
    *,
    source: str,
    category: str,
    event: str,
    message: str,
    route: str | None,
    status_code: int | None,
) -> str:
    # Numbers are normalized out of the message before hashing: generated
    # messages often embed volatile data (request durations, counts), which
    # would otherwise give every occurrence of the same issue a distinct
    # fingerprint and defeat deduplication (see request.slow, whose message
    # embeds duration_ms and would never match a prior occurrence).
    normalized_message = NUMERIC_PATTERN.sub("#", message)
    raw = "|".join(
        [
            source,
            category,
            event,
            normalized_message,
            route or "",
            str(status_code or ""),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8", errors="ignore")).hexdigest()


def _is_routine_noise(*, status_code: int | None, event: str) -> bool:
    # 401s are normal control flow (expired session, login race, logged-out
    # polling) rather than bugs — Frappe's Error Log doctype excludes the
    # same class of "not authenticated" outcome for this reason. A genuine
    # slow request is still worth recording even if it also 401'd.
    if event == "request.slow":
        return False
    return status_code == 401


def record_error_log(
    session: Session,
    *,
    tenant_id: str | None,
    source: str,
    level: str,
    category: str,
    event: str,
    message: str,
    branch_id: str | None = None,
    user_id: str | None = None,
    module: str | None = None,
    route: str | None = None,
    method: str | None = None,
    status_code: int | None = None,
    request_id: str | None = None,
    stack_trace: str | None = None,
    metadata_json: str | dict[str, Any] | None = None,
    commit: bool = True,
) -> ErrorLog | None:
    if _is_routine_noise(status_code=status_code, event=event):
        return None
    clean_source = sanitize_log_text(source, 40) or "backend"
    clean_level = sanitize_log_text(level, 20).lower() or "error"
    clean_category = sanitize_log_text(category, 60) or "application"
    clean_event = sanitize_log_text(event, 160) or "application.error"
    clean_message = sanitize_log_text(message, 4000) or "Unknown application error"
    clean_route = sanitize_log_text(route, 500) or None
    clean_stack = sanitize_log_text(stack_trace, 12000) or None
    clean_metadata = safe_metadata_json(metadata_json)
    fingerprint = error_fingerprint(
        source=clean_source,
        category=clean_category,
        event=clean_event,
        message=clean_message,
        route=clean_route,
        status_code=status_code,
    )
    repository = ErrorLogRepository(session)
    now = now_utc()
    existing = repository.find_open_duplicate(tenant_id, fingerprint)
    if existing:
        row = repository.touch(
            existing,
            now=now,
            request_id=sanitize_log_text(request_id, 100) or None,
            user_id=user_id,
            stack_trace=clean_stack,
            metadata_json=clean_metadata,
            message=clean_message,
        )
    else:
        row = ErrorLog(
            tenant_id=tenant_id,
            branch_id=branch_id,
            user_id=user_id,
            source=clean_source,
            level=clean_level,
            category=clean_category,
            event=clean_event,
            message=clean_message,
            module=sanitize_log_text(module, 120) or None,
            route=clean_route,
            method=sanitize_log_text(method, 12).upper() or None,
            status_code=status_code,
            request_id=sanitize_log_text(request_id, 100) or None,
            stack_trace=clean_stack,
            metadata_json=clean_metadata,
            fingerprint=fingerprint,
            first_seen_at=now,
            last_seen_at=now,
            created_at=now,
        )
        repository.add(row)
    if commit:
        session.commit()
        session.refresh(row)
    return row


def purge_expired_error_logs(
    session: Session, *, retention_days: int = ERROR_LOG_RETENTION_DAYS
) -> int:
    cutoff = now_utc() - timedelta(days=retention_days)
    deleted = ErrorLogRepository(session).delete_expired(cutoff)
    if deleted:
        session.commit()
    return deleted


def resolve_error_log(
    session: Session,
    row: ErrorLog,
    *,
    resolved: bool,
    resolution_note: str | None,
    actor_user_id: str,
) -> ErrorLog:
    row.is_resolved = resolved
    row.resolution_note = sanitize_log_text(resolution_note, 2000) or None
    row.resolved_by_user_id = actor_user_id if resolved else None
    row.resolved_at = now_utc() if resolved else None
    session.add(row)
    session.commit()
    session.refresh(row)
    return row
