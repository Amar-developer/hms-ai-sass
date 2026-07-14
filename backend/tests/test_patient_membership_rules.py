from datetime import date, timedelta

from sqlmodel import Session

from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.billing.services.invoice_status import update_invoice_payment_status
from app.modules.billing.services.read_models import (
    normalize_invoice_status as _normalize_invoice_status,
)
from app.modules.patient_subscriptions.service import (
    read_enrollment as _read_enrollment,
)
from app.modules.lab.models import LabOrder, LabOrderItem
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionEnrollmentStatus,
    PatientSubscriptionPlan,
)
from app.modules.patient_subscriptions.services.eligibility import (
    resolve_current_enrollment,
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
from app.modules.tenants.models import Department, Tenant


def test_queued_membership_dates_follow_current_plan_and_actual_activation(
    test_engine,
):
    today = date.today()
    tenant_id = "tenant_queue_dates"
    branch_id = "branch_queue_dates"
    with Session(test_engine) as session:
        current_plan = PatientSubscriptionPlan(
            id="ptplan_queue_current",
            tenant_id=tenant_id,
            branch_id=branch_id,
            name="Current Plan",
            duration_days=30,
        )
        queued_plan = PatientSubscriptionPlan(
            id="ptplan_queue_next",
            tenant_id=tenant_id,
            branch_id=branch_id,
            name="Queued Plan",
            duration_days=60,
        )
        current = PatientSubscriptionEnrollment(
            id="ptsub_queue_current",
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id="patient_queue_expected",
            plan_id=current_plan.id,
            starts_on=today,
            activated_on=today,
            ends_on=today + timedelta(days=9),
            status=PatientSubscriptionEnrollmentStatus.ACTIVE,
        )
        queued = PatientSubscriptionEnrollment(
            id="ptsub_queue_next",
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=current.patient_id,
            plan_id=queued_plan.id,
            starts_on=today,
            ends_on=today + timedelta(days=59),
            status=PatientSubscriptionEnrollmentStatus.QUEUED,
        )
        expired = PatientSubscriptionEnrollment(
            id="ptsub_queue_expired",
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id="patient_queue_promote",
            plan_id=current_plan.id,
            starts_on=today - timedelta(days=30),
            activated_on=today - timedelta(days=30),
            ends_on=today - timedelta(days=1),
            status=PatientSubscriptionEnrollmentStatus.ACTIVE,
        )
        promote = PatientSubscriptionEnrollment(
            id="ptsub_queue_promote",
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=expired.patient_id,
            plan_id=queued_plan.id,
            starts_on=today + timedelta(days=5),
            ends_on=today + timedelta(days=64),
            status=PatientSubscriptionEnrollmentStatus.QUEUED,
        )
        session.add(current_plan)
        session.add(queued_plan)
        session.add(current)
        session.add(queued)
        session.add(expired)
        session.add(promote)
        session.commit()

        resolved_current = resolve_current_enrollment(
            session,
            tenant_id=tenant_id,
            patient_id=current.patient_id,
        )
        session.refresh(queued)
        promoted = resolve_current_enrollment(
            session,
            tenant_id=tenant_id,
            patient_id=expired.patient_id,
        )

        assert resolved_current is not None
        assert queued.starts_on == current.ends_on + timedelta(days=1)
        assert queued.ends_on == queued.starts_on + timedelta(days=59)
        assert promoted is not None
        assert promoted.id == promote.id
        assert promoted.status == PatientSubscriptionEnrollmentStatus.ACTIVE
        assert promoted.starts_on == today
        assert promoted.activated_on == today
        assert promoted.ends_on == today + timedelta(days=59)


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
                patient_id=patient_id,
            )
            is None
        )
        active = active_patient_enrollment(
            session,
            tenant_id=tenant_id,
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


def test_free_consultation_matches_equivalent_branch_department(test_engine):
    tenant_id = "tenant_basic_department_scope"
    with Session(test_engine) as session:
        session.add(Tenant(id=tenant_id, name="Basic Plan Clinic"))
        selected_department = Department(
            id="dept_basic_all",
            tenant_id=tenant_id,
            name="General Medicine",
            code="GEN",
        )
        branch_department = Department(
            id="dept_basic_branch",
            tenant_id=tenant_id,
            name="General Medicine",
            code="GEN-BRANCH",
            source_template_department_id=selected_department.id,
        )
        other_department = Department(
            id="dept_basic_cardio",
            tenant_id=tenant_id,
            name="Cardiology",
            code="CARDIO",
        )
        plan = PatientSubscriptionPlan(
            tenant_id=tenant_id,
            name="Basic Plan",
            duration_days=30,
            free_consultations=2,
            free_consultation_department_ids_json='["dept_basic_all"]',
        )
        enrollment = PatientSubscriptionEnrollment(
            tenant_id=tenant_id,
            branch_id="branch_basic",
            patient_id="patient_basic",
            plan_id=plan.id,
            starts_on=date.today(),
            ends_on=date.today() + timedelta(days=29),
        )
        session.add(selected_department)
        session.add(branch_department)
        session.add(other_department)
        session.add(plan)
        session.add(enrollment)
        session.commit()

        equivalent = benefit_preview(
            plan=plan,
            enrollment=enrollment,
            service_type="consultation",
            item_ids=[],
            subtotal_amount=600,
            department_id=branch_department.id,
            session=session,
        )
        unrelated = benefit_preview(
            plan=plan,
            enrollment=enrollment,
            service_type="consultation",
            item_ids=[],
            subtotal_amount=600,
            department_id=other_department.id,
            session=session,
        )

    assert equivalent["discount_amount"] == 600
    assert unrelated["discount_amount"] == 0


def test_consultation_usage_reconciles_from_invoice_and_restores_on_cancel(
    test_engine,
):
    with Session(test_engine) as session:
        plan = PatientSubscriptionPlan(
            id="ptplan_consult_usage",
            tenant_id="tenant_membership",
            name="Basic Usage Plan",
            duration_days=30,
            free_consultations=2,
        )
        enrollment = PatientSubscriptionEnrollment(
            id="ptsub_consult_usage",
            tenant_id="tenant_membership",
            branch_id="branch_main",
            patient_id="patient_consult_usage",
            plan_id=plan.id,
            starts_on=date.today(),
            ends_on=date.today() + timedelta(days=29),
        )
        invoice = Invoice(
            tenant_id=enrollment.tenant_id,
            branch_id=enrollment.branch_id,
            patient_id=enrollment.patient_id,
            consultation_id="consult_usage_1",
            patient_subscription_enrollment_id=enrollment.id,
            patient_subscription_plan_id=plan.id,
            invoice_number="MHB-INV-CONSULT-USAGE",
            subtotal_amount=600,
            discount_amount=600,
            membership_discount_amount=600,
            taxable_amount=0,
            total_amount=0,
            balance_amount=0,
            status=InvoiceStatus.PAID,
        )
        duplicate_invoice = Invoice(
            tenant_id=enrollment.tenant_id,
            branch_id=enrollment.branch_id,
            patient_id=enrollment.patient_id,
            # Same clinical visit as `invoice` above (via appointment_id,
            # since Invoice.consultation_id now carries a unique index and
            # can't hold the same value twice) — this still exercises
            # sync_free_item_usage_from_invoices' by-visit dedup, which
            # falls back to appointment_id when consultation_id is unset.
            appointment_id="consult_usage_1",
            patient_subscription_enrollment_id=enrollment.id,
            patient_subscription_plan_id=plan.id,
            invoice_number="MHB-INV-CONSULT-USAGE-DUP",
            subtotal_amount=600,
            discount_amount=600,
            membership_discount_amount=600,
            taxable_amount=0,
            total_amount=0,
            balance_amount=0,
            status=InvoiceStatus.PAID,
        )
        session.add(plan)
        session.add(enrollment)
        session.add(invoice)
        session.add(duplicate_invoice)
        session.commit()

        sync_free_item_usage_from_invoices(session, enrollment, plan)
        assert enrollment.used_consultations == 1

        invoice.status = InvoiceStatus.CANCELLED
        duplicate_invoice.status = InvoiceStatus.CANCELLED
        session.add(invoice)
        session.add(duplicate_invoice)
        session.commit()
        sync_free_item_usage_from_invoices(session, enrollment, plan)

        assert enrollment.used_consultations == 0
        read = _read_enrollment(session, enrollment)
        assert read.allocated_free_consultations == 2
        assert read.remaining_free_consultations == 2

        plan.free_consultations = 4
        session.add(plan)
        session.commit()
        updated_read = _read_enrollment(session, enrollment)

    assert updated_read.allocated_free_consultations == 4
    assert updated_read.remaining_free_consultations == 4


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


def test_lab_discount_ignores_free_consultation_department_scope():
    plan = PatientSubscriptionPlan(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        name="Premium Care Plan",
        free_consultations=2,
        free_consultation_department_ids_json='["dept_genmed"]',
        lab_discount_percentage=5,
        min_discount_amount=100,
    )
    enrollment = PatientSubscriptionEnrollment(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        patient_id="patient_lab_dept",
        plan_id=plan.id,
        starts_on=date.today(),
        ends_on=date.today() + timedelta(days=119),
    )

    result = benefit_preview(
        plan=plan,
        enrollment=enrollment,
        service_type="lab",
        item_ids=["LABRBS"],
        subtotal_amount=200,
        department_id="dept_orthopaedics",
    )

    assert result["discount_amount"] == 10
    assert result["reason"] == "5% lab discount"


def test_pharmacy_discount_ignores_free_consultation_department_scope():
    plan = PatientSubscriptionPlan(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        name="Smart Care Plan",
        free_consultations=1,
        free_consultation_department_ids_json='["dept_genmed"]',
        pharmacy_discount_slabs_json=slabs_to_json(
            [{"min_amount": 100, "max_amount": 500, "discount_percentage": 3}]
        ),
    )
    enrollment = PatientSubscriptionEnrollment(
        tenant_id="tenant_membership",
        branch_id="branch_main",
        patient_id="patient_pharmacy_dept",
        plan_id=plan.id,
        starts_on=date.today(),
        ends_on=date.today() + timedelta(days=119),
    )

    result = benefit_preview(
        plan=plan,
        enrollment=enrollment,
        service_type="pharmacy",
        item_ids=["MED1"],
        subtotal_amount=400,
        department_id="dept_cardiology",
    )

    assert result["discount_amount"] == 12
    assert result["reason"] == "3% pharmacy discount for ₹100 - ₹500 bill"


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
    consume_free_items(
        enrollment, service_type="lab", free_item_ids=first["free_item_ids"]
    )

    second = preview()
    assert second["free_item_ids"] == ["LABBP"]
    consume_free_items(
        enrollment, service_type="lab", free_item_ids=second["free_item_ids"]
    )

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

    consume_free_items(
        enrollment, service_type="lab", free_item_ids=first["free_item_ids"]
    )
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
