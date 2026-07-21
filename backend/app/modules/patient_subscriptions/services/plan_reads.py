from app.modules.patient_subscriptions.models import PatientSubscriptionPlan
from app.modules.patient_subscriptions.schemas import PatientSubscriptionPlanRead
from app.modules.patient_subscriptions.services.serialization import (
    free_items_from_json,
    ids_from_json,
    slabs_from_json,
)


def plan_to_read_dict(plan: PatientSubscriptionPlan) -> dict:
    data = {
        "id": plan.id,
        "tenant_id": plan.tenant_id,
        "branch_id": plan.branch_id,
        "name": plan.name,
        "code": plan.code,
        "price_amount": plan.price_amount,
        "duration_days": plan.duration_days,
        "activation_after_days": plan.activation_after_days,
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
    data["free_consultation_department_ids"] = ids_from_json(
        plan.free_consultation_department_ids_json
    )
    free_lab = free_items_from_json(plan.free_lab_test_ids_json)
    free_medicine = free_items_from_json(plan.free_medicine_ids_json)
    data["free_lab_test_ids"] = sorted(free_lab.keys())
    data["free_lab_test_quantities"] = free_lab
    data["discounted_lab_test_ids"] = ids_from_json(plan.discounted_lab_test_ids_json)
    data["free_medicine_ids"] = sorted(free_medicine.keys())
    data["free_medicine_quantities"] = free_medicine
    data["discounted_medicine_ids"] = ids_from_json(plan.discounted_medicine_ids_json)
    data["pharmacy_discount_slabs"] = slabs_from_json(plan.pharmacy_discount_slabs_json)
    return data


def read_plan(plan: PatientSubscriptionPlan) -> PatientSubscriptionPlanRead:
    return PatientSubscriptionPlanRead(**plan_to_read_dict(plan))
