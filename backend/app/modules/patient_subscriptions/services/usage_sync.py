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
    usage_from_json,
    usage_to_json,
)
from app.modules.pharmacy.repositories import PharmacyIssueRepository


def invoice_benefit_usage(
    session: Session,
    enrollment: PatientSubscriptionEnrollment,
    plan: PatientSubscriptionPlan,
) -> tuple[int, dict[str, int], dict[str, int], bool]:
    """Return usage backed by non-cancelled benefit invoices.

    Consultation usage is counted by distinct clinical visit so duplicate
    invoices cannot consume a second benefit.
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
    has_consultation_history = any(
        is_consultation_invoice(invoice) for invoice in all_benefit_invoices
    )
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

    return (
        len(consultation_visits),
        lab_usage,
        medicine_usage,
        has_consultation_history,
    )


def sync_free_item_usage_from_invoices(
    session: Session,
    enrollment: PatientSubscriptionEnrollment,
    plan: PatientSubscriptionPlan,
) -> None:
    """Combine invoice usage with the tenant-admin handover baseline."""
    invoice_consultations, invoice_lab, invoice_medicine, has_consultation_history = (
        invoice_benefit_usage(session, enrollment, plan)
    )
    manual_consultations = enrollment.manual_used_consultations
    if manual_consultations is not None:
        enrollment.used_consultations = (
            int(manual_consultations) + invoice_consultations
        )
    elif has_consultation_history:
        # Preserve the legacy behavior for enrollments that have never received
        # an explicit handover correction.
        enrollment.used_consultations = invoice_consultations

    manual_lab = usage_from_json(enrollment.manual_used_free_lab_json)
    manual_medicine = usage_from_json(enrollment.manual_used_free_medicine_json)
    enrollment.used_free_lab_json = usage_to_json(
        {
            item_id: int(invoice_lab.get(item_id, 0)) + int(manual_lab.get(item_id, 0))
            for item_id in set(invoice_lab) | set(manual_lab)
        }
    )
    enrollment.used_free_medicine_json = usage_to_json(
        {
            item_id: int(invoice_medicine.get(item_id, 0))
            + int(manual_medicine.get(item_id, 0))
            for item_id in set(invoice_medicine) | set(manual_medicine)
        }
    )
