import re

from app.modules.lab.schemas import (
    LabConsultationReferralItemRead,
    LabConsultationReferralRead,
)


def fallback_lab_referrals(text: str | None) -> list[dict[str, str | None]]:
    rows = []
    for line in re.split(r"\n|,(?=\s*[A-Za-z0-9])", text or ""):
        parts = [part.strip() for part in line.split("|")]
        if not parts:
            continue
        if parts[0].lower() in {"lab", "scan"} and len(parts) > 1:
            item_name = parts[1]
            priority = parts[2] if len(parts) > 2 else "routine"
            instructions = parts[3] if len(parts) > 3 else None
        else:
            item_name = parts[0]
            priority = "routine"
            instructions = None
        if item_name:
            rows.append(
                {
                    "item_name": item_name,
                    "priority": priority,
                    "instructions": instructions,
                }
            )
    return rows


def build_lab_consultation_referral_reads(
    rows: list[tuple[object, object, object, object | None, object | None]],
    referral_rows: list[object],
) -> list[LabConsultationReferralRead]:
    referrals_by_consultation: dict[str, list[object]] = {}
    for row in referral_rows:
        referrals_by_consultation.setdefault(row.consultation_id, []).append(row)

    result: list[LabConsultationReferralRead] = []
    for consultation, appointment, patient, queue_entry, practitioner in rows:
        structured = referrals_by_consultation.get(consultation.id, [])
        referrals = [
            LabConsultationReferralItemRead(
                referral_type=row.referral_type,
                item_name=row.item_name,
                priority=row.priority,
                instructions=row.instructions,
            )
            for row in structured
        ] or [
            LabConsultationReferralItemRead(referral_type="lab", **row)
            for row in fallback_lab_referrals(consultation.lab_referral_text)
        ]
        result.append(
            LabConsultationReferralRead(
                id=appointment.id,
                consultation_id=consultation.id,
                appointment_id=appointment.id,
                appointment_number=appointment.appointment_number,
                patient_id=patient.id,
                patient_name=patient.full_name,
                practitioner_name=(practitioner.full_name if practitioner else None),
                token_number=queue_entry.token_number if queue_entry else None,
                lab_referral_text=consultation.lab_referral_text or "",
                status=consultation.status.value,
                referrals=referrals,
                signed_at=consultation.signed_at,
                created_at=consultation.created_at,
            )
        )
    return result


_fallback_lab_referrals = fallback_lab_referrals
