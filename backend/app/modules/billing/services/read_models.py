from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass

from sqlmodel import Session

from app.modules.appointments.models import Appointment
from app.modules.billing.models import (
    BillingAdjustmentRequest,
    BillingAdjustmentStatus,
    BillingAdjustmentType,
    DiscountType,
    BillingLedgerEntry,
    DiscountApproval,
    DiscountOffer,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    PaymentMethod,
    TaxRule,
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
from app.modules.billing.services.money import ZERO, money_value, percentage_amount
from app.modules.billing.services.source_sync import sync_invoice_source_after_reversal
from app.modules.patients.services.references import (
    PatientReference,
    patient_reference_map,
)


@dataclass(frozen=True)
class InvoiceReadContext:
    payment_methods: dict[str, list[PaymentMethod]]
    adjustment_requests: dict[str, list[BillingAdjustmentRequest]]
    tax_rules: dict[str, TaxRule]
    discount_approvals: dict[str, DiscountApproval]
    discount_offers: dict[str, DiscountOffer]
    appointments: dict[str, Appointment]
    patients: dict[str, PatientReference]


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


def invoice_read(
    session: Session,
    invoice: Invoice,
    *,
    context: InvoiceReadContext | None = None,
) -> InvoiceRead:
    invoice_response = InvoiceRead.model_validate(invoice, from_attributes=True)
    patient = (
        context.patients.get(invoice.patient_id)
        if context
        else patient_reference_map(
            session,
            tenant_id=invoice.tenant_id,
            patient_ids={invoice.patient_id},
        ).get(invoice.patient_id)
    )
    if patient:
        invoice_response.patient_name = patient.name
        invoice_response.patient_number = patient.number
    invoice_response.payment_methods = (
        context.payment_methods.get(invoice.id, [])
        if context
        else invoice_payment_methods(session, invoice)
    )
    repo = BillingReadRepository(session)
    if invoice.tax_rule_id:
        tax_rule = (
            context.tax_rules.get(invoice.tax_rule_id)
            if context
            else session.get(TaxRule, invoice.tax_rule_id)
        )
        if tax_rule and tax_rule.tenant_id == invoice.tenant_id:
            invoice_response.tax_percentage = tax_rule.tax_percentage
            invoice_response.tax_label = tax_rule.tax_label
    total_discount = money_value(invoice.discount_amount)
    membership_discount = min(
        money_value(invoice.membership_discount_amount), total_discount
    )
    adjustment_requests = (
        context.adjustment_requests.get(invoice.id, [])
        if context
        else repo.list_adjustment_requests(invoice)
    )
    approved_discount = sum(
        money_value(row.amount)
        for row in adjustment_requests
        if row.request_type == BillingAdjustmentType.DISCOUNT
        and row.status == BillingAdjustmentStatus.EXECUTED
    )
    if invoice.discount_approval_id:
        legacy_approval = (
            context.discount_approvals.get(invoice.discount_approval_id)
            if context
            else repo.get_discount_approval(invoice.discount_approval_id)
        )
        if legacy_approval:
            approved_discount += money_value(legacy_approval.requested_amount)
    approved_discount = min(
        approved_discount, max(total_discount - membership_discount, ZERO)
    )
    offer_discount = ZERO
    if invoice.discount_offer_id:
        offer = (
            context.discount_offers.get(invoice.discount_offer_id)
            if context
            else repo.get_discount_offer(invoice.discount_offer_id)
        )
        if offer and offer.tenant_id == invoice.tenant_id:
            invoice_response.offer_discount_name = offer.name
            invoice_response.offer_discount_type = offer.discount_type
            invoice_response.offer_discount_value = offer.value
            offer_discount = (
                money_value(offer.value)
                if offer.discount_type == DiscountType.FIXED
                else percentage_amount(invoice.subtotal_amount, offer.value)
            )
            if offer.max_discount_amount is not None:
                offer_discount = min(offer_discount, offer.max_discount_amount)
    remaining = max(total_discount - membership_discount - approved_discount, ZERO)
    invoice_response.offer_discount_amount = min(offer_discount, remaining)
    invoice_response.approved_discount_amount = approved_discount
    if invoice.appointment_id:
        appointment = (
            context.appointments.get(invoice.appointment_id)
            if context
            else repo.get_appointment(invoice.appointment_id)
        )
        if appointment and appointment.tenant_id == invoice.tenant_id:
            invoice_response.appointment_type = appointment.appointment_type
    return invoice_response


def invoice_reads(session: Session, invoices: list[Invoice]) -> list[InvoiceRead]:
    if not invoices:
        return []
    repo = BillingReadRepository(session)
    tenant_id = invoices[0].tenant_id
    invoice_ids = {invoice.id for invoice in invoices}

    payment_methods: dict[str, list[PaymentMethod]] = defaultdict(list)
    seen_methods: dict[str, set[PaymentMethod]] = defaultdict(set)
    for payment in repo.list_recorded_positive_payments_for_invoices(
        tenant_id=tenant_id,
        invoice_ids=invoice_ids,
    ):
        if payment.method in seen_methods[payment.invoice_id]:
            continue
        seen_methods[payment.invoice_id].add(payment.method)
        payment_methods[payment.invoice_id].append(payment.method)

    adjustment_requests: dict[str, list[BillingAdjustmentRequest]] = defaultdict(list)
    for request in repo.list_adjustment_requests_for_invoices(
        tenant_id=tenant_id,
        invoice_ids=invoice_ids,
    ):
        adjustment_requests[request.invoice_id].append(request)

    context = InvoiceReadContext(
        payment_methods=dict(payment_methods),
        adjustment_requests=dict(adjustment_requests),
        tax_rules=repo.tax_rules({invoice.tax_rule_id for invoice in invoices}),
        discount_approvals=repo.discount_approvals(
            {invoice.discount_approval_id for invoice in invoices}
        ),
        discount_offers=repo.discount_offers(
            {invoice.discount_offer_id for invoice in invoices}
        ),
        appointments=repo.appointments(
            {invoice.appointment_id for invoice in invoices}
        ),
        patients=patient_reference_map(
            session,
            tenant_id=tenant_id,
            patient_ids={invoice.patient_id for invoice in invoices},
        ),
    )
    return [invoice_read(session, invoice, context=context) for invoice in invoices]


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
    if invoice.status == InvoiceStatus.CANCELLED:
        return invoice
    if (
        invoice.status in {InvoiceStatus.REFUNDED, InvoiceStatus.PARTIALLY_REFUNDED}
        or money_value(invoice.total_amount) <= 0
        or money_value(invoice.balance_amount) <= 0
    ):
        previous_status = invoice.status
        invoice = update_invoice_payment_status(session, invoice)
        if (
            previous_status
            in {InvoiceStatus.REFUNDED, InvoiceStatus.PARTIALLY_REFUNDED}
            and invoice.status != previous_status
        ):
            # Repair source records that older credit-note behavior may have
            # reopened or detached after falsely classifying an invoice as a
            # refund.
            sync_invoice_source_after_reversal(session, invoice)
        return invoice
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
    consultation_vendor_amount = money_value(invoice.doctor_share_amount)
    home_care_booking = (
        read_repo.get_home_care_booking(invoice.home_care_booking_id)
        if invoice.home_care_booking_id
        else None
    )

    def item_read(item: InvoiceItem) -> InvoiceItemRead:
        read = InvoiceItemRead.model_validate(item, from_attributes=True)
        if item.item_type == "consultation":
            read.vendor_name = consultation_vendor_name or "Doctor"
            read.vendor_amount = consultation_vendor_amount
        elif item.item_type == "home_care":
            visit = (
                read_repo.get_home_care_visit_log(item.external_item_code)
                if item.external_item_code
                and item.external_slug == "home_visit_service"
                else None
            )
            read.vendor_name = (
                getattr(visit, "assigned_staff_name", None)
                or getattr(home_care_booking, "assigned_staff_name", None)
                or "-"
            )
            read.vendor_amount = 0
        elif item.item_type in {"lab", "pharmacy"}:
            read.vendor_name = (
                supplier_names.get(str(item.supplier_id or ""))
                or item.supplier_id
                or None
            )
            read.vendor_amount = money_value(item.buying_amount)
        return read

    def ledger_read(entry: BillingLedgerEntry) -> BillingLedgerEntryRead:
        read = BillingLedgerEntryRead.model_validate(entry, from_attributes=True)
        if entry.entry_type == "credit_note_issued":
            # Older rows stored a credit note as a financial debit. Keep the
            # audit entry but expose it as informational data.
            read.debit_amount = 0
            read.credit_amount = 0
            read.invoice_total_delta = 0
            read.paid_amount_delta = 0
            read.balance_amount_delta = 0
        elif entry.entry_type == "invoice_submitted":
            # Issuing an invoice doesn't move any cash — Credit/Debit is only
            # for payment, refund, or membership-benefit movement. Keep the
            # invoice_total_delta/balance_amount_delta so Bill Amount/Balance
            # still populate correctly on this first row.
            read.debit_amount = 0
            read.credit_amount = 0
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
