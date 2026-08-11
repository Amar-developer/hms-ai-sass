"""Patient contact-number selection.

A patient can carry a primary mobile and an alternate/secondary mobile.
Legacy records may still have a guardian mobile, but family relationships and
membership sharing are explicit patient-to-patient links now — never inferred
from alternate or guardian phone numbers.
"""

PATIENT_DISPLAY_MOBILE_FIELDS = ("mobile", "alternate_mobile")
PATIENT_WHATSAPP_MOBILE_FIELDS = (
    "mobile",
    "alternate_mobile",
    "guardian_mobile",
)


def _numbers_from_fields(patient: object | None, fields: tuple[str, ...]) -> list[str]:
    if patient is None:
        return []
    numbers: list[str] = []
    for field in fields:
        value = str(getattr(patient, field, "") or "").strip()
        # Skip blanks and any number already collected, so a patient whose
        # alternate repeats their primary is still contacted only once.
        if value and value not in numbers:
            numbers.append(value)
    return numbers


def patient_contact_numbers(patient: object | None) -> list[str]:
    """Current patient-owned numbers: primary, then secondary/alternate."""
    return _numbers_from_fields(patient, PATIENT_DISPLAY_MOBILE_FIELDS)


def patient_contact_mobile(patient: object | None) -> str | None:
    """The single best patient-owned number: primary, else alternate."""
    numbers = patient_contact_numbers(patient)
    return numbers[0] if numbers else None


def patient_whatsapp_numbers(patient: object | None) -> list[str]:
    """WhatsApp fallback order.

    Primary mobile is preferred, alternate mobile is the patient's secondary
    number, and guardian_mobile is a legacy-only fallback for old records where
    no patient-owned number exists.
    """
    return _numbers_from_fields(patient, PATIENT_WHATSAPP_MOBILE_FIELDS)
