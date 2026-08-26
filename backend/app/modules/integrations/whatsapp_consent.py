from sqlmodel import Session

from app.modules.appointments.models import Appointment
from app.modules.billing.models import CreditNote, Invoice
from app.modules.consultations.models import Consultation
from app.modules.home_care.models import HomeCareBooking
from app.modules.lab.models import LabOrder
from app.modules.patients.contact import patient_whatsapp_numbers
from app.modules.patients.models import Patient, WhatsAppConsentStatus
from app.infrastructure.integrations.adapters.messaging.http_template import (
    normalize_mobile_number,
)


def patient_for_notification_resource(
    session: Session,
    *,
    tenant_id: str,
    resource_type: str,
    resource_id: str,
) -> Patient | None:
    patient_id = None
    if resource_type == "patient":
        patient_id = resource_id
    elif resource_type == "appointment":
        row = session.get(Appointment, resource_id)
        patient_id = row.patient_id if row and row.tenant_id == tenant_id else None
    elif resource_type == "invoice":
        row = session.get(Invoice, resource_id)
        patient_id = row.patient_id if row and row.tenant_id == tenant_id else None
    elif resource_type == "credit_note":
        credit = session.get(CreditNote, resource_id)
        invoice = (
            session.get(Invoice, credit.invoice_id)
            if credit and credit.tenant_id == tenant_id
            else None
        )
        patient_id = (
            invoice.patient_id if invoice and invoice.tenant_id == tenant_id else None
        )
    elif resource_type == "lab_order":
        row = session.get(LabOrder, resource_id)
        patient_id = row.patient_id if row and row.tenant_id == tenant_id else None
    elif resource_type == "consultation":
        row = session.get(Consultation, resource_id)
        patient_id = row.patient_id if row and row.tenant_id == tenant_id else None
    elif resource_type == "home_care_booking":
        row = session.get(HomeCareBooking, resource_id)
        patient_id = row.patient_id if row and row.tenant_id == tenant_id else None
    elif resource_type == "patient_engagement_action":
        # Local import avoids making the general integration policy module own
        # the optional Patient Intelligence plugin at import time.
        from app.modules.patient_intelligence.models import PatientEngagementAction

        row = session.get(PatientEngagementAction, resource_id)
        patient_id = row.patient_id if row and row.tenant_id == tenant_id else None
    patient = session.get(Patient, patient_id or "")
    return patient if patient and patient.tenant_id == tenant_id else None


def patient_allows_whatsapp(patient: Patient | None) -> bool:
    return not patient or (
        patient.whatsapp_consent_status != WhatsAppConsentStatus.OPTED_OUT
    )


def patient_allows_engagement_whatsapp(patient: Patient | None) -> bool:
    """Intelligence-driven engagement requires explicit, recorded consent."""
    return bool(
        patient and patient.whatsapp_consent_status == WhatsAppConsentStatus.OPTED_IN
    )


def patient_notification_destination(
    patient: Patient | None, default_country_code: str
) -> str | None:
    """The one number to message.

    Priority is primary mobile → alternate/secondary mobile → legacy guardian
    mobile. Alternate mobile is not a family relationship; family recipients
    are modelled separately through patient family relationship links.

    Returns as soon as a number normalizes, so a patient who has several
    numbers on file still receives a single copy of each message rather than
    one per number.
    """
    if not patient:
        return None
    for value in patient_whatsapp_numbers(patient):
        try:
            return normalize_mobile_number(value, default_country_code)
        except ValueError:
            continue
    return None


def patient_notification_language(patient: Patient | None) -> str:
    """Treat legacy tenant-default preferences as English for patient messages."""
    preferred = str(patient.whatsapp_preferred_language if patient else "").strip()
    return preferred if preferred and preferred != "tenant_default" else "en"
