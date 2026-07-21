from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.billing.models import (
    BillingAdjustmentRequest,
    DoctorFeeRule,
    Invoice,
    InvoiceItem,
)


class BillingAdjustmentRepository:
    """Reads invoice and adjustment rows used by adjustment workflows."""

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

    def get_invoice_for_update(self, invoice_id: str) -> Invoice | None:
        return self.session.exec(
            select(Invoice).where(Invoice.id == invoice_id).with_for_update()
        ).first()

    def get_first_invoice_item(
        self, *, tenant_id: str, invoice_id: str
    ) -> InvoiceItem | None:
        return self.session.exec(
            select(InvoiceItem)
            .where(
                InvoiceItem.tenant_id == tenant_id,
                InvoiceItem.invoice_id == invoice_id,
            )
            .order_by(InvoiceItem.created_at)
        ).first()

    def get_fee_rule(self, fee_rule_id: str) -> DoctorFeeRule | None:
        return self.session.get(DoctorFeeRule, fee_rule_id)

    def get_appointment(self, appointment_id: str) -> Appointment | None:
        return self.session.get(Appointment, appointment_id)

    def get_adjustment_request(
        self, request_id: str
    ) -> BillingAdjustmentRequest | None:
        return self.session.get(BillingAdjustmentRequest, request_id)

    def get_adjustment_request_for_tenant(
        self, *, tenant_id: str, request_id: str
    ) -> BillingAdjustmentRequest | None:
        row = self.get_adjustment_request(request_id)
        if not row or row.tenant_id != tenant_id:
            return None
        return row

    def get_adjustment_request_for_update(
        self, request_id: str
    ) -> BillingAdjustmentRequest | None:
        return self.session.exec(
            select(BillingAdjustmentRequest)
            .where(BillingAdjustmentRequest.id == request_id)
            .with_for_update()
        ).first()
