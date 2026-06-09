import json
from datetime import date, timedelta

from sqlmodel import Session, select

from app.modules.billing.models import Invoice
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionEnrollmentStatus,
    PatientSubscriptionPlan,
)


def ids_to_json(values: list[str] | None) -> str:
    return json.dumps(sorted({str(value) for value in values or [] if value}))


def ids_from_json(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw]


def plan_to_read_dict(plan: PatientSubscriptionPlan) -> dict:
    data = {
        "id": plan.id,
        "tenant_id": plan.tenant_id,
        "branch_id": plan.branch_id,
        "name": plan.name,
        "code": plan.code,
        "price_amount": plan.price_amount,
        "duration_days": plan.duration_days,
        "free_consultations": plan.free_consultations,
        "lab_discount_percentage": plan.lab_discount_percentage,
        "pharmacy_discount_percentage": plan.pharmacy_discount_percentage,
        "min_discount_amount": plan.min_discount_amount,
        "is_active": plan.is_active,
        "created_by_user_id": plan.created_by_user_id,
        "updated_by_user_id": plan.updated_by_user_id,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    }
    data["free_lab_test_ids"] = ids_from_json(plan.free_lab_test_ids_json)
    data["discounted_lab_test_ids"] = ids_from_json(plan.discounted_lab_test_ids_json)
    data["free_medicine_ids"] = ids_from_json(plan.free_medicine_ids_json)
    data["discounted_medicine_ids"] = ids_from_json(plan.discounted_medicine_ids_json)
    return data


def active_patient_enrollment(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    patient_id: str,
) -> tuple[PatientSubscriptionEnrollment, PatientSubscriptionPlan] | None:
    today = date.today()
    rows = session.exec(
        select(PatientSubscriptionEnrollment)
        .where(
            PatientSubscriptionEnrollment.tenant_id == tenant_id,
            PatientSubscriptionEnrollment.patient_id == patient_id,
            PatientSubscriptionEnrollment.status == PatientSubscriptionEnrollmentStatus.ACTIVE,
            PatientSubscriptionEnrollment.starts_on <= today,
            PatientSubscriptionEnrollment.ends_on >= today,
        )
        .order_by(PatientSubscriptionEnrollment.created_at.desc())
    ).all()
    for enrollment in rows:
        if enrollment.branch_id != branch_id:
            continue
        plan = session.get(PatientSubscriptionPlan, enrollment.plan_id)
        if not plan or plan.tenant_id != tenant_id or not plan.is_active:
            continue
        if plan.price_amount > 0:
            if enrollment.purchase_invoice_id:
                invoice = session.get(Invoice, enrollment.purchase_invoice_id)
                if (
                    not invoice
                    or invoice.tenant_id != tenant_id
                    or invoice.balance_amount > 0
                ):
                    continue
            elif enrollment.paid_amount < plan.price_amount:
                continue
        return enrollment, plan
    return None


def enrollment_end_date(starts_on: date, plan: PatientSubscriptionPlan) -> date:
    return starts_on + timedelta(days=max(plan.duration_days, 1) - 1)


def benefit_preview(
    *,
    plan: PatientSubscriptionPlan,
    enrollment: PatientSubscriptionEnrollment,
    service_type: str,
    item_ids: list[str],
    subtotal_amount: int,
) -> dict:
    item_set = set(item_ids or [])
    discount_amount = 0
    free_item_ids: list[str] = []
    discounted_item_ids: list[str] = []
    reason = None
    if service_type == "consultation":
        remaining = max(plan.free_consultations - enrollment.used_consultations, 0)
        if remaining > 0:
            discount_amount = subtotal_amount
            reason = f"{remaining} free consultation remaining"
        else:
            reason = "No free consultations remaining"
    elif service_type == "lab":
        free_ids = set(ids_from_json(plan.free_lab_test_ids_json))
        discounted_ids = set(ids_from_json(plan.discounted_lab_test_ids_json))
        free_item_ids = sorted(item_set.intersection(free_ids))
        discounted_item_ids = sorted(item_set.intersection(discounted_ids))
        if free_item_ids:
            discount_amount = subtotal_amount
            reason = "Selected lab test is fully free in this plan"
        elif plan.lab_discount_percentage > 0 and (not discounted_ids or discounted_item_ids):
            if subtotal_amount > plan.min_discount_amount:
                discount_amount = round(subtotal_amount * plan.lab_discount_percentage / 100)
                reason = f"{plan.lab_discount_percentage}% lab discount"
            else:
                reason = (
                    f"Lab bill must exceed ₹{plan.min_discount_amount} "
                    f"to unlock the {plan.lab_discount_percentage}% lab discount"
                )
    elif service_type == "pharmacy":
        free_ids = set(ids_from_json(plan.free_medicine_ids_json))
        discounted_ids = set(ids_from_json(plan.discounted_medicine_ids_json))
        free_item_ids = sorted(item_set.intersection(free_ids))
        discounted_item_ids = sorted(item_set.intersection(discounted_ids))
        if free_item_ids:
            discount_amount = subtotal_amount
            reason = "Selected medicine is fully free in this plan"
        elif plan.pharmacy_discount_percentage > 0 and (not discounted_ids or discounted_item_ids):
            if subtotal_amount > plan.min_discount_amount:
                discount_amount = round(subtotal_amount * plan.pharmacy_discount_percentage / 100)
                reason = f"{plan.pharmacy_discount_percentage}% pharmacy discount"
            else:
                reason = (
                    f"Pharmacy bill must exceed ₹{plan.min_discount_amount} "
                    f"to unlock the {plan.pharmacy_discount_percentage}% pharmacy discount"
                )
    discount_amount = min(discount_amount, subtotal_amount)
    return {
        "plan_id": plan.id,
        "plan_name": plan.name,
        "service_type": service_type,
        "subtotal_amount": subtotal_amount,
        "discount_amount": discount_amount,
        "payable_amount": max(subtotal_amount - discount_amount, 0),
        "free_item_ids": free_item_ids,
        "discounted_item_ids": discounted_item_ids,
        "reason": reason,
    }
