from sqlmodel import Session

from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.lab.repositories import LabOrderRepository
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionPlan,
)
from app.modules.patient_subscriptions.repositories import (
    PatientSubscriptionSupportRepository,
)
from app.modules.patient_subscriptions.services.serialization import (
    free_items_from_json,
    usage_to_json,
)
from app.modules.pharmacy.repositories import PharmacyIssueRepository


def sync_free_item_usage_from_invoices(
    session: Session,
    enrollment: PatientSubscriptionEnrollment,
    plan: PatientSubscriptionPlan,
) -> None:
    """Rebuild membership usage from non-cancelled benefit invoices.

    Consultation usage is counted by distinct clinical visit so duplicate
    invoices cannot consume a second benefit. If legacy usage has no linked
    invoices, preserve its counter; once invoice history exists it becomes the
    source of truth, including restoring benefits after cancellation/refund.
    """
    free_lab = free_items_from_json(plan.free_lab_test_ids_json)
    free_medicine = free_items_from_json(plan.free_medicine_ids_json)
    lab_usage: dict[str, int] = {}
    medicine_usage: dict[str, int] = {}
    all_benefit_invoices = PatientSubscriptionSupportRepository(
        session
    ).list_benefit_invoices(tenant_id=enrollment.tenant_id, enrollment_id=enrollment.id)
    invoices = [
        invoice
        for invoice in all_benefit_invoices
        if invoice.status not in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}
    ]

    def is_consultation_invoice(invoice: Invoice) -> bool:
        return bool(invoice.consultation_id or invoice.appointment_id) and not any(
            (
                invoice.lab_order_id,
                invoice.pharmacy_issue_id,
                invoice.ip_admission_id,
                invoice.physiotherapy_case_id,
                invoice.home_care_booking_id,
            )
        )

    consultation_visits = {
        invoice.consultation_id or invoice.appointment_id or invoice.id
        for invoice in invoices
        if is_consultation_invoice(invoice)
    }
    if any(is_consultation_invoice(invoice) for invoice in all_benefit_invoices):
        enrollment.used_consultations = len(consultation_visits)
    for invoice in invoices:
        remaining_discount = int(invoice.membership_discount_amount or 0)
        if remaining_discount <= 0:
            continue
        if invoice.lab_order_id and free_lab:
            items = LabOrderRepository(session).list_order_items(
                tenant_id=invoice.tenant_id, order_id=invoice.lab_order_id
            )
            for item in items:
                price = int(item.price or 0)
                if (
                    not item.test_id
                    or item.test_id not in free_lab
                    or price <= 0
                    or remaining_discount < price
                ):
                    continue
                lab_usage[item.test_id] = lab_usage.get(item.test_id, 0) + 1
                remaining_discount -= price
        elif invoice.pharmacy_issue_id and free_medicine:
            items = PharmacyIssueRepository(session).list_items(
                tenant_id=invoice.tenant_id, issue_id=invoice.pharmacy_issue_id
            )
            for item in items:
                amount = int(item.quantity * item.unit_price)
                if (
                    not item.medicine_id
                    or item.medicine_id not in free_medicine
                    or amount <= 0
                    or remaining_discount < amount
                ):
                    continue
                medicine_usage[item.medicine_id] = medicine_usage.get(
                    item.medicine_id, 0
                ) + max(int(item.quantity or 1), 1)
                remaining_discount -= amount

    enrollment.used_free_lab_json = usage_to_json(lab_usage)
    enrollment.used_free_medicine_json = usage_to_json(medicine_usage)
