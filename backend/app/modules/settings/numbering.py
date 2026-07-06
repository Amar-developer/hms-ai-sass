import re
from typing import Any

from sqlalchemy import text
from sqlmodel import Session, select

from app.modules.settings.models import DocumentSequence, SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.tenants.models import now_utc


DEFAULT_ENTITY_CODES: dict[str, str] = {
    "user": "USR",
    "patient": "PAT",
    "doctor": "DOC",
    "department": "DEPT",
    "lab_order": "LAB",
    "pharmacy_issue": "PHM",
    "invoice": "INV",
    "ip_admission": "IP",
    "physiotherapy_case": "PHY",
    "home_care_booking": "HC",
    "supplier": "SUP",
    "credit_note": "CN",
}

ENTITY_COLUMNS: dict[str, tuple[str, str, bool]] = {
    "user": ("user", "user_number", True),
    "patient": ("patient", "patient_number", True),
    "doctor": ("practitioner", "practitioner_number", False),
    "department": ("department", "code", True),
    "lab_order": ("laborder", "lab_order_number", True),
    "pharmacy_issue": ("pharmacyissue", "issue_number", True),
    "invoice": ("invoice", "invoice_number", True),
    "ip_admission": ("ipadmission", "admission_number", True),
    "physiotherapy_case": ("physiotherapycase", "case_number", True),
    "home_care_booking": ("homecarebooking", "booking_number", True),
    "supplier": ("pharmacysupplier", "supplier_number", False),
    "credit_note": ("creditnote", "credit_note_number", False),
}


def normalize_numbering_rules(
    value: Any, fallback_prefix: str | None = None
) -> dict[str, Any]:
    rules = value if isinstance(value, dict) else {}
    entities = rules.get("entities") if isinstance(rules.get("entities"), dict) else {}
    prefix = (
        str(rules.get("prefix") or fallback_prefix or "INV").strip().upper() or "INV"
    )
    try:
        digits = int(rules.get("digits") or 5)
    except (TypeError, ValueError):
        digits = 5
    digits = min(max(digits, 1), 12)
    return {
        "prefix": prefix,
        "digits": digits,
        "entities": {
            **DEFAULT_ENTITY_CODES,
            **{
                str(k): str(v).strip().upper()
                for k, v in entities.items()
                if str(v).strip()
            },
        },
    }


def format_document_number(
    prefix: str,
    entity_code: str,
    value: int,
    digits: int,
    *,
    include_entity_code: bool = True,
) -> str:
    if not include_entity_code:
        return f"{prefix.strip().upper()}-{value:0{digits}d}"
    return f"{prefix.strip().upper()}-{entity_code.strip().upper()}-{value:0{digits}d}"


def resolve_numbering_rules(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None = None,
) -> dict[str, Any]:
    invoice_prefix, _invoice_scope, _invoice_scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="invoice",
        key=SettingKey.INVOICE_PREFIX,
        branch_id=branch_id,
    )
    value, scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="numbering",
        key=SettingKey.NUMBERING_RULES,
        branch_id=branch_id,
    )
    rules = normalize_numbering_rules(
        value if scope is not None else {},
        str(invoice_prefix or "INV"),
    )
    rules["is_configured"] = scope is not None
    return rules


def _max_existing_number(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    table_name: str,
    column_name: str,
    branch_scoped: bool,
    prefix: str,
    entity_code: str,
    include_entity_code: bool,
) -> int:
    if include_entity_code:
        pattern = re.compile(
            rf"^{re.escape(prefix)}-{re.escape(entity_code)}-(\d+)$", re.IGNORECASE
        )
    else:
        pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$", re.IGNORECASE)
    sql = f'select "{column_name}" from "{table_name}" where tenant_id = :tenant_id and "{column_name}" is not null'
    params: dict[str, str] = {"tenant_id": tenant_id}
    if branch_scoped and branch_id:
        sql += ' and "branch_id" = :branch_id'
        params["branch_id"] = branch_id
    rows = session.exec(text(sql), params=params).all()
    maximum = 0
    for row in rows:
        value = row[0] if isinstance(row, tuple) else row
        match = pattern.match(str(value or ""))
        if match:
            maximum = max(maximum, int(match.group(1)))
    return maximum


def next_document_number(
    session: Session,
    *,
    tenant_id: str,
    entity: str,
    branch_id: str | None = None,
    prefix_override: str | None = None,
) -> str:
    if entity not in ENTITY_COLUMNS:
        raise ValueError(f"Unsupported numbered entity: {entity}")
    rules = resolve_numbering_rules(session, tenant_id=tenant_id, branch_id=branch_id)
    entity_code = (
        str(rules["entities"].get(entity) or DEFAULT_ENTITY_CODES[entity])
        .strip()
        .upper()
    )
    use_configured_format = bool(rules.get("is_configured"))
    if use_configured_format:
        prefix = str(prefix_override or rules["prefix"]).strip().upper()
        digits = int(rules["digits"])
    else:
        prefix = str(
            prefix_override or rules["prefix"] if entity == "invoice" else entity_code
        )
        prefix = prefix.strip().upper()
        digits = 6
    table_name, column_name, branch_scoped = ENTITY_COLUMNS[entity]
    sequence_branch_id = branch_id if branch_scoped and branch_id else ""
    # Lock the sequence row so concurrent number generation is serialized —
    # two invoices can never read the same current_value and mint a duplicate
    # number. (FOR UPDATE is a no-op on SQLite test DBs, which are single-writer
    # anyway.) The unique constraint on (tenant, branch, entity) covers the
    # first-time creation race.
    sequence = session.exec(
        select(DocumentSequence)
        .where(
            DocumentSequence.tenant_id == tenant_id,
            DocumentSequence.branch_id == sequence_branch_id,
            DocumentSequence.entity == entity,
        )
        .with_for_update()
    ).first()
    if not sequence:
        sequence = DocumentSequence(
            tenant_id=tenant_id,
            branch_id=sequence_branch_id,
            entity=entity,
            prefix=prefix,
            entity_code=entity_code,
            digits=digits,
            current_value=_max_existing_number(
                session,
                tenant_id=tenant_id,
                branch_id=sequence_branch_id,
                table_name=table_name,
                column_name=column_name,
                branch_scoped=branch_scoped,
                prefix=prefix,
                entity_code=entity_code,
                include_entity_code=use_configured_format,
            ),
        )
    sequence.prefix = prefix
    sequence.entity_code = entity_code
    sequence.digits = digits
    sequence.current_value += 1
    sequence.updated_at = now_utc()
    session.add(sequence)
    session.flush()
    return format_document_number(
        prefix,
        entity_code,
        sequence.current_value,
        digits,
        include_entity_code=use_configured_format,
    )
