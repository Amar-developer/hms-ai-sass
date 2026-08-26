import json
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from app.modules.audit.models import AuditEvent
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionPlan,
)
from app.modules.patient_subscriptions.schemas import (
    PatientSubscriptionBenefitUsageUpdate,
    PatientSubscriptionEnrollmentCreate,
)
from app.modules.patient_subscriptions.services import enrollment_service, validation
from app.modules.patient_subscriptions.services.serialization import (
    free_items_to_json,
    usage_from_json,
)
from app.modules.patient_subscriptions.services.usage_sync import (
    sync_free_item_usage_from_invoices,
)


def _allow_tenant_admin_adjustment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(enrollment_service, "enforce_entitlement", lambda *a, **k: None)
    monkeypatch.setattr(
        enrollment_service,
        "require_tenant_admin",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        enrollment_service, "require_user_branch_access", lambda *a, **k: None
    )


def test_benefit_usage_adjustment_requires_selected_tenant_admin(
    test_engine, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(validation, "user_role_keys", lambda *a, **k: ["staff"])
    actor = SimpleNamespace(
        id="staff_user",
        tenant_id="tenant_usage_access",
        user_type="staff",
        is_super_admin=False,
    )

    with Session(test_engine) as session, pytest.raises(HTTPException) as exc:
        validation.require_tenant_admin(session, "tenant_usage_access", actor)

    assert exc.value.status_code == 403
    assert exc.value.detail == "Tenant admin access required"


def test_same_active_plan_cannot_create_duplicate_purchase_invoice(
    test_engine, monkeypatch: pytest.MonkeyPatch
):
    plan = SimpleNamespace(
        id="ptplan_duplicate",
        is_active=True,
        price_amount=299,
    )
    current = SimpleNamespace(
        id="ptsub_existing",
        plan_id=plan.id,
        ends_on=date.today() + timedelta(days=30),
    )
    monkeypatch.setattr(enrollment_service, "enforce_entitlement", lambda *a, **k: None)
    monkeypatch.setattr(
        enrollment_service.PatientSubscriptionSupportRepository,
        "get_patient_for_tenant",
        lambda *a, **k: SimpleNamespace(branch_id="branch_duplicate"),
    )
    monkeypatch.setattr(enrollment_service, "_get_plan", lambda *a, **k: plan)
    monkeypatch.setattr(
        enrollment_service,
        "_resolve_enrollment_branch",
        lambda *a, **k: "branch_duplicate",
    )
    monkeypatch.setattr(
        enrollment_service, "require_user_branch_access", lambda *a, **k: None
    )
    monkeypatch.setattr(
        enrollment_service, "resolve_current_enrollment", lambda *a, **k: current
    )

    with Session(test_engine) as session, pytest.raises(HTTPException) as exc:
        enrollment_service.enroll_patient(
            session,
            tenant_id="tenant_duplicate",
            payload=PatientSubscriptionEnrollmentCreate(
                patient_id="patient_duplicate",
                plan_id=plan.id,
            ),
            actor=SimpleNamespace(id="tenant_admin_duplicate"),
        )

    assert exc.value.status_code == 409
    assert "already enrolled" in exc.value.detail


def test_manual_benefit_usage_is_audited_and_survives_invoice_sync(
    test_engine, monkeypatch: pytest.MonkeyPatch
):
    _allow_tenant_admin_adjustment(monkeypatch)
    with Session(test_engine) as session:
        plan = PatientSubscriptionPlan(
            id="ptplan_handover",
            tenant_id="tenant_handover",
            branch_id="branch_handover",
            name="Smart Care",
            duration_days=120,
            free_consultations=1,
            free_lab_test_ids_json=free_items_to_json(["lab_cbc"], {"lab_cbc": 2}),
            free_medicine_ids_json=free_items_to_json(
                ["med_paracetamol"], {"med_paracetamol": 3}
            ),
        )
        enrollment = PatientSubscriptionEnrollment(
            id="ptsub_handover",
            tenant_id=plan.tenant_id,
            branch_id="branch_handover",
            patient_id="patient_handover",
            plan_id=plan.id,
            starts_on=date.today(),
            ends_on=date.today() + timedelta(days=119),
        )
        session.add(plan)
        session.add(enrollment)
        session.commit()

        result = enrollment_service.update_benefit_usage(
            session,
            tenant_id=plan.tenant_id,
            enrollment_id=enrollment.id,
            payload=PatientSubscriptionBenefitUsageUpdate(
                used_consultations=1,
                used_free_lab_quantities={"lab_cbc": 1},
                used_free_medicine_quantities={"med_paracetamol": 2},
                reason="Used before system handover",
            ),
            actor=SimpleNamespace(id="tenant_admin_handover"),
        )

        assert result.used_consultations == 1
        assert result.remaining_free_consultations == 0
        assert result.used_free_lab_quantities == {"lab_cbc": 1}
        assert result.used_free_medicine_quantities == {"med_paracetamol": 2}

        sync_free_item_usage_from_invoices(session, enrollment, plan)
        assert enrollment.used_consultations == 1
        assert usage_from_json(enrollment.used_free_lab_json) == {"lab_cbc": 1}
        assert usage_from_json(enrollment.used_free_medicine_json) == {
            "med_paracetamol": 2
        }

        event = session.exec(
            select(AuditEvent).where(
                AuditEvent.resource_id == enrollment.id,
                AuditEvent.action == "patient_subscription.benefit_usage_adjusted",
            )
        ).one()
        assert json.loads(event.metadata_json)["reason"] == (
            "Used before system handover"
        )


def test_manual_benefit_usage_cannot_exceed_plan_allowance(
    test_engine, monkeypatch: pytest.MonkeyPatch
):
    _allow_tenant_admin_adjustment(monkeypatch)
    with Session(test_engine) as session:
        plan = PatientSubscriptionPlan(
            id="ptplan_usage_limit",
            tenant_id="tenant_usage_limit",
            branch_id="branch_usage_limit",
            name="Smart Care",
            duration_days=120,
            free_consultations=1,
        )
        enrollment = PatientSubscriptionEnrollment(
            id="ptsub_usage_limit",
            tenant_id=plan.tenant_id,
            branch_id="branch_usage_limit",
            patient_id="patient_usage_limit",
            plan_id=plan.id,
            starts_on=date.today(),
            ends_on=date.today() + timedelta(days=119),
        )
        session.add(plan)
        session.add(enrollment)
        session.commit()

        with pytest.raises(HTTPException) as exc:
            enrollment_service.update_benefit_usage(
                session,
                tenant_id=plan.tenant_id,
                enrollment_id=enrollment.id,
                payload=PatientSubscriptionBenefitUsageUpdate(
                    used_consultations=2,
                    reason="Incorrect legacy counter",
                ),
                actor=SimpleNamespace(id="tenant_admin_usage_limit"),
            )

        assert exc.value.status_code == 400
        assert exc.value.detail == "Consultation usage must be between 0 and 1"
