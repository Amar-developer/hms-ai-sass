from __future__ import annotations

from sqlalchemy import and_, case, func, or_

from app.core.list_filters import (
    ListField,
    ListSpec,
    standard_audit_list_fields,
    standard_audit_sort_fields,
)
from app.modules.billing.models import (
    DiscountOffer,
    DiscountType,
    Invoice,
    InvoiceStatus,
    TaxRule,
)
from app.modules.patients.models import Patient


invoice_source = case(
    (Invoice.lab_order_id.is_not(None), "lab_scan"),
    (Invoice.pharmacy_issue_id.is_not(None), "pharmacy"),
    (Invoice.physiotherapy_case_id.is_not(None), "physiotherapy"),
    (Invoice.home_care_booking_id.is_not(None), "home_care"),
    (Invoice.ip_admission_id.is_not(None), "ip_billing"),
    (
        and_(
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
        "consultation",
    ),
    (
        and_(
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
        "membership",
    ),
    else_="direct",
)

patient_display_name = func.coalesce(Patient.full_name, "")
invoice_due_amount = Invoice.balance_amount
invoice_date = Invoice.created_at

BILLING_INVOICE_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(Invoice),
        "invoice_number": ListField(Invoice.invoice_number, "text"),
        "patient_name": ListField(patient_display_name, "text"),
        "patient_number": ListField(Patient.patient_number, "text"),
        "source": ListField(invoice_source, "select"),
        "status": ListField(Invoice.status, "select", enum_type=InvoiceStatus),
        "total_amount": ListField(Invoice.total_amount, "number"),
        "paid_amount": ListField(Invoice.paid_amount, "number"),
        "balance_amount": ListField(Invoice.balance_amount, "number"),
        "due": ListField(invoice_due_amount, "number"),
        "invoice_date": ListField(invoice_date, "date"),
    },
    sort_fields={
        **standard_audit_sort_fields(Invoice),
        "invoice_date": invoice_date,
        "source": invoice_source,
        "patient": patient_display_name,
        "patient_name": patient_display_name,
        "status": Invoice.status,
        "total_amount": Invoice.total_amount,
        "paid_amount": Invoice.paid_amount,
        "balance_amount": Invoice.balance_amount,
        "due": invoice_due_amount,
    },
)


TAX_RULE_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(TaxRule),
        "branch_id": ListField(TaxRule.branch_id, "select"),
        "name": ListField(TaxRule.name, "text"),
        "tax_percentage": ListField(TaxRule.tax_percentage, "number"),
        "tax_label": ListField(TaxRule.tax_label, "text"),
        "service_scope": ListField(TaxRule.service_scope, "select"),
        "is_active": ListField(TaxRule.is_active, "boolean"),
    },
    sort_fields={
        **standard_audit_sort_fields(TaxRule),
        "branch_id": TaxRule.branch_id,
        "name": TaxRule.name,
        "tax_percentage": TaxRule.tax_percentage,
        "tax_label": TaxRule.tax_label,
        "service_scope": TaxRule.service_scope,
        "is_active": TaxRule.is_active,
    },
)


DISCOUNT_OFFER_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(DiscountOffer),
        "branch_id": ListField(DiscountOffer.branch_id, "select"),
        "name": ListField(DiscountOffer.name, "text"),
        "code": ListField(DiscountOffer.code, "text"),
        "service_scope": ListField(DiscountOffer.service_scope, "select"),
        "discount_type": ListField(
            DiscountOffer.discount_type,
            "select",
            enum_type=DiscountType,
        ),
        "value": ListField(DiscountOffer.value, "number"),
        "minimum_bill_amount": ListField(DiscountOffer.minimum_bill_amount, "number"),
        "max_discount_amount": ListField(DiscountOffer.max_discount_amount, "number"),
        "valid_from": ListField(DiscountOffer.valid_from, "date"),
        "valid_until": ListField(DiscountOffer.valid_until, "date"),
        "is_active": ListField(DiscountOffer.is_active, "boolean"),
    },
    sort_fields={
        **standard_audit_sort_fields(DiscountOffer),
        "branch_id": DiscountOffer.branch_id,
        "name": DiscountOffer.name,
        "code": DiscountOffer.code,
        "service_scope": DiscountOffer.service_scope,
        "discount_type": DiscountOffer.discount_type,
        "value": DiscountOffer.value,
        "minimum_bill_amount": DiscountOffer.minimum_bill_amount,
        "max_discount_amount": DiscountOffer.max_discount_amount,
        "valid_from": DiscountOffer.valid_from,
        "valid_until": DiscountOffer.valid_until,
        "is_active": DiscountOffer.is_active,
    },
)
