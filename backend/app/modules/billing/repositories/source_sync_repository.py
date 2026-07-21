from sqlmodel import Session

from app.modules.billing.models import Invoice
from app.modules.home_care.models import HomeCareBooking
from app.modules.patient_subscriptions.models import PatientSubscriptionEnrollment
from app.modules.pharmacy.models import PharmacyIssue
from app.modules.physiotherapy.models import PhysiotherapyCase


class BillingSourceSyncRepository:
    """Reads source records used when syncing or reversing invoice source state."""

    def __init__(self, session: Session):
        self.session = session

    def get_physiotherapy_case_for_invoice(
        self, invoice: Invoice
    ) -> PhysiotherapyCase | None:
        if not invoice.physiotherapy_case_id:
            return None
        case = self.session.get(PhysiotherapyCase, invoice.physiotherapy_case_id)
        if not case or case.tenant_id != invoice.tenant_id:
            return None
        return case

    def get_home_care_booking_for_invoice(
        self, invoice: Invoice
    ) -> HomeCareBooking | None:
        if not invoice.home_care_booking_id:
            return None
        booking = self.session.get(HomeCareBooking, invoice.home_care_booking_id)
        if not booking or booking.tenant_id != invoice.tenant_id:
            return None
        return booking

    def get_patient_subscription_enrollment_for_invoice(
        self, invoice: Invoice
    ) -> PatientSubscriptionEnrollment | None:
        if not invoice.patient_subscription_enrollment_id:
            return None
        enrollment = self.session.get(
            PatientSubscriptionEnrollment,
            invoice.patient_subscription_enrollment_id,
        )
        if not enrollment or enrollment.tenant_id != invoice.tenant_id:
            return None
        return enrollment

    def get_pharmacy_issue_for_invoice(self, invoice: Invoice) -> PharmacyIssue | None:
        if not invoice.pharmacy_issue_id:
            return None
        issue = self.session.get(PharmacyIssue, invoice.pharmacy_issue_id)
        if not issue or issue.tenant_id != invoice.tenant_id:
            return None
        return issue
