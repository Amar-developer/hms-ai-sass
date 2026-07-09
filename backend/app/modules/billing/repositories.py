from datetime import date

from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.billing.models import (
    BillingAdjustmentRequest,
    BillingAdjustmentStatus,
    BillingLedgerEntry,
    CreditNote,
    CreditNoteStatus,
    DiscountApproval,
    DiscountOffer,
    DoctorSettlement,
    DoctorFeeRule,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    Payment,
    PaymentStatus,
    SettlementStatus,
    TaxRule,
)
from app.modules.consultations.models import Consultation
from app.modules.identity.models import User
from app.modules.lab.models import (
    LabOrder,
    LabOrderItem,
    LabTestCatalog,
    LabTestPackage,
)
from app.modules.patients.models import Patient
from app.modules.patient_subscriptions.models import PatientSubscriptionEnrollment
from app.modules.pharmacy.models import (
    MedicineCatalog,
    PharmacyIssue,
    PharmacyIssueItem,
    PharmacySupplier,
)
from app.modules.home_care.models import HomeCareBooking
from app.modules.physiotherapy.models import PhysiotherapyCase
from app.modules.practitioners.models import Practitioner, PractitionerDepartment
from app.modules.tenants.models import Branch, Tenant


class BillingReadRepository:
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

    def list_invoices(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
    ) -> list[Invoice]:
        statement = select(Invoice).where(Invoice.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(Invoice.branch_id == branch_id)
        if patient_id:
            statement = statement.where(Invoice.patient_id == patient_id)
        return list(
            self.session.exec(statement.order_by(Invoice.created_at.desc())).all()
        )

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

    def list_recorded_positive_payments(self, invoice: Invoice) -> list[Payment]:
        return list(
            self.session.exec(
                select(Payment).where(
                    Payment.tenant_id == invoice.tenant_id,
                    Payment.invoice_id == invoice.id,
                    Payment.status == PaymentStatus.RECORDED,
                    Payment.amount > 0,
                )
            ).all()
        )

    def list_payments_for_refund_update(self, invoice: Invoice) -> list[Payment]:
        return list(
            self.session.exec(
                select(Payment)
                .where(
                    Payment.tenant_id == invoice.tenant_id,
                    Payment.invoice_id == invoice.id,
                )
                .order_by(Payment.collected_at.desc())
                .with_for_update()
            ).all()
        )

    def payment_amount_total(self, invoice: Invoice) -> int:
        amount = self.session.exec(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.tenant_id == invoice.tenant_id,
                Payment.invoice_id == invoice.id,
            )
        ).one()
        return int(amount or 0)

    def refunded_amount_total(self, invoice: Invoice) -> int:
        amount = self.session.exec(
            select(
                func.coalesce(
                    func.sum(func.coalesce(Payment.refunded_amount, 0)),
                    0,
                )
            ).where(
                Payment.tenant_id == invoice.tenant_id,
                Payment.invoice_id == invoice.id,
            )
        ).one()
        return int(amount or 0)

    def refundable_payment_total(self, invoice: Invoice) -> int:
        amount = self.session.exec(
            select(
                func.coalesce(func.sum(Payment.amount - Payment.refunded_amount), 0)
            ).where(
                Payment.tenant_id == invoice.tenant_id,
                Payment.invoice_id == invoice.id,
            )
        ).one()
        return int(amount or 0)

    def list_credit_notes(self, invoice: Invoice) -> list[CreditNote]:
        return list(
            self.session.exec(
                select(CreditNote)
                .where(
                    CreditNote.tenant_id == invoice.tenant_id,
                    CreditNote.invoice_id == invoice.id,
                )
                .order_by(CreditNote.created_at)
            ).all()
        )

    def issued_credit_note_total(self, invoice: Invoice) -> int:
        amount = self.session.exec(
            select(func.coalesce(func.sum(CreditNote.amount), 0)).where(
                CreditNote.tenant_id == invoice.tenant_id,
                CreditNote.invoice_id == invoice.id,
                CreditNote.status == CreditNoteStatus.ISSUED,
            )
        ).one()
        return int(amount or 0)

    def list_ledger_entries(self, invoice: Invoice) -> list[BillingLedgerEntry]:
        return list(
            self.session.exec(
                select(BillingLedgerEntry)
                .where(
                    BillingLedgerEntry.tenant_id == invoice.tenant_id,
                    BillingLedgerEntry.invoice_id == invoice.id,
                )
                .order_by(BillingLedgerEntry.created_at.desc())
            ).all()
        )

    def has_ledger_entry(self, *, invoice: Invoice, entry_type: str) -> bool:
        return (
            self.session.exec(
                select(BillingLedgerEntry).where(
                    BillingLedgerEntry.tenant_id == invoice.tenant_id,
                    BillingLedgerEntry.invoice_id == invoice.id,
                    BillingLedgerEntry.entry_type == entry_type,
                )
            ).first()
            is not None
        )

    def list_adjustment_requests(
        self, invoice: Invoice
    ) -> list[BillingAdjustmentRequest]:
        return list(
            self.session.exec(
                select(BillingAdjustmentRequest)
                .where(
                    BillingAdjustmentRequest.tenant_id == invoice.tenant_id,
                    BillingAdjustmentRequest.invoice_id == invoice.id,
                )
                .order_by(BillingAdjustmentRequest.created_at.desc())
            ).all()
        )

    def has_open_adjustment_request(self, invoice: Invoice) -> bool:
        return (
            self.session.exec(
                select(BillingAdjustmentRequest)
                .where(
                    BillingAdjustmentRequest.tenant_id == invoice.tenant_id,
                    BillingAdjustmentRequest.invoice_id == invoice.id,
                    BillingAdjustmentRequest.status.in_(
                        [
                            BillingAdjustmentStatus.PENDING,
                            BillingAdjustmentStatus.APPROVED,
                        ]
                    ),
                )
                .limit(1)
            ).first()
            is not None
        )

    def actor_names(self, user_ids: set[str | None]) -> dict[str, str]:
        ids = {user_id for user_id in user_ids if user_id}
        if not ids:
            return {}
        users = self.session.exec(select(User).where(User.id.in_(ids))).all()
        return {user.id: user.name for user in users}

    def supplier_names(
        self, *, tenant_id: str, supplier_ids: set[str | None]
    ) -> dict[str, str]:
        ids = {supplier_id for supplier_id in supplier_ids if supplier_id}
        if not ids:
            return {}
        suppliers = self.session.exec(
            select(PharmacySupplier).where(
                PharmacySupplier.tenant_id == tenant_id,
                PharmacySupplier.id.in_(ids),
            )
        ).all()
        return {supplier.id: supplier.name for supplier in suppliers}

    def get_appointment(self, appointment_id: str) -> Appointment | None:
        return self.session.get(Appointment, appointment_id)

    def get_practitioner(self, practitioner_id: str) -> Practitioner | None:
        return self.session.get(Practitioner, practitioner_id)


class BillingAdjustmentRepository:
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


class BillingPaymentRepository:
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


class BillingSourceSyncRepository:
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


class BillingInvoiceSupportRepository:
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


class BillingSettlementReportRepository:
    def __init__(self, session: Session):
        self.session = session

    def list_settlement_invoice_rows(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        practitioner_id: str | None,
    ) -> list[tuple[Invoice, Appointment]]:
        statement = (
            select(Invoice, Appointment)
            .join(Appointment, Invoice.appointment_id == Appointment.id)
            .where(
                Invoice.tenant_id == tenant_id,
                Invoice.status.notin_(
                    [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]
                ),
            )
        )
        if branch_id:
            statement = statement.where(Invoice.branch_id == branch_id)
        if practitioner_id:
            statement = statement.where(Appointment.practitioner_id == practitioner_id)
        return list(self.session.exec(statement).all())

    def list_finalized_settlements(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        practitioner_id: str | None,
    ) -> list[DoctorSettlement]:
        statement = select(DoctorSettlement).where(
            DoctorSettlement.tenant_id == tenant_id,
            DoctorSettlement.status == SettlementStatus.FINALIZED,
        )
        if branch_id:
            statement = statement.where(DoctorSettlement.branch_id == branch_id)
        else:
            statement = statement.where(DoctorSettlement.branch_id.is_(None))
        if practitioner_id:
            statement = statement.where(
                DoctorSettlement.practitioner_id == practitioner_id
            )
        else:
            statement = statement.where(DoctorSettlement.practitioner_id.is_(None))
        return list(self.session.exec(statement).all())

    def list_due_collection_invoices(
        self, *, tenant_id: str, branch_id: str | None
    ) -> list[Invoice]:
        statement = select(Invoice).where(
            Invoice.tenant_id == tenant_id,
            Invoice.balance_amount > 0,
            Invoice.status.notin_([InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]),
        )
        if branch_id:
            statement = statement.where(Invoice.branch_id == branch_id)
        return list(self.session.exec(statement.order_by(Invoice.created_at)).all())

    def list_revenue_rows(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        from_date: date | None,
        to_date: date | None,
    ) -> list[tuple[Invoice, Appointment | None]]:
        statement = (
            select(Invoice, Appointment)
            .outerjoin(Appointment, Invoice.appointment_id == Appointment.id)
            .where(
                Invoice.tenant_id == tenant_id,
                Invoice.status.notin_(
                    [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]
                ),
            )
        )
        if branch_id:
            statement = statement.where(Invoice.branch_id == branch_id)
        if from_date:
            statement = statement.where(func.date(Invoice.created_at) >= from_date)
        if to_date:
            statement = statement.where(func.date(Invoice.created_at) <= to_date)
        return list(self.session.exec(statement).all())


class BillingReferenceRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_practitioner(self, practitioner_id: str) -> Practitioner | None:
        return self.session.get(Practitioner, practitioner_id)

    def get_practitioner_department(
        self, *, practitioner_id: str, department_id: str
    ) -> PractitionerDepartment | None:
        return self.session.get(
            PractitionerDepartment,
            (practitioner_id, department_id),
        )

    def list_active_fee_rules(
        self, *, tenant_id: str, appointment_type
    ) -> list[DoctorFeeRule]:
        return list(
            self.session.exec(
                select(DoctorFeeRule).where(
                    DoctorFeeRule.tenant_id == tenant_id,
                    DoctorFeeRule.appointment_type == appointment_type,
                    DoctorFeeRule.is_active == True,  # noqa: E712
                )
            ).all()
        )

    def list_duplicate_fee_rules(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        department_id: str | None,
        practitioner_id: str | None,
        appointment_type,
        treatment_type: str | None,
    ) -> list[DoctorFeeRule]:
        return list(
            self.session.exec(
                select(DoctorFeeRule).where(
                    DoctorFeeRule.tenant_id == tenant_id,
                    DoctorFeeRule.branch_id == branch_id,
                    DoctorFeeRule.department_id == department_id,
                    DoctorFeeRule.practitioner_id == practitioner_id,
                    DoctorFeeRule.appointment_type == appointment_type,
                    DoctorFeeRule.treatment_type == treatment_type,
                    DoctorFeeRule.is_active == True,  # noqa: E712
                )
            ).all()
        )

    def list_fee_rules(
        self, *, tenant_id: str, branch_id: str | None
    ) -> list[DoctorFeeRule]:
        statement = select(DoctorFeeRule).where(DoctorFeeRule.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(DoctorFeeRule.branch_id == branch_id)
        return list(
            self.session.exec(statement.order_by(DoctorFeeRule.created_at)).all()
        )

    def get_tax_rule(self, tax_rule_id: str) -> TaxRule | None:
        return self.session.get(TaxRule, tax_rule_id)

    def list_active_tax_rules(self, *, tenant_id: str) -> list[TaxRule]:
        return list(
            self.session.exec(
                select(TaxRule).where(
                    TaxRule.tenant_id == tenant_id,
                    TaxRule.is_active == True,  # noqa: E712
                )
            ).all()
        )

    def list_tax_rules(self, *, tenant_id: str, branch_id: str | None) -> list[TaxRule]:
        statement = select(TaxRule).where(TaxRule.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(TaxRule.branch_id == branch_id)
        return list(
            self.session.exec(statement.order_by(TaxRule.created_at.desc())).all()
        )

    def get_discount_offer(self, offer_id: str) -> DiscountOffer | None:
        return self.session.get(DiscountOffer, offer_id)

    def list_active_discount_offers(self, *, tenant_id: str) -> list[DiscountOffer]:
        return list(
            self.session.exec(
                select(DiscountOffer).where(
                    DiscountOffer.tenant_id == tenant_id,
                    DiscountOffer.is_active == True,  # noqa: E712
                )
            ).all()
        )

    def list_discount_offers(
        self, *, tenant_id: str, branch_id: str | None
    ) -> list[DiscountOffer]:
        statement = select(DiscountOffer).where(DiscountOffer.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(
                (DiscountOffer.branch_id == branch_id)
                | (DiscountOffer.branch_id.is_(None))
            )
        return list(
            self.session.exec(statement.order_by(DiscountOffer.created_at.desc())).all()
        )

    def list_lab_catalog_supplier_options(
        self, *, tenant_id: str, item_code: str | None, name: str | None
    ) -> list[LabTestCatalog | LabTestPackage]:
        rows: list[LabTestCatalog | LabTestPackage] = []
        if item_code:
            rows.extend(
                self.session.exec(
                    select(LabTestCatalog).where(
                        LabTestCatalog.tenant_id == tenant_id,
                        LabTestCatalog.id == item_code,
                    )
                ).all()
            )
            rows.extend(
                self.session.exec(
                    select(LabTestPackage).where(
                        LabTestPackage.tenant_id == tenant_id,
                        LabTestPackage.id == item_code,
                    )
                ).all()
            )
        if not rows and name:
            normalized_name = name.strip().lower()
            if normalized_name:
                rows.extend(
                    self.session.exec(
                        select(LabTestCatalog).where(
                            LabTestCatalog.tenant_id == tenant_id,
                            func.lower(LabTestCatalog.name) == normalized_name,
                        )
                    ).all()
                )
                rows.extend(
                    self.session.exec(
                        select(LabTestPackage).where(
                            LabTestPackage.tenant_id == tenant_id,
                            func.lower(LabTestPackage.name) == normalized_name,
                        )
                    ).all()
                )
        return rows

    def supplier_names(
        self, *, tenant_id: str, supplier_ids: list[str]
    ) -> dict[str, str]:
        if not supplier_ids:
            return {}
        suppliers = self.session.exec(
            select(PharmacySupplier).where(
                PharmacySupplier.tenant_id == tenant_id,
                PharmacySupplier.id.in_(supplier_ids),
            )
        ).all()
        return {supplier.id: supplier.name for supplier in suppliers}


class BillingSourceRepository:
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
