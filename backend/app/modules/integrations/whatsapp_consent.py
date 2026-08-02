from sqlmodel import Session

from app.modules.appointments.models import Appointment
from app.modules.billing.models import CreditNote, Invoice
from app.modules.consultations.models import Consultation
from app.modules.lab.models import LabOrder
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
    patient = session.get(Patient, patient_id or "")
    return patient if patient and patient.tenant_id == tenant_id else None


def patient_allows_whatsapp(patient: Patient | None) -> bool:
    return not patient or (
        patient.whatsapp_consent_status != WhatsAppConsentStatus.OPTED_OUT
    )


def patient_notification_destination(
    patient: Patient | None, default_country_code: str
) -> str | None:
    """Return the first valid primary/alternate destination in priority order."""
    if not patient:
        return None
    for value in (patient.mobile, patient.alternate_mobile):
        normalized = str(value or "").strip()
        if not normalized:
            continue
        try:
            return normalize_mobile_number(normalized, default_country_code)
        except ValueError:
            continue
    return None


def patient_notification_language(patient: Patient | None) -> str:
    """Treat legacy tenant-default preferences as English for patient messages."""
    preferred = str(patient.whatsapp_preferred_language if patient else "").strip()
    return preferred if preferred and preferred != "tenant_default" else "en"
