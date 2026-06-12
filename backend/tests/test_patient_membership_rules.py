from datetime import date, timedelta

from sqlmodel import Session

from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.billing.service import update_invoice_payment_status
from app.api.v1.billing import _normalize_invoice_status
from app.modules.lab.models import LabOrder, LabOrderItem
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionPlan,
)
from app.modules.patient_subscriptions.service import (
    active_patient_enrollment,
    benefit_preview,
    consume_free_items,
    free_items_from_json,
    free_items_to_json,
    slabs_to_json,
    sync_free_item_usage_from_invoices,
)


def test_patient_membership_respects_activation_delay(test_engine):
    tenant_id = "tenant_membership"
    branch_id = "branch_main"
    patient_id = "patient_waiting"
    active_patient_id = "patient_active"
    with Session(test_engine) as session:
        waiting_plan = PatientSubscriptionPlan(
            id="ptplan_waiting",
            tenant_id=tenant_id,
            branch_id=branch_id,
            name="Activation Delay Plan",
            price_amount=0,
            duration_days=120,
            activation_after_days=7,
            free_consultations=1,
        )
        active_plan = PatientSubscriptionPlan(
            id="ptplan_active",
            tenant_id=tenant_id,
            branch_id=branch_id,
            name="Active Benefit Plan",
            price_amount=0,
            duration_days=120,
            activation_after_days=7,
            free_consultations=2,
        )
        session.add(waiting_plan)
        session.add(active_plan)
        session.add(
            PatientSubscriptionEnrollment(
                tenant_id=tenant_id,
                branch_id=branch_id,
                patient_id=patient_id,
                plan_id=waiting_plan.id,
                starts_on=date.today(),
                ends_on=date.today() + timedelta(days=119),
            )
        )
        session.add(
            PatientSubscriptionEnrollment(
                tenant_id=tenant_id,
                branch_id=branch_id,
                patient_id=active_patient_id,
                plan_id=active_plan.id,
                starts_on=date.today() - timedelta(days=7),
                ends_on=date.today() + timedelta(days=112),
            )
        )
        session.commit()

        assert (
            active_patient_enrollment(
                session,
                tenant_id=tenant_id,
                branch_id=branch_id,
                patient_id=patient_id,
            )
            is None
        )
        active = active_patient_enrollment(
            session,
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=active_patient_id,
        )

    assert active is not None
    enrollment, plan = active
    assert enrollment.patient_id == active_patient_id
    assert plan.name == "Active Benefit Plan"


def test_patient_membership_pharmacy_slab_discount():
    plan = PatientSubscriptionPlan(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        name="Slab Discount Plan",
        pharmacy_discount_slabs_json=slabs_to_json(
            [
                {"min_amount": 100, "max_amount": 500, "discount_percentage": 3},
                {"min_amount": 500, "max_amount": 1000, "discount_percentage": 5},
            ]
        ),
    )
    enrollment = PatientSubscriptionEnrollment(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        patient_id="patient_slab",
        plan_id=plan.id,
        starts_on=date.today(),
        ends_on=date.today() + timedelta(days=119),
    )

    first_slab = benefit_preview(
        plan=plan,
        enrollment=enrollment,
        service_type="pharmacy",
        item_ids=[],
        subtotal_amount=400,
    )
    second_slab = benefit_preview(
        plan=plan,
        enrollment=enrollment,
        service_type="pharmacy",
        item_ids=[],
        subtotal_amount=800,
    )

    assert first_slab["discount_amount"] == 12
    assert second_slab["discount_amount"] == 40


def test_free_consultation_restricted_to_selected_department():
    plan = PatientSubscriptionPlan(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        name="General Medicine Plan",
        free_consultations=2,
        free_consultation_department_ids_json='["dept_genmed"]',
    )
    enrollment = PatientSubscriptionEnrollment(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        patient_id="patient_consult",
        plan_id=plan.id,
        starts_on=date.today(),
        ends_on=date.today() + timedelta(days=119),
    )

    def preview(department_id):
        return benefit_preview(
            plan=plan,
            enrollment=enrollment,
            service_type="consultation",
            item_ids=[],
            subtotal_amount=300,
            department_id=department_id,
        )

    # Allowed department -> free consultation granted.
    allowed = preview("dept_genmed")
    assert allowed["discount_amount"] == 300

    # Other department -> no free consultation.
    other = preview("dept_cardio")
    assert other["discount_amount"] == 0
    assert "department" in (other["reason"] or "").lower()

    # Unknown department (e.g. walk-in without department) -> no free consultation.
    assert preview(None)["discount_amount"] == 0


def test_free_consultation_unrestricted_when_no_department_selected():
    plan = PatientSubscriptionPlan(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        name="Open Consult Plan",
        free_consultations=1,
    )
    enrollment = PatientSubscriptionEnrollment(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        patient_id="patient_open",
        plan_id=plan.id,
        starts_on=date.today(),
        ends_on=date.today() + timedelta(days=119),
    )
    # Empty department list = applies to any department (backward compatible).
    result = benefit_preview(
        plan=plan,
        enrollment=enrollment,
        service_type="consultation",
        item_ids=[],
        subtotal_amount=300,
        department_id="dept_anything",
    )
    assert result["discount_amount"] == 300


def test_free_items_json_roundtrip_and_legacy():
    # Legacy plain list loads as quantity 1 each.
    assert free_items_from_json('["LABBP", "LABHB"]') == {"LABBP": 1, "LABHB": 1}
    # New map form preserves quantities (min 1).
    stored = free_items_to_json(["LABBP", "LABHB"], {"LABBP": 2, "LABHB": 0})
    assert free_items_from_json(stored) == {"LABBP": 2, "LABHB": 1}


def test_free_lab_test_quantity_is_consumed_then_falls_back_to_discount():
    plan = PatientSubscriptionPlan(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        name="Quantity Plan",
        lab_discount_percentage=5,
        free_lab_test_ids_json=free_items_to_json(["LABBP"], {"LABBP": 2}),
    )
    enrollment = PatientSubscriptionEnrollment(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        patient_id="patient_qty",
        plan_id=plan.id,
        starts_on=date.today(),
        ends_on=date.today() + timedelta(days=119),
    )

    def preview():
        return benefit_preview(
            plan=plan,
            enrollment=enrollment,
            service_type="lab",
            item_ids=["LABBP"],
            subtotal_amount=200,
        )

    # First two redemptions are fully free.
    first = preview()
    assert first["free_item_ids"] == ["LABBP"]
    assert first["discount_amount"] == 200
    consume_free_items(enrollment, service_type="lab", free_item_ids=first["free_item_ids"])

    second = preview()
    assert second["free_item_ids"] == ["LABBP"]
    consume_free_items(enrollment, service_type="lab", free_item_ids=second["free_item_ids"])

    # Third redemption: quota exhausted, falls back to the 5% lab discount.
    third = preview()
    assert third["free_item_ids"] == []
    assert third["discount_amount"] == 10


def test_free_lab_test_discount_uses_item_amount_and_quantity_limit():
    plan = PatientSubscriptionPlan(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        name="Specific Free Lab Plan",
        lab_discount_percentage=5,
        free_lab_test_ids_json=free_items_to_json(["LABRBS"], {"LABRBS": 1}),
    )
    enrollment = PatientSubscriptionEnrollment(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        patient_id="patient_rbs",
        plan_id=plan.id,
        starts_on=date.today(),
        ends_on=date.today() + timedelta(days=119),
    )

    first = benefit_preview(
        plan=plan,
        enrollment=enrollment,
        service_type="lab",
        item_ids=["LABHB", "LABRBS"],
        item_amounts={"LABHB": 150, "LABRBS": 75},
        subtotal_amount=225,
    )
    assert first["free_item_ids"] == ["LABRBS"]
    assert first["discount_amount"] == 75

    consume_free_items(enrollment, service_type="lab", free_item_ids=first["free_item_ids"])
    second = benefit_preview(
        plan=plan,
        enrollment=enrollment,
        service_type="lab",
        item_ids=["LABRBS"],
        item_amounts={"LABRBS": 75},
        subtotal_amount=75,
    )

    assert second["free_item_ids"] == []
    assert second["discount_amount"] == 4


def test_previous_lab_benefit_invoices_count_against_free_quantity(test_engine):
    tenant_id = "tenant_membership"
    branch_id = "branch_main"
    with Session(test_engine) as session:
        plan = PatientSubscriptionPlan(
            id="ptplan_rbs_once",
            tenant_id=tenant_id,
            branch_id=branch_id,
            name="RBS Once Plan",
            duration_days=120,
            lab_discount_percentage=5,
            free_lab_test_ids_json=free_items_to_json(["LABRBS"], {"LABRBS": 1}),
        )
        enrollment = PatientSubscriptionEnrollment(
            id="ptsub_rbs_once",
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id="patient_rbs_history",
            plan_id=plan.id,
            starts_on=date.today(),
            ends_on=date.today() + timedelta(days=119),
        )
        order = LabOrder(
            id="labord_rbs_history",
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=enrollment.patient_id,
            tests="Random Blood Sugar",
            amount=75,
        )
        invoice = Invoice(
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=enrollment.patient_id,
            lab_order_id=order.id,
            patient_subscription_enrollment_id=enrollment.id,
            patient_subscription_plan_id=plan.id,
            invoice_number="MHB-INV-RBS-HISTORY",
            subtotal_amount=75,
            discount_amount=75,
            membership_discount_amount=75,
            taxable_amount=0,
            total_amount=0,
            balance_amount=0,
        )
        item = LabOrderItem(
            tenant_id=tenant_id,
            branch_id=branch_id,
            lab_order_id=order.id,
            test_id="LABRBS",
            test_name="Random Blood Sugar",
            price=75,
        )
        session.add(plan)
        session.add(enrollment)
        session.add(order)
        session.add(invoice)
        session.add(item)
        session.commit()

        sync_free_item_usage_from_invoices(session, enrollment, plan)
        second = benefit_preview(
            plan=plan,
            enrollment=enrollment,
            service_type="lab",
            item_ids=["LABRBS"],
            item_amounts={"LABRBS": 75},
            subtotal_amount=75,
        )

    assert second["free_item_ids"] == []
    assert second["discount_amount"] == 4


def test_zero_total_membership_invoice_is_marked_paid(test_engine):
    with Session(test_engine) as session:
        invoice = Invoice(
            tenant_id="tenant_membership",
            branch_id="branch_main",
            patient_id="patient_free",
            invoice_number="MHB-INV-FREE",
            subtotal_amount=400,
            discount_amount=400,
            membership_discount_amount=400,
            taxable_amount=0,
            tax_amount=0,
            total_amount=0,
            paid_amount=0,
            balance_amount=0,
            status=InvoiceStatus.ISSUED,
        )
        session.add(invoice)
        session.commit()
        session.refresh(invoice)

        updated = update_invoice_payment_status(session, invoice)

    assert updated.balance_amount == 0
    assert updated.paid_amount == 0
    assert updated.status == InvoiceStatus.PAID


def test_zero_total_invoice_read_normalizes_legacy_issued_status(test_engine):
    with Session(test_engine) as session:
        invoice = Invoice(
            tenant_id="tenant_membership",
            branch_id="branch_main",
            patient_id="patient_free",
            invoice_number="MHB-INV-LEGACY-FREE",
            subtotal_amount=150,
            discount_amount=150,
            membership_discount_amount=150,
            taxable_amount=0,
            tax_amount=0,
            total_amount=0,
            paid_amount=0,
            balance_amount=0,
            status=InvoiceStatus.ISSUED,
        )
        session.add(invoice)
        session.commit()
        session.refresh(invoice)

        normalized = _normalize_invoice_status(session, invoice)

    assert normalized.status == InvoiceStatus.PAID
