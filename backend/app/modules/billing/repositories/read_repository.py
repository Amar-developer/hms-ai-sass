from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import and_, exists, func, or_
from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.billing.models import (
    BillingAdjustmentRequest,
    BillingAdjustmentStatus,
    BillingLedgerEntry,
    CreditNote,
    DiscountApproval,
    DiscountOffer,
    Invoice,
    InvoiceStatus,
    InvoiceItem,
    Payment,
    PaymentStatus,
    TaxRule,
)
from app.modules.consultations.models import Consultation, ConsultationStatus
from app.modules.identity.models import User
from app.modules.home_care.models import HomeCareBooking, HomeCareVisitLog
from app.modules.pharmacy.models import PharmacySupplier
from app.modules.practitioners.models import Practitioner
from app.modules.patients.models import Patient
from app.modules.queue.models import QueueEntry


class BillingReadRepository:
    """Reads invoice, payment, ledger, adjustment, and reference display data."""

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

    @staticmethod
    def _consultation_invoice_exists():
        return exists(
            select(Invoice.id).where(
                Invoice.tenant_id == Consultation.tenant_id,
                Invoice.consultation_id == Consultation.id,
                Invoice.lab_order_id.is_(None),
                Invoice.pharmacy_issue_id.is_(None),
                Invoice.ip_admission_id.is_(None),
                Invoice.physiotherapy_case_id.is_(None),
            )
        )

    def list_pending_consultation_invoices(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        offset: int,
        limit: int,
    ):
        token_number = (
            select(QueueEntry.token_number)
            .where(QueueEntry.appointment_id == Appointment.id)
            .order_by(QueueEntry.created_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        statement = (
            select(
                Consultation.id,
                Appointment.id,
                Consultation.branch_id,
                Patient.id,
                Patient.full_name,
                Practitioner.id,
                Practitioner.full_name,
                token_number,
                Appointment.appointment_date,
                Appointment.appointment_time,
                Consultation.signed_at,
                Consultation.created_at,
            )
            .join(Appointment, Appointment.id == Consultation.appointment_id)
            .join(Patient, Patient.id == Consultation.patient_id)
            .outerjoin(Practitioner, Practitioner.id == Consultation.practitioner_id)
            .where(
                Consultation.tenant_id == tenant_id,
                Consultation.status == ConsultationStatus.SIGNED,
                ~self._consultation_invoice_exists(),
            )
        )
        if branch_id:
            statement = statement.where(Consultation.branch_id == branch_id)
        return list(
            self.session.exec(
                statement.order_by(
                    Consultation.signed_at.desc(), Consultation.created_at.desc()
                )
                .offset(offset)
                .limit(limit)
            ).all()
        )

    def count_pending_consultation_invoices(
        self, *, tenant_id: str, branch_id: str | None
    ) -> int:
        statement = select(func.count(Consultation.id)).where(
            Consultation.tenant_id == tenant_id,
            Consultation.status == ConsultationStatus.SIGNED,
            ~self._consultation_invoice_exists(),
        )
        if branch_id:
            statement = statement.where(Consultation.branch_id == branch_id)
        return int(self.session.exec(statement).one())

    def get_discount_approval(self, approval_id: str) -> DiscountApproval | None:
        return self.session.get(DiscountApproval, approval_id)

    def get_discount_offer(self, offer_id: str) -> DiscountOffer | None:
        return self.session.get(DiscountOffer, offer_id)

    def get_home_care_booking(self, booking_id: str) -> HomeCareBooking | None:
        return self.session.get(HomeCareBooking, booking_id)

    def home_care_visit_logs(
        self, *, tenant_id: str, visit_ids: set[str | None]
    ) -> dict[str, HomeCareVisitLog]:
        ids = {str(visit_id) for visit_id in visit_ids if visit_id}
        if not ids:
            return {}
        rows = self.session.exec(
            select(HomeCareVisitLog).where(
                HomeCareVisitLog.tenant_id == tenant_id,
                HomeCareVisitLog.id.in_(ids),
            )
        ).all()
        return {row.id: row for row in rows}

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
        q: str | None = None,
        source: str | None = None,
        payment_state: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        offset: int = 0,
        limit: int | None = None,
    ) -> list[Invoice]:
        statement = self._invoice_list_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=patient_id,
            q=q,
            source=source,
            payment_state=payment_state,
            from_date=from_date,
            to_date=to_date,
        )
        statement = statement.order_by(Invoice.created_at.desc())
        statement = statement.offset(offset)
        if limit:
            statement = statement.limit(limit)
        return list(self.session.exec(statement).all())

    def count_invoices(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
        q: str | None = None,
        source: str | None = None,
        payment_state: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
    ) -> int:
        filtered = self._invoice_list_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=patient_id,
            q=q,
            source=source,
            payment_state=payment_state,
            from_date=from_date,
            to_date=to_date,
        ).subquery()
        return int(self.session.exec(select(func.count()).select_from(filtered)).one())

    def _invoice_list_statement(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
        q: str | None,
        source: str | None,
        payment_state: str | None,
        from_date: date | None,
        to_date: date | None,
    ):
        statement = select(Invoice).where(Invoice.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(Invoice.branch_id == branch_id)
        if patient_id:
            statement = statement.where(Invoice.patient_id == patient_id)
        if q:
            term = q.strip().lower()
            pattern = f"%{term}%"
            statement = statement.join(Patient, Patient.id == Invoice.patient_id).where(
                or_(
                    func.lower(Invoice.invoice_number).like(pattern),
                    func.lower(Patient.patient_number).like(pattern),
                    func.lower(Patient.full_name).like(pattern),
                    func.lower(Patient.mobile).like(pattern),
                    func.lower(Patient.alternate_mobile).like(pattern),
                    func.lower(Patient.guardian_mobile).like(pattern),
                )
            )
        if source:
            source_condition = {
                "lab_scan": Invoice.lab_order_id.is_not(None),
                "pharmacy": Invoice.pharmacy_issue_id.is_not(None),
                "physiotherapy": Invoice.physiotherapy_case_id.is_not(None),
                "home_care": Invoice.home_care_booking_id.is_not(None),
                "ip_billing": Invoice.ip_admission_id.is_not(None),
                "consultation": and_(
                    Invoice.lab_order_id.is_(None),
                    Invoice.pharmacy_issue_id.is_(None),
                    Invoice.physiotherapy_case_id.is_(None),
                    Invoice.home_care_booking_id.is_(None),
                    Invoice.ip_admission_id.is_(None),
                    or_(
                        Invoice.consultation_id.is_not(None),
                        Invoice.appointment_id.is_not(None),
                    ),
                ),
                "membership": and_(
                    or_(
                        Invoice.patient_subscription_enrollment_id.is_not(None),
                        Invoice.patient_subscription_plan_id.is_not(None),
                    ),
                    Invoice.lab_order_id.is_(None),
                    Invoice.pharmacy_issue_id.is_(None),
                    Invoice.physiotherapy_case_id.is_(None),
                    Invoice.home_care_booking_id.is_(None),
                    Invoice.ip_admission_id.is_(None),
                    Invoice.consultation_id.is_(None),
                    Invoice.appointment_id.is_(None),
                ),
                "direct": and_(
                    Invoice.lab_order_id.is_(None),
                    Invoice.pharmacy_issue_id.is_(None),
                    Invoice.physiotherapy_case_id.is_(None),
                    Invoice.home_care_booking_id.is_(None),
                    Invoice.ip_admission_id.is_(None),
                    Invoice.consultation_id.is_(None),
                    Invoice.appointment_id.is_(None),
                    Invoice.patient_subscription_enrollment_id.is_(None),
                    Invoice.patient_subscription_plan_id.is_(None),
                ),
            }.get(source)
            if source_condition is not None:
                statement = statement.where(source_condition)
        if payment_state:
            # A refund never reduces total_amount, so balance_amount stays
            # inflated by the refunded amount even though nothing further is
            # owed by the patient — the case is closed by refund, not by
            # collection. Every payment-state bucket below excludes refunded
            # invoices so refunded money never appears as still due.
            terminal = (
                InvoiceStatus.REFUNDED,
                InvoiceStatus.PARTIALLY_REFUNDED,
                InvoiceStatus.CANCELLED,
            )
            if payment_state == "due":
                statement = statement.where(
                    Invoice.status.not_in(terminal), Invoice.balance_amount > 0
                )
            elif payment_state == "paid":
                statement = statement.where(
                    Invoice.status.not_in(terminal),
                    or_(
                        Invoice.status == InvoiceStatus.PAID,
                        Invoice.balance_amount <= 0,
                    ),
                )
            elif payment_state == "partially_paid":
                statement = statement.where(
                    Invoice.status.not_in(terminal),
                    Invoice.balance_amount > 0,
                    or_(
                        Invoice.status == InvoiceStatus.PARTIALLY_PAID,
                        Invoice.paid_amount > 0,
                    ),
                )
            elif payment_state == "unpaid":
                statement = statement.where(
                    Invoice.status.not_in(terminal),
                    Invoice.balance_amount > 0,
                    Invoice.paid_amount <= 0,
                )
            else:
                statement = statement.where(Invoice.status == payment_state)
        if from_date:
            statement = statement.where(
                Invoice.created_at >= datetime.combine(from_date, time.min)
            )
        if to_date:
            statement = statement.where(
                Invoice.created_at
                < datetime.combine(to_date + timedelta(days=1), time.min)
            )
        return statement

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

    def list_invoice_items_for_invoices(
        self, *, tenant_id: str, invoice_ids: set[str]
    ) -> list[InvoiceItem]:
        if not invoice_ids:
            return []
        return list(
            self.session.exec(
                select(InvoiceItem)
                .where(
                    InvoiceItem.tenant_id == tenant_id,
                    InvoiceItem.invoice_id.in_(invoice_ids),
                )
                .order_by(InvoiceItem.invoice_id, InvoiceItem.created_at)
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

    def list_payments_for_invoices(
        self, *, tenant_id: str, invoice_ids: set[str]
    ) -> list[Payment]:
        if not invoice_ids:
            return []
        return list(
            self.session.exec(
                select(Payment)
                .where(
                    Payment.tenant_id == tenant_id,
                    Payment.invoice_id.in_(invoice_ids),
                )
                .order_by(Payment.invoice_id, Payment.collected_at)
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

    def list_recorded_positive_payments_for_invoices(
        self, *, tenant_id: str, invoice_ids: set[str]
    ) -> list[Payment]:
        if not invoice_ids:
            return []
        return list(
            self.session.exec(
                select(Payment)
                .where(
                    Payment.tenant_id == tenant_id,
                    Payment.invoice_id.in_(invoice_ids),
                    Payment.status == PaymentStatus.RECORDED,
                    Payment.amount > 0,
                )
                .order_by(Payment.collected_at)
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

    def payment_amount_total(self, invoice: Invoice) -> Decimal:
        amount = self.session.exec(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.tenant_id == invoice.tenant_id,
                Payment.invoice_id == invoice.id,
            )
        ).one()
        return amount or 0

    def refunded_amount_total(self, invoice: Invoice) -> Decimal:
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
        return amount or 0

    def refundable_payment_total(self, invoice: Invoice) -> Decimal:
        amount = self.session.exec(
            select(
                func.coalesce(func.sum(Payment.amount - Payment.refunded_amount), 0)
            ).where(
                Payment.tenant_id == invoice.tenant_id,
                Payment.invoice_id == invoice.id,
            )
        ).one()
        return amount or 0

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

    def list_adjustment_requests_for_invoices(
        self, *, tenant_id: str, invoice_ids: set[str]
    ) -> list[BillingAdjustmentRequest]:
        if not invoice_ids:
            return []
        return list(
            self.session.exec(
                select(BillingAdjustmentRequest).where(
                    BillingAdjustmentRequest.tenant_id == tenant_id,
                    BillingAdjustmentRequest.invoice_id.in_(invoice_ids),
                )
            ).all()
        )

    def tax_rules(self, ids: set[str | None]) -> dict[str, TaxRule]:
        rule_ids = {row_id for row_id in ids if row_id}
        if not rule_ids:
            return {}
        rows = self.session.exec(select(TaxRule).where(TaxRule.id.in_(rule_ids))).all()
        return {row.id: row for row in rows}

    def discount_approvals(self, ids: set[str | None]) -> dict[str, DiscountApproval]:
        approval_ids = {row_id for row_id in ids if row_id}
        if not approval_ids:
            return {}
        rows = self.session.exec(
            select(DiscountApproval).where(DiscountApproval.id.in_(approval_ids))
        ).all()
        return {row.id: row for row in rows}

    def discount_offers(self, ids: set[str | None]) -> dict[str, DiscountOffer]:
        offer_ids = {row_id for row_id in ids if row_id}
        if not offer_ids:
            return {}
        rows = self.session.exec(
            select(DiscountOffer).where(DiscountOffer.id.in_(offer_ids))
        ).all()
        return {row.id: row for row in rows}

    def appointments(self, ids: set[str | None]) -> dict[str, Appointment]:
        appointment_ids = {row_id for row_id in ids if row_id}
        if not appointment_ids:
            return {}
        rows = self.session.exec(
            select(Appointment).where(Appointment.id.in_(appointment_ids))
        ).all()
        return {row.id: row for row in rows}

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
