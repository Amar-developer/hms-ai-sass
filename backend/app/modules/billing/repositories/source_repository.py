from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.billing.models import DiscountApproval, Invoice, InvoiceItem
from app.modules.consultations.models import Consultation
from app.modules.lab.models import LabOrder, LabOrderItem, LabTestCatalog
from app.modules.patients.models import Patient
from app.modules.pharmacy.models import (
    MedicineCatalog,
    PharmacyIssue,
    PharmacyIssueItem,
)


class BillingSourceRepository:
    """Reads source-domain records used to create and sync billing invoices."""

    def __init__(self, session: Session):
        self.session = session

    def get_consultation(self, consultation_id: str) -> Consultation | None:
        return self.session.get(Consultation, consultation_id)

    def get_consultation_for_tenant(
        self, *, tenant_id: str, consultation_id: str
    ) -> Consultation | None:
        consultation = self.get_consultation(consultation_id)
        if not consultation or consultation.tenant_id != tenant_id:
            return None
        return consultation

    def get_appointment(self, appointment_id: str) -> Appointment | None:
        return self.session.get(Appointment, appointment_id)

    def get_appointment_for_tenant(
        self, *, tenant_id: str, appointment_id: str
    ) -> Appointment | None:
        appointment = self.get_appointment(appointment_id)
        if not appointment or appointment.tenant_id != tenant_id:
            return None
        return appointment

    def get_discount_approval(self, approval_id: str) -> DiscountApproval | None:
        return self.session.get(DiscountApproval, approval_id)

    def get_patient(self, patient_id: str) -> Patient | None:
        return self.session.get(Patient, patient_id)

    def get_consultation_invoice(
        self, *, tenant_id: str, consultation_id: str
    ) -> Invoice | None:
        return self.session.exec(
            select(Invoice).where(
                Invoice.tenant_id == tenant_id,
                Invoice.consultation_id == consultation_id,
                Invoice.lab_order_id.is_(None),
                Invoice.pharmacy_issue_id.is_(None),
                Invoice.ip_admission_id.is_(None),
                Invoice.physiotherapy_case_id.is_(None),
            )
        ).first()

    def get_lab_order(self, lab_order_id: str) -> LabOrder | None:
        return self.session.get(LabOrder, lab_order_id)

    def get_lab_order_for_tenant(
        self, *, tenant_id: str, lab_order_id: str
    ) -> LabOrder | None:
        order = self.get_lab_order(lab_order_id)
        if not order or order.tenant_id != tenant_id:
            return None
        return order

    def list_lab_order_items(
        self, *, tenant_id: str, lab_order_id: str
    ) -> list[LabOrderItem]:
        return list(
            self.session.exec(
                select(LabOrderItem)
                .where(
                    LabOrderItem.tenant_id == tenant_id,
                    LabOrderItem.lab_order_id == lab_order_id,
                )
                .order_by(LabOrderItem.created_at)
            ).all()
        )

    def get_lab_test(self, test_id: str) -> LabTestCatalog | None:
        return self.session.get(LabTestCatalog, test_id)

    def get_lab_order_invoice(
        self, *, tenant_id: str, lab_order_id: str
    ) -> Invoice | None:
        return self.session.exec(
            select(Invoice).where(
                Invoice.tenant_id == tenant_id,
                Invoice.lab_order_id == lab_order_id,
            )
        ).first()

    def get_pharmacy_issue(self, pharmacy_issue_id: str) -> PharmacyIssue | None:
        return self.session.get(PharmacyIssue, pharmacy_issue_id)

    def get_pharmacy_issue_for_tenant(
        self, *, tenant_id: str, pharmacy_issue_id: str
    ) -> PharmacyIssue | None:
        issue = self.get_pharmacy_issue(pharmacy_issue_id)
        if not issue or issue.tenant_id != tenant_id:
            return None
        return issue

    def list_pharmacy_issue_items(
        self, *, tenant_id: str, pharmacy_issue_id: str
    ) -> list[PharmacyIssueItem]:
        return list(
            self.session.exec(
                select(PharmacyIssueItem)
                .where(
                    PharmacyIssueItem.tenant_id == tenant_id,
                    PharmacyIssueItem.pharmacy_issue_id == pharmacy_issue_id,
                )
                .order_by(PharmacyIssueItem.created_at)
            ).all()
        )

    def get_medicine(self, medicine_id: str) -> MedicineCatalog | None:
        return self.session.get(MedicineCatalog, medicine_id)

    def get_pharmacy_issue_invoice(
        self, *, tenant_id: str, pharmacy_issue_id: str
    ) -> Invoice | None:
        return self.session.exec(
            select(Invoice).where(
                Invoice.tenant_id == tenant_id,
                Invoice.pharmacy_issue_id == pharmacy_issue_id,
            )
        ).first()

    def list_invoice_items_for_type(
        self, *, invoice: Invoice, item_type: str
    ) -> list[InvoiceItem]:
        return list(
            self.session.exec(
                select(InvoiceItem)
                .where(
                    InvoiceItem.invoice_id == invoice.id,
                    InvoiceItem.item_type == item_type,
                )
                .order_by(InvoiceItem.created_at)
            ).all()
        )
