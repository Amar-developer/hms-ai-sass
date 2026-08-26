from sqlmodel import Session, select

from app.modules.lab.models import LabTestCatalog
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionPlan,
)
from app.modules.patient_subscriptions.services.serialization import (
    free_items_from_json,
    ids_from_json,
    slabs_from_json,
    usage_from_json,
)
from app.modules.pharmacy.models import MedicineCatalog


def _catalog_names(
    session: Session, model, tenant_id: str, ids: list[str]
) -> dict[str, str]:
    if not ids:
        return {}
    rows = session.exec(
        select(model).where(model.tenant_id == tenant_id, model.id.in_(ids))
    ).all()
    return {str(row.id): str(row.name) for row in rows}


def _catalog_rows(session: Session, model, tenant_id: str, ids: list[str]) -> dict:
    if not ids:
        return {}
    rows = session.exec(
        select(model).where(model.tenant_id == tenant_id, model.id.in_(ids))
    ).all()
    return {str(row.id): row for row in rows}


def _joined_items(items: list[str]) -> str:
    if len(items) < 2:
        return "".join(items)
    return f"{', '.join(items[:-1])} & {items[-1]}"


def _item_scope(names: list[str], fallback: str) -> str:
    if not names:
        return fallback
    visible = names[:8]
    suffix = (
        f" and {len(names) - len(visible)} more" if len(names) > len(visible) else ""
    )
    return f"{', '.join(visible)}{suffix}"


def available_membership_benefits_summary(
    session: Session,
    *,
    enrollment: PatientSubscriptionEnrollment,
    plan: PatientSubscriptionPlan,
) -> str:
    """Render the benefits still available on one patient enrollment."""
    benefits: list[str] = []

    consultations = max(
        int(plan.free_consultations or 0) - int(enrollment.used_consultations or 0),
        0,
    )
    if consultations:
        noun = "consultation" if consultations == 1 else "consultations"
        benefits.append(f"🩺 {consultations} FREE {noun}")

    free_lab = free_items_from_json(plan.free_lab_test_ids_json)
    used_lab = usage_from_json(enrollment.used_free_lab_json)
    lab_rows = _catalog_rows(session, LabTestCatalog, plan.tenant_id, list(free_lab))
    remaining_lab_items: list[str] = []
    remaining_lab_value = 0
    for item_id, allowance in free_lab.items():
        remaining = max(int(allowance) - int(used_lab.get(item_id, 0)), 0)
        if remaining:
            row = lab_rows.get(item_id)
            remaining_lab_items.append(
                f"{row.name if row else 'Lab test'} ({remaining})"
            )
            remaining_lab_value += remaining * int(row.default_price if row else 0)
    if remaining_lab_items:
        worth = f" Worth ₹{remaining_lab_value}" if remaining_lab_value else ""
        benefits.append(
            f"🎁 FREE Lab Tests{worth} – {_joined_items(remaining_lab_items)}"
        )

    free_medicine = free_items_from_json(plan.free_medicine_ids_json)
    used_medicine = usage_from_json(enrollment.used_free_medicine_json)
    medicine_rows = _catalog_rows(
        session, MedicineCatalog, plan.tenant_id, list(free_medicine)
    )
    remaining_medicine_items: list[str] = []
    remaining_medicine_value = 0
    for item_id, allowance in free_medicine.items():
        remaining = max(int(allowance) - int(used_medicine.get(item_id, 0)), 0)
        if remaining:
            row = medicine_rows.get(item_id)
            remaining_medicine_items.append(
                f"{row.name if row else 'Medicine'} ({remaining})"
            )
            remaining_medicine_value += remaining * int(
                row.default_sale_price if row else 0
            )
    if remaining_medicine_items:
        worth = (
            f" Worth ₹{remaining_medicine_value}" if remaining_medicine_value else ""
        )
        benefits.append(
            f"💊 FREE Medicines{worth} – {_joined_items(remaining_medicine_items)}"
        )

    discounted_lab_ids = ids_from_json(plan.discounted_lab_test_ids_json)
    discounted_lab_names = _catalog_names(
        session, LabTestCatalog, plan.tenant_id, discounted_lab_ids
    )
    if plan.lab_discount_percentage:
        lab_scope = _item_scope(
            [
                discounted_lab_names[item_id]
                for item_id in discounted_lab_ids
                if item_id in discounted_lab_names
            ],
            "eligible lab tests",
        )
        minimum = (
            f" on bills above ₹{plan.min_discount_amount}"
            if plan.min_discount_amount
            else ""
        )
        benefits.append(
            f"🧪 {plan.lab_discount_percentage}% OFF on "
            f"{lab_scope}{minimum} (no usage limit during membership)"
        )

    slabs = slabs_from_json(plan.pharmacy_discount_slabs_json)
    discounted_medicine_ids = ids_from_json(plan.discounted_medicine_ids_json)
    discounted_medicine_names = _catalog_names(
        session, MedicineCatalog, plan.tenant_id, discounted_medicine_ids
    )
    medicine_scope = _item_scope(
        [
            discounted_medicine_names[item_id]
            for item_id in discounted_medicine_ids
            if item_id in discounted_medicine_names
        ],
        "eligible medicines",
    )
    if slabs:
        for slab in slabs:
            minimum = int(slab["min_amount"] or 0)
            maximum = slab["max_amount"]
            amount_range = (
                f"₹{minimum}–₹{int(maximum)}"
                if maximum is not None
                else f"₹{minimum} and above"
            )
            benefits.append(
                f"💊 {slab['discount_percentage']}% OFF on "
                f"{medicine_scope} on {amount_range} bills "
                "(no usage limit during membership)"
            )
    elif plan.pharmacy_discount_percentage:
        minimum = (
            f" on bills from ₹{plan.min_discount_amount}"
            if plan.min_discount_amount
            else ""
        )
        benefits.append(
            f"💊 {plan.pharmacy_discount_percentage}% OFF on "
            f"{medicine_scope}{minimum} (no usage limit during membership)"
        )

    if not benefits:
        return "No membership benefits currently available"
    return " | ".join(benefits)
