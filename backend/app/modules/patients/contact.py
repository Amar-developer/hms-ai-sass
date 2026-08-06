"""Which number to actually reach a patient on.

A patient can carry a primary mobile, an alternate mobile, and a guardian's
mobile. Display (patient lists, invoices, appointments) and outbound
messaging must agree on one answer, and messaging must pick exactly one
number so a patient never receives the same invoice or reminder twice.
"""

PATIENT_MOBILE_FIELDS = ("mobile", "alternate_mobile", "guardian_mobile")


def patient_contact_numbers(patient: object | None) -> list[str]:
    """Every usable number for a patient, in fallback priority order."""
    if patient is None:
        return []
    numbers: list[str] = []
    for field in PATIENT_MOBILE_FIELDS:
        value = str(getattr(patient, field, "") or "").strip()
        # Skip blanks and any number already collected, so a patient whose
        # alternate repeats their primary is still contacted only once.
        if value and value not in numbers:
            numbers.append(value)
    return numbers


def patient_contact_mobile(patient: object | None) -> str | None:
    """The single best number for a patient: primary, else alternate, else
    guardian. Returns None when the patient has no number at all."""
    numbers = patient_contact_numbers(patient)
    return numbers[0] if numbers else None
