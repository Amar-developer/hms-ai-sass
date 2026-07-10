from collections.abc import Callable

from sqlmodel import Session

from app.modules.billing.models import (
    BillingAdjustmentRequest,
    BillingLedgerEntry,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    PaymentMethod,
)
from app.modules.billing.repositories.read_repository import BillingReadRepository
from app.modules.billing.schemas import (
    BillingAdjustmentRequestRead,
    BillingLedgerEntryRead,
    CreditNoteRead,
    InvoiceDetailRead,
    InvoiceItemRead,
    InvoiceRead,
    PaymentRead,
)
from app.modules.billing.services.invoice_status import update_invoice_payment_status
from app.modules.billing.services.membership import invoice_membership_benefit


def actor_names(session: Session, user_ids: set[str | None]) -> dict[str, str]:
    return BillingReadRepository(session).actor_names(user_ids)


def invoice_payment_methods(session: Session, invoice: Invoice) -> list[PaymentMethod]:
    payments = BillingReadRepository(session).list_recorded_positive_payments(invoice)
    methods: list[PaymentMethod] = []
    seen: set[PaymentMethod] = set()
    for payment in payments:
        if payment.method in seen:
            continue
        seen.add(payment.method)
        methods.append(payment.method)
    return methods


def invoice_read(session: Session, invoice: Invoice) -> InvoiceRead:
    invoice_response = InvoiceRead.model_validate(invoice, from_attributes=True)
    invoice_response.payment_methods = invoice_payment_methods(session, invoice)
    if invoice.appointment_id:
        appointment = BillingReadRepository(session).get_appointment(
            invoice.appointment_id
        )
        if appointment and appointment.tenant_id == invoice.tenant_id:
            invoice_response.appointment_type = appointment.appointment_type
    return invoice_response


def read_adjustment_request(
    session: Session, row: BillingAdjustmentRequest
) -> BillingAdjustmentRequestRead:
    names = actor_names(
        session,
        {
            row.requested_by_user_id,
            row.approved_by_user_id,
            row.executed_by_user_id,
        },
    )
    read = BillingAdjustmentRequestRead.model_validate(row, from_attributes=True)
    read.requested_by_user_name = names.get(str(row.requested_by_user_id or ""))
    read.approved_by_user_name = names.get(str(row.approved_by_user_id or ""))
    read.executed_by_user_name = names.get(str(row.executed_by_user_id or ""))
    return read


def invoice_adjustment_requests(
    session: Session, invoice: Invoice
) -> list[BillingAdjustmentRequestRead]:
    rows = BillingReadRepository(session).list_adjustment_requests(invoice)
    names = actor_names(
        session,
        {
            user_id
            for row in rows
            for user_id in (
                row.requested_by_user_id,
                row.approved_by_user_id,
                row.executed_by_user_id,
            )
        },
    )
    result = []
    for row in rows:
        read = BillingAdjustmentRequestRead.model_validate(row, from_attributes=True)
        read.requested_by_user_name = names.get(str(row.requested_by_user_id or ""))
        read.approved_by_user_name = names.get(str(row.approved_by_user_id or ""))
        read.executed_by_user_name = names.get(str(row.executed_by_user_id or ""))
        result.append(read)
    return result


def normalize_invoice_status(session: Session, invoice: Invoice) -> Invoice:
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        return invoice
    if int(invoice.total_amount or 0) <= 0 or int(invoice.balance_amount or 0) <= 0:
        return update_invoice_payment_status(session, invoice)
    return invoice


def read_invoice_detail(
    session: Session,
    invoice: Invoice,
    *,
    ensure_invoice_submit_ledger: Callable[[Session, Invoice], None],
    ensure_invoice_membership_benefit_ledger: Callable[[Session, Invoice], None],
) -> InvoiceDetailRead:
    invoice = normalize_invoice_status(session, invoice)
    ensure_invoice_submit_ledger(session, invoice)
    ensure_invoice_membership_benefit_ledger(session, invoice)
    read_repo = BillingReadRepository(session)
    items = read_repo.list_invoice_items(invoice)
    payments = read_repo.list_payments(invoice)
    credit_notes = read_repo.list_credit_notes(invoice)
    ledger_entries = read_repo.list_ledger_entries(invoice)
    actor_ids = {entry.actor_user_id for entry in ledger_entries if entry.actor_user_id}
    entry_actor_names: dict[str, str] = {}
    if actor_ids:
        entry_actor_names = read_repo.actor_names(actor_ids)
    supplier_names = read_repo.supplier_names(
        tenant_id=invoice.tenant_id,
        supplier_ids={item.supplier_id for item in items if item.supplier_id},
    )
    consultation_vendor_name: str | None = None
    if invoice.appointment_id:
        appointment = read_repo.get_appointment(invoice.appointment_id)
        if appointment and appointment.tenant_id == invoice.tenant_id:
            if appointment.practitioner_id:
                practitioner = read_repo.get_practitioner(appointment.practitioner_id)
                if practitioner and practitioner.tenant_id == invoice.tenant_id:
                    consultation_vendor_name = practitioner.full_name
    consultation_vendor_amount = int(invoice.doctor_share_amount or 0)

    def item_read(item: InvoiceItem) -> InvoiceItemRead:
        read = InvoiceItemRead.model_validate(item, from_attributes=True)
        if item.item_type == "consultation" and consultation_vendor_amount > 0:
            read.vendor_name = consultation_vendor_name or "Doctor share"
            read.vendor_amount = consultation_vendor_amount
        elif item.item_type in {"lab", "pharmacy"}:
            read.vendor_name = (
                supplier_names.get(str(item.supplier_id or ""))
                or item.supplier_id
                or None
            )
            read.vendor_amount = int(item.buying_amount or 0)
        return read

    def ledger_read(entry: BillingLedgerEntry) -> BillingLedgerEntryRead:
        read = BillingLedgerEntryRead.model_validate(entry, from_attributes=True)
        read.actor_user_name = entry_actor_names.get(str(entry.actor_user_id or ""))
        return read

    invoice_response = invoice_read(session, invoice)
    return InvoiceDetailRead(
        status=invoice_response.status,
        invoice=invoice_response,
        items=[item_read(item) for item in items],
        payments=[
            PaymentRead.model_validate(payment, from_attributes=True)
            for payment in payments
        ],
        credit_notes=[
            CreditNoteRead.model_validate(credit_note, from_attributes=True)
            for credit_note in credit_notes
        ],
        ledger_entries=[ledger_read(entry) for entry in ledger_entries],
        adjustment_requests=invoice_adjustment_requests(session, invoice),
        membership_benefit=invoice_membership_benefit(session, invoice),
    )
