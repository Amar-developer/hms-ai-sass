from decimal import Decimal

from sqlalchemy import func
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
    InvoiceItem,
    Payment,
    PaymentStatus,
    TaxRule,
)
from app.modules.identity.models import User
from app.modules.home_care.models import HomeCareBooking, HomeCareVisitLog
from app.modules.pharmacy.models import PharmacySupplier
from app.modules.practitioners.models import Practitioner


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

    def get_discount_approval(self, approval_id: str) -> DiscountApproval | None:
        return self.session.get(DiscountApproval, approval_id)

    def get_discount_offer(self, offer_id: str) -> DiscountOffer | None:
        return self.session.get(DiscountOffer, offer_id)

    def get_home_care_booking(self, booking_id: str) -> HomeCareBooking | None:
        return self.session.get(HomeCareBooking, booking_id)

    def get_home_care_visit_log(self, visit_id: str) -> HomeCareVisitLog | None:
        return self.session.get(HomeCareVisitLog, visit_id)

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
        limit: int | None = None,
    ) -> list[Invoice]:
        statement = select(Invoice).where(Invoice.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(Invoice.branch_id == branch_id)
        if patient_id:
            statement = statement.where(Invoice.patient_id == patient_id)
        statement = statement.order_by(Invoice.created_at.desc())
        if limit:
            statement = statement.limit(limit)
        return list(self.session.exec(statement).all())

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
