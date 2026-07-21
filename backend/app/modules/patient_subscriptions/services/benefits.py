import logging

from sqlmodel import Session

from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionPlan,
)
from app.modules.patient_subscriptions.services.eligibility import (
    consultation_department_is_eligible,
)
from app.modules.patient_subscriptions.services.serialization import (
    free_items_from_json,
    ids_from_json,
    slabs_from_json,
    usage_from_json,
    usage_to_json,
)


benefit_logger = logging.getLogger("medizinhub.membership")


def benefit_preview(
    *,
    plan: PatientSubscriptionPlan,
    enrollment: PatientSubscriptionEnrollment,
    service_type: str,
    item_ids: list[str],
    subtotal_amount: int,
    item_amounts: dict[str, int] | None = None,
    department_id: str | None = None,
    session: Session | None = None,
) -> dict:
    item_set = set(item_ids or [])
    item_amounts = item_amounts or {}
    if service_type != "consultation":
        department_id = None
    discount_amount = 0
    free_items_amount = 0
    item_discount_amount = 0
    regular_items_amount = subtotal_amount
    free_item_ids: list[str] = []
    discounted_item_ids: list[str] = []
    reason = None
    if service_type == "consultation":
        if not consultation_department_is_eligible(
            session, plan=plan, department_id=department_id
        ):
            reason = "Free consultation applies only to the plan's selected medical department"
        else:
            remaining = max(plan.free_consultations - enrollment.used_consultations, 0)
            if remaining > 0:
                discount_amount = subtotal_amount
                reason = f"{remaining} free consultation remaining"
            else:
                reason = "No free consultations remaining"
    elif service_type == "lab":
        free_map = free_items_from_json(plan.free_lab_test_ids_json)
        used = usage_from_json(enrollment.used_free_lab_json)
        discounted_ids = set(ids_from_json(plan.discounted_lab_test_ids_json))
        free_item_ids = sorted(
            item_id
            for item_id in item_set
            if item_id in free_map and (free_map[item_id] - used.get(item_id, 0)) > 0
        )
        discounted_item_ids = sorted(
            item_set.intersection(discounted_ids).difference(free_item_ids)
        )
        if free_item_ids:
            free_items_amount = sum(
                int(item_amounts.get(item_id, 0) or 0) for item_id in free_item_ids
            )
            if free_items_amount <= 0:
                free_items_amount = subtotal_amount
            reason = "Selected lab test is fully free in this plan"
        discount_basis_ids = (
            discounted_item_ids
            if discounted_ids
            else sorted(item_set.difference(free_item_ids))
        )
        if not discounted_ids:
            discounted_item_ids = discount_basis_ids
        discount_basis = sum(
            int(item_amounts.get(item_id, 0) or 0) for item_id in discount_basis_ids
        )
        if not item_amounts and not free_item_ids:
            discount_basis = subtotal_amount
        if plan.lab_discount_percentage > 0 and discount_basis > 0:
            if subtotal_amount > plan.min_discount_amount:
                item_discount_amount = round(
                    discount_basis * plan.lab_discount_percentage / 100
                )
                discount_reason = f"{plan.lab_discount_percentage}% lab discount"
                reason = f"{reason}; {discount_reason}" if reason else discount_reason
            elif not reason:
                reason = (
                    f"Lab bill must exceed ₹{plan.min_discount_amount} "
                    f"to unlock the {plan.lab_discount_percentage}% lab discount"
                )
    elif service_type == "pharmacy":
        free_map = free_items_from_json(plan.free_medicine_ids_json)
        used = usage_from_json(enrollment.used_free_medicine_json)
        discounted_ids = set(ids_from_json(plan.discounted_medicine_ids_json))
        free_item_ids = sorted(
            item_id
            for item_id in item_set
            if item_id in free_map and (free_map[item_id] - used.get(item_id, 0)) > 0
        )
        discounted_item_ids = sorted(
            item_set.intersection(discounted_ids).difference(free_item_ids)
        )
        if free_item_ids:
            free_items_amount = sum(
                int(item_amounts.get(item_id, 0) or 0) for item_id in free_item_ids
            )
            if free_items_amount <= 0:
                free_items_amount = subtotal_amount
            reason = "Selected medicine is fully free in this plan"
        discount_basis_ids = (
            discounted_item_ids
            if discounted_ids
            else sorted(item_set.difference(free_item_ids))
        )
        if not discounted_ids:
            discounted_item_ids = discount_basis_ids
        discount_basis = sum(
            int(item_amounts.get(item_id, 0) or 0) for item_id in discount_basis_ids
        )
        if not item_amounts and not free_item_ids:
            discount_basis = subtotal_amount
        if discount_basis > 0:
            matching_slabs = [
                slab
                for slab in slabs_from_json(plan.pharmacy_discount_slabs_json)
                if subtotal_amount >= int(slab["min_amount"] or 0)
                and (
                    slab["max_amount"] is None
                    or subtotal_amount <= int(slab["max_amount"] or 0)
                )
            ]
            if matching_slabs:
                slab = sorted(
                    matching_slabs,
                    key=lambda item: int(item["discount_percentage"] or 0),
                    reverse=True,
                )[0]
                percentage = int(slab["discount_percentage"] or 0)
                item_discount_amount = round(discount_basis * percentage / 100)
                max_label = (
                    f"₹{slab['max_amount']}"
                    if slab["max_amount"] is not None
                    else "above"
                )
                discount_reason = f"{percentage}% pharmacy discount for ₹{slab['min_amount']} - {max_label} bill"
                reason = f"{reason}; {discount_reason}" if reason else discount_reason
            elif (
                plan.pharmacy_discount_percentage > 0
                and subtotal_amount >= plan.min_discount_amount
            ):
                item_discount_amount = round(
                    discount_basis * plan.pharmacy_discount_percentage / 100
                )
                discount_reason = (
                    f"{plan.pharmacy_discount_percentage}% pharmacy discount"
                )
                reason = f"{reason}; {discount_reason}" if reason else discount_reason
            elif not reason:
                reason = (
                    "Pharmacy bill is outside the membership discount slabs"
                    if slabs_from_json(plan.pharmacy_discount_slabs_json)
                    else f"Pharmacy bill must be at least ₹{plan.min_discount_amount} "
                    f"to unlock the {plan.pharmacy_discount_percentage}% pharmacy discount"
                )
    if service_type in ("lab", "pharmacy"):
        free_items_amount = min(free_items_amount, subtotal_amount)
        item_discount_amount = min(
            item_discount_amount, max(subtotal_amount - free_items_amount, 0)
        )
        discount_amount = free_items_amount + item_discount_amount
        benefit_original_amount = free_items_amount
        if item_amounts and item_discount_amount > 0:
            benefit_original_amount += sum(
                int(item_amounts.get(item_id, 0) or 0)
                for item_id in discounted_item_ids
            )
        regular_items_amount = max(subtotal_amount - benefit_original_amount, 0)
    discount_amount = min(discount_amount, subtotal_amount)
    if service_type == "consultation":
        log = benefit_logger.info if discount_amount > 0 else benefit_logger.warning
        log(
            "membership.consultation_benefit_evaluated",
            extra={
                "tenant_id": plan.tenant_id,
                "plan_id": plan.id,
                "enrollment_id": enrollment.id,
                "department_id": department_id,
                "allocated": int(plan.free_consultations or 0),
                "used": int(enrollment.used_consultations or 0),
                "discount_amount": discount_amount,
                "eligible": discount_amount > 0,
                "reason": reason,
            },
        )
    return {
        "plan_id": plan.id,
        "plan_name": plan.name,
        "service_type": service_type,
        "subtotal_amount": subtotal_amount,
        "discount_amount": discount_amount,
        "free_items_amount": free_items_amount,
        "item_discount_amount": item_discount_amount,
        "regular_items_amount": regular_items_amount,
        "payable_amount": max(subtotal_amount - discount_amount, 0),
        "free_item_ids": free_item_ids,
        "discounted_item_ids": discounted_item_ids,
        "reason": reason,
    }


def consume_free_items(
    enrollment: PatientSubscriptionEnrollment,
    *,
    service_type: str,
    free_item_ids: list[str],
) -> None:
    """Increment per-test free-item usage counters on the enrollment (in place)."""
    if not free_item_ids:
        return
    if service_type == "lab":
        usage = usage_from_json(enrollment.used_free_lab_json)
        for item_id in free_item_ids:
            usage[item_id] = usage.get(item_id, 0) + 1
        enrollment.used_free_lab_json = usage_to_json(usage)
    elif service_type == "pharmacy":
        usage = usage_from_json(enrollment.used_free_medicine_json)
        for item_id in free_item_ids:
            usage[item_id] = usage.get(item_id, 0) + 1
        enrollment.used_free_medicine_json = usage_to_json(usage)
