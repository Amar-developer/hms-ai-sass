from sqlmodel import Session, select

from app.modules.billing.models import Invoice, InvoiceItem, Payment
from app.modules.lab.models import LabOrderItem
from app.modules.patients.models import Patient
from app.modules.pharmacy.models import PharmacyIssueItem
from app.modules.tenants.models import Branch, Tenant


class BillingInvoiceSupportRepository:
    """Reads invoice support data for receipt, membership, and item workflows."""

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

    def get_tenant(self, tenant_id: str) -> Tenant | None:
        return self.session.get(Tenant, tenant_id)

    def get_branch(self, branch_id: str) -> Branch | None:
        return self.session.get(Branch, branch_id)

    def get_patient(self, patient_id: str) -> Patient | None:
        return self.session.get(Patient, patient_id)

    def list_invoice_items(self, invoice: Invoice) -> list[InvoiceItem]:
        return list(
            self.session.exec(
                select(InvoiceItem)
                .where(
                    InvoiceItem.tenant_id == invoice.tenant_id,
                    InvoiceItem.invoice_id == invoice.id,
                )
                .order_by(InvoiceItem.created_at)
            ).all()
        )

    def list_payments(self, invoice: Invoice) -> list[Payment]:
        return list(
            self.session.exec(
                select(Payment)
                .where(
                    Payment.tenant_id == invoice.tenant_id,
                    Payment.invoice_id == invoice.id,
                )
                .order_by(Payment.collected_at)
            ).all()
        )

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
