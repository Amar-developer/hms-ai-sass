from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.modules.appointments.models import Appointment
from app.modules.consultations.models import Consultation
from app.modules.consultations.repositories import (
    ConsultationBillingReferenceRepository,
)


class ConsultationBillingService:
    """Handles membership-covered auto-invoicing for signed consultations."""

    def __init__(self, session: Session):
        self.session = session
        self.billing_refs = ConsultationBillingReferenceRepository(session)

    def auto_invoice_membership_consultation(
        self,
        *,
        tenant_id: str,
        consultation: Consultation,
        appointment: Appointment | None,
        actor_user_id: str | None,
    ) -> None:
        """Generate the ₹0 consultation invoice for membership-covered visits.

        A free (membership) consultation otherwise never gets an invoice, because
        reception only generates one when collecting payment. Without it the
        membership benefit is never recorded (``used_consultations`` stays put) and
        there is no billing entry. When a signed consultation is fully covered by an
        active membership's free-consultation benefit, create that invoice here so
        the benefit usage and billing trail are captured. Paid / partially-covered
        visits are left to the existing manual reception flow.
        """
        # Local imports avoid module-load cycles between consultation and billing.
        from app.modules.billing.services.consultation_invoice import (
            create_consultation_invoice,
        )
        from app.modules.patient_subscriptions.service import (
            active_patient_enrollment,
            benefit_preview,
            sync_free_item_usage_from_invoices,
        )

        if not appointment or appointment.tenant_id != tenant_id:
            return
        # Lock the consultation row so a concurrent sign-with-invoice request for
        # the same consultation serializes on the check-then-insert below; the
        # unique index on Invoice.consultation_id is the DB-level backstop if it
        # doesn't (e.g. a second process not going through this lock).
        self.billing_refs.lock_consultation(consultation.id)
        if self.billing_refs.has_existing_consultation_invoice(
            tenant_id=tenant_id, consultation_id=consultation.id
        ):
            return
        membership = active_patient_enrollment(
            self.session,
            tenant_id=tenant_id,
            patient_id=consultation.patient_id,
        )
        if not membership:
            return
        enrollment, plan = membership
        sync_free_item_usage_from_invoices(self.session, enrollment, plan)
        # A probe subtotal tells us whether a free-consultation benefit applies for
        # this department right now (the consultation branch returns the full
        # subtotal as the discount when a free slot remains).
        preview = benefit_preview(
            plan=plan,
            enrollment=enrollment,
            service_type="consultation",
            item_ids=[],
            subtotal_amount=100,
            department_id=appointment.department_id,
            session=self.session,
        )
        if int(preview.get("discount_amount") or 0) <= 0:
            return
        try:
            create_consultation_invoice(
                self.session,
                appointment=appointment,
                consultation_id=consultation.id,
                discount_amount=0,
                created_by_user_id=actor_user_id,
            )
        except IntegrityError:
            # A concurrent request already created the invoice for this
            # consultation between our check above and this insert; the unique
            # index on Invoice.consultation_id caught it. Nothing left to do.
            self.session.rollback()
