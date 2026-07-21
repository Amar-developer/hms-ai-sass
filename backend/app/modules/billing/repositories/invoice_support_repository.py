from sqlmodel import Session, select

from app.modules.billing.models import (
    Invoice,
    InvoiceItem,
)
from app.modules.lab.models import LabOrderItem
from app.modules.pharmacy.models import PharmacyIssueItem


class BillingInvoiceSupportRepository:
    """Reads invoice support data for membership and item workflows."""

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

    def get_invoice_item_for_invoice(
        self, *, tenant_id: str, invoice_id: str, item_id: str
    ) -> InvoiceItem | None:
        item = self.session.get(InvoiceItem, item_id)
        if not item or item.tenant_id != tenant_id or item.invoice_id != invoice_id:
            return None
        return item

    def list_lab_order_items(self, invoice: Invoice) -> list[LabOrderItem]:
        if not invoice.lab_order_id:
            return []
        return list(
            self.session.exec(
                select(LabOrderItem).where(
                    LabOrderItem.tenant_id == invoice.tenant_id,
                    LabOrderItem.lab_order_id == invoice.lab_order_id,
                )
            ).all()
        )

    def list_pharmacy_issue_items(self, invoice: Invoice) -> list[PharmacyIssueItem]:
        if not invoice.pharmacy_issue_id:
            return []
        return list(
            self.session.exec(
                select(PharmacyIssueItem).where(
                    PharmacyIssueItem.tenant_id == invoice.tenant_id,
                    PharmacyIssueItem.pharmacy_issue_id == invoice.pharmacy_issue_id,
                )
            ).all()
        )
