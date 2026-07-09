import re

from sqlmodel import Session

from app.modules.pharmacy.dosing import prescription_quantity
from app.modules.pharmacy.models import PharmacyIssue, PharmacyIssueItem
from app.modules.pharmacy.services.catalog import find_catalog_medicine


def fallback_medicine_rows(text: str | None) -> list[dict[str, str | None]]:
    rows = []
    for line in re.split(r"\n+", text or ""):
        parts = [part.strip() for part in line.split("|")]
        if not parts or not parts[0]:
            continue
        rows.append(
            {
                "medicine_name": parts[0],
                "dosage": parts[1] if len(parts) > 1 else None,
                "frequency": parts[2] if len(parts) > 2 else None,
                "duration": parts[3] if len(parts) > 3 else None,
                "instructions": parts[4] if len(parts) > 4 else None,
            }
        )
    return rows


def _looks_like_frequency(value: str | None) -> bool:
    text = (value or "").strip().lower()
    return bool(re.match(r"^\d+\s*[-–]\s*\d+\s*[-–]\s*\d+$", text)) or text in {
        "od",
        "bd",
        "tds",
        "qid",
        "hs",
        "sos",
        "daily",
        "once daily",
        "twice daily",
    }


def _looks_like_duration(value: str | None) -> bool:
    return bool(
        re.search(
            r"\b\d+\s*(d|day|days|week|weeks|month|months)\b",
            value or "",
            flags=re.IGNORECASE,
        )
    )


def normalize_medicine_schedule(
    row: dict[str, str | None],
) -> dict[str, str | None]:
    if (
        _looks_like_frequency(row.get("dosage"))
        and _looks_like_duration(row.get("frequency"))
        and not _looks_like_duration(row.get("duration"))
    ):
        return {
            **row,
            "dosage": None,
            "frequency": row.get("dosage"),
            "duration": row.get("frequency"),
            "instructions": row.get("duration") or row.get("instructions"),
        }
    return row


def add_consultation_issue_items(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    issue: PharmacyIssue,
    medicines,
    prescription_text: str | None,
) -> None:
    rows = [
        {
            "medicine_name": med.medicine_name,
            "dosage": med.dosage,
            "frequency": med.frequency,
            "duration": med.duration,
            "instructions": med.instructions,
        }
        for med in medicines
    ] or fallback_medicine_rows(prescription_text)
    rows = [normalize_medicine_schedule(row) for row in rows]
    total = 0
    names = []
    for med in rows:
        medicine_name = str(med["medicine_name"] or "").strip()
        if not medicine_name:
            continue
        catalog = find_catalog_medicine(session, tenant_id, branch_id, medicine_name)
        unit_price = catalog.default_sale_price if catalog else 0
        quantity = prescription_quantity(
            str(med.get("dosage") or ""),
            str(med.get("frequency") or ""),
            str(med.get("duration") or ""),
        )
        total += unit_price * quantity
        names.append(catalog.name if catalog else medicine_name)
        session.add(
            PharmacyIssueItem(
                tenant_id=tenant_id,
                branch_id=issue.branch_id,
                pharmacy_issue_id=issue.id,
                medicine_id=catalog.id if catalog else None,
                medicine_name=catalog.name if catalog else medicine_name,
                quantity=quantity,
                unit_price=unit_price,
            )
        )
    if rows:
        summary_lines = []
        for row in rows:
            parts = [
                str(part or "").strip()
                for part in (
                    row.get("medicine_name"),
                    row.get("dosage"),
                    row.get("frequency"),
                    row.get("duration"),
                    row.get("instructions"),
                )
                if str(part or "").strip()
            ]
            if parts:
                summary_lines.append(" | ".join(parts))
        issue.medicine_text = "\n".join(summary_lines) or ", ".join(names)
    if rows and issue.amount == 0:
        issue.amount = total
        session.add(issue)
