from app.modules.billing.models import Invoice, InvoiceItem


class ReportInvoiceClassifier:
    """Classify invoices for report section strategies."""

    _HOME_VISIT_MARKERS = ("home_visit", "home visit", "hv_")

    def __init__(
        self, invoice_items_by_invoice: dict[str, list[InvoiceItem]] | None = None
    ):
        self.invoice_items_by_invoice = invoice_items_by_invoice or {}

    def classify(self, invoice: Invoice) -> str:
        if invoice.pharmacy_issue_id:
            return "pharmacy"
        if invoice.lab_order_id:
            return "lab"
        if invoice.physiotherapy_case_id:
            return "physiotherapy"
        if invoice.ip_admission_id:
            return "ip"
        if invoice.home_care_booking_id:
            fields = " ".join(
                f"{item.external_slug or ''} {item.description or ''}"
                for item in self.invoice_items_by_invoice.get(invoice.id, [])
            ).lower()
            if any(marker in fields for marker in self._HOME_VISIT_MARKERS):
                return "home_visit"
            return "home_care"
        return "consultation"

    @staticmethod
    def label(value: str) -> str:
        return {
            "pharmacy": "Pharmacy",
            "lab": "Lab / Service",
            "physiotherapy": "Physiotherapy",
            "ip": "IP",
            "home_visit": "Home Visit",
            "home_care": "Home Care",
        }.get(value, "Consultation")
