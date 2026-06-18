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
    if isinstance(raw, dict):
        return [str(key) for key in raw.keys()]
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw]


def free_items_to_json(
    ids: list[str] | None, quantities: dict[str, int] | None = None
) -> str:
    """Store free items as a {item_id: free_quantity} map (quantity >= 1)."""
    quantities = quantities or {}
    result: dict[str, int] = {}
    for raw_id in ids or []:
        item_id = str(raw_id)
        if not item_id:
            continue
        qty = int(quantities.get(item_id, 1) or 1)
        result[item_id] = max(qty, 1)
    return json.dumps(dict(sorted(result.items())))


def free_items_from_json(value: str | None) -> dict[str, int]:
    """Read free items as {item_id: free_quantity}. Legacy lists map to quantity 1."""
    if not value:
        return {}
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        return {}
    result: dict[str, int] = {}
    if isinstance(raw, list):
        for item in raw:
            item_id = str(item)
            if item_id:
                result[item_id] = 1
    elif isinstance(raw, dict):
        for key, qty in raw.items():
            item_id = str(key)
            if not item_id:
                continue
            try:
                result[item_id] = max(int(qty), 1)
            except (TypeError, ValueError):
                result[item_id] = 1
    return result


def usage_from_json(value: str | None) -> dict[str, int]:
    """Read a per-enrollment usage counter map {item_id: used_count}."""
    if not value:
        return {}
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        return {}
    if not isinstance(raw, dict):
        return {}
    result: dict[str, int] = {}
    for key, count in raw.items():
        item_id = str(key)
        if not item_id:
            continue
        try:
            result[item_id] = max(int(count), 0)
        except (TypeError, ValueError):
            result[item_id] = 0
    return result


def usage_to_json(usage: dict[str, int]) -> str:
    return json.dumps(dict(sorted((str(k), max(int(v), 0)) for k, v in usage.items())))


def sync_free_item_usage_from_invoices(
    session: Session,
    enrollment: PatientSubscriptionEnrollment,
    plan: PatientSubscriptionPlan,
) -> None:
    """Rebuild consumed free lab/medicine counts from already-applied invoices.

    This protects older invoices created before usage counters were consumed at
    invoice creation time.
    """
    free_lab = free_items_from_json(plan.free_lab_test_ids_json)
    free_medicine = free_items_from_json(plan.free_medicine_ids_json)
    if not free_lab and not free_medicine:
        return

    lab_usage: dict[str, int] = {}
    medicine_usage: dict[str, int] = {}
    invoices = session.exec(
        select(Invoice).where(
            Invoice.tenant_id == enrollment.tenant_id,
            Invoice.patient_subscription_enrollment_id == enrollment.id,
            Invoice.membership_discount_amount > 0,
        )
    ).all()
    for invoice in invoices:
        remaining_discount = int(invoice.membership_discount_amount or 0)
        if remaining_discount <= 0:
            continue
        if invoice.lab_order_id and free_lab:
            from app.modules.lab.models import LabOrderItem

            for item in session.exec(
                select(LabOrderItem).where(
                    LabOrderItem.tenant_id == invoice.tenant_id,
                    LabOrderItem.lab_order_id == invoice.lab_order_id,
                )
            ).all():
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
            from app.modules.pharmacy.models import PharmacyIssueItem

            for item in session.exec(
                select(PharmacyIssueItem).where(
                    PharmacyIssueItem.tenant_id == invoice.tenant_id,
                    PharmacyIssueItem.pharmacy_issue_id == invoice.pharmacy_issue_id,
                )
            ).all():
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


def slabs_to_json(values: list[dict[str, int | None]] | None) -> str:
    normalized: list[dict[str, int | None]] = []
    for row in values or []:
        min_amount = int(row.get("min_amount") or 0)
        max_amount = row.get("max_amount")
        discount_percentage = int(row.get("discount_percentage") or 0)
        if discount_percentage <= 0:
            continue
        normalized.append(
            {
                "min_amount": max(min_amount, 0),
                "max_amount": max(int(max_amount), 0)
                if max_amount is not None
                else None,
                "discount_percentage": min(discount_percentage, 100),
            }
        )
    normalized.sort(key=lambda item: (item["min_amount"], item["max_amount"] or 10**12))
    return json.dumps(normalized)


def slabs_from_json(value: str | None) -> list[dict[str, int | None]]:
    if not value:
        return []
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(raw, list):
        return []
    rows: list[dict[str, int | None]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        discount_percentage = int(item.get("discount_percentage") or 0)
        if discount_percentage <= 0:
            continue
        max_amount = item.get("max_amount")
        rows.append(
            {
                "min_amount": max(int(item.get("min_amount") or 0), 0),
                "max_amount": max(int(max_amount), 0)
                if max_amount is not None
                else None,
                "discount_percentage": min(discount_percentage, 100),
            }
        )
    return rows


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


def active_patient_enrollment(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    patient_id: str,
) -> tuple[PatientSubscriptionEnrollment, PatientSubscriptionPlan] | None:
    """Return the patient's active tenant-scoped membership.

    The branch_id argument is kept for callers that validate branch access before
    asking for benefits. Membership benefits are tenant-scoped: a patient enrolled
    from one branch can claim benefits from another branch in the same tenant.
    """
    today = date.today()
    rows = session.exec(
        select(PatientSubscriptionEnrollment)
        .where(
            PatientSubscriptionEnrollment.tenant_id == tenant_id,
            PatientSubscriptionEnrollment.patient_id == patient_id,
            PatientSubscriptionEnrollment.status
            == PatientSubscriptionEnrollmentStatus.ACTIVE,
            PatientSubscriptionEnrollment.starts_on <= today,
            PatientSubscriptionEnrollment.ends_on >= today,
        )
        .order_by(PatientSubscriptionEnrollment.created_at.desc())
    ).all()
    for enrollment in rows:
        plan = session.get(PatientSubscriptionPlan, enrollment.plan_id)
        if not plan or plan.tenant_id != tenant_id or not plan.is_active:
            continue
        activation_date = enrollment.starts_on + timedelta(
            days=max(plan.activation_after_days, 0)
        )
        if today < activation_date:
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


def consultation_department_id(
    session: Session,
    *,
    appointment_id: str | None = None,
    consultation_id: str | None = None,
) -> str | None:
    """Resolve the medical department for a consultation, via its appointment."""
    from app.modules.appointments.models import Appointment
    from app.modules.consultations.models import Consultation

    if appointment_id:
        appointment = session.get(Appointment, appointment_id)
        if appointment and appointment.department_id:
            return appointment.department_id
    if consultation_id:
        consultation = session.get(Consultation, consultation_id)
        if consultation and consultation.appointment_id:
            appointment = session.get(Appointment, consultation.appointment_id)
            if appointment and appointment.department_id:
                return appointment.department_id
    return None


def benefit_preview(
    *,
    plan: PatientSubscriptionPlan,
    enrollment: PatientSubscriptionEnrollment,
    service_type: str,
    item_ids: list[str],
    subtotal_amount: int,
    item_amounts: dict[str, int] | None = None,
    department_id: str | None = None,
) -> dict:
    item_set = set(item_ids or [])
    item_amounts = item_amounts or {}
    if service_type != "consultation":
        department_id = None
    discount_amount = 0
    free_item_ids: list[str] = []
    discounted_item_ids: list[str] = []
    reason = None
    if service_type == "consultation":
        allowed_departments = set(
            ids_from_json(plan.free_consultation_department_ids_json)
        )
        if allowed_departments and (
            department_id is None or department_id not in allowed_departments
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
        discounted_item_ids = sorted(item_set.intersection(discounted_ids))
        if free_item_ids:
            discount_amount = sum(
                int(item_amounts.get(item_id, 0) or 0) for item_id in free_item_ids
            )
            if discount_amount <= 0:
                discount_amount = subtotal_amount
            reason = "Selected lab test is fully free in this plan"
        elif plan.lab_discount_percentage > 0 and (
            not discounted_ids or discounted_item_ids
        ):
            if subtotal_amount > plan.min_discount_amount:
                discount_amount = round(
                    subtotal_amount * plan.lab_discount_percentage / 100
                )
                reason = f"{plan.lab_discount_percentage}% lab discount"
            else:
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
        discounted_item_ids = sorted(item_set.intersection(discounted_ids))
        if free_item_ids:
            discount_amount = sum(
                int(item_amounts.get(item_id, 0) or 0) for item_id in free_item_ids
            )
            if discount_amount <= 0:
                discount_amount = subtotal_amount
            reason = "Selected medicine is fully free in this plan"
        elif not discounted_ids or discounted_item_ids:
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
                discount_amount = round(subtotal_amount * percentage / 100)
                max_label = (
                    f"₹{slab['max_amount']}"
                    if slab["max_amount"] is not None
                    else "above"
                )
                reason = f"{percentage}% pharmacy discount for ₹{slab['min_amount']} - {max_label} bill"
            elif (
                plan.pharmacy_discount_percentage > 0
                and subtotal_amount >= plan.min_discount_amount
            ):
                discount_amount = round(
                    subtotal_amount * plan.pharmacy_discount_percentage / 100
                )
                reason = f"{plan.pharmacy_discount_percentage}% pharmacy discount"
            else:
                reason = (
                    "Pharmacy bill is outside the membership discount slabs"
                    if slabs_from_json(plan.pharmacy_discount_slabs_json)
                    else f"Pharmacy bill must be at least ₹{plan.min_discount_amount} "
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
