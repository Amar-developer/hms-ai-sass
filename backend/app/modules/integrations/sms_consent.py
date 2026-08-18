"""Send-time SMS consent and destination policy.

Kept separate from the WhatsApp policy module: the two channels have different
regulators, different opt-out semantics, and different destination rules, so a
shared helper would couple decisions that must be allowed to diverge.
"""

from sqlmodel import Session

from app.infrastructure.integrations.ports.messaging import normalize_mobile_number
from app.modules.integrations.whatsapp_consent import (
    patient_for_notification_resource,
)
from app.modules.patients.contact import patient_whatsapp_numbers
from app.modules.patients.models import Patient, SmsConsentStatus


# Service templates ride on the patient's own transaction, so a patient who has
# never been asked is still reachable. Anything the tenant classifies as needing
# a recorded opt-in is checked against EXPLICIT_CONSENT_CLASSIFICATIONS instead.
EXPLICIT_CONSENT_CLASSIFICATIONS = {"service_explicit", "promotional"}


def patient_for_sms_resource(
    session: Session,
    *,
    tenant_id: str,
    resource_type: str,
    resource_id: str,
) -> Patient | None:
    return patient_for_notification_resource(
        session,
        tenant_id=tenant_id,
        resource_type=resource_type,
        resource_id=resource_id,
    )


def patient_allows_sms(patient: Patient | None, *, classification: str) -> bool:
    """Whether this patient may receive an SMS of this classification."""
    if patient is None:
        return True
    if patient.sms_consent_status == SmsConsentStatus.OPTED_OUT:
        return False
    if classification in EXPLICIT_CONSENT_CLASSIFICATIONS:
        return patient.sms_consent_status == SmsConsentStatus.OPTED_IN
    return True


def patient_sms_destination(
    patient: Patient | None, default_country_code: str
) -> str | None:
    """The single number to text.

    Returns on the first number that normalizes so a patient with several
    numbers on file receives one copy of a message, not one per number.
    """
    if not patient:
        return None
    for value in patient_whatsapp_numbers(patient):
        try:
            return normalize_mobile_number(value, default_country_code)
        except ValueError:
            continue
    return None


def patient_sms_language(patient: Patient | None) -> str:
    preferred = str(patient.sms_preferred_language if patient else "").strip()
    return preferred if preferred and preferred != "tenant_default" else "en"
