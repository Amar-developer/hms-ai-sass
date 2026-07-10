from sqlmodel import Session, select

from app.modules.billing.models import Invoice, Payment
from app.modules.patients.models import Patient


class BillingPaymentRepository:
    """Reads invoice, payment, and patient rows used by payment workflows."""

    def __init__(self, session: Session):
        self.session = session

    def get_invoice(self, invoice_id: str) -> Invoice | None:
        return self.session.get(Invoice, invoice_id)

    def get_invoice_for_tenant(
        self, *, tenant_id: str, invoice_id: str
    ) -> Invoice | None:
        invoice = self.get_invoice(invoice_id)
        if not invoice or invoice.tenant_id != tenant_id:
            return None
        return invoice

    def get_payment_for_update(self, payment_id: str) -> Payment | None:
        return self.session.exec(
            select(Payment).where(Payment.id == payment_id).with_for_update()
        ).first()

    def get_patient(self, patient_id: str) -> Patient | None:
        return self.session.get(Patient, patient_id)
