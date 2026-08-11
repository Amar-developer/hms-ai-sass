import json
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlmodel import Session, select

from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.patient_intelligence.service import (
    evaluate_flags,
    list_tenant_rules,
    refresh_patient_intelligence,
)
from app.modules.patient_intelligence.models import (
    EngagementActionStatus,
    IntelligenceFlagCategory,
    PatientEngagementAction,
    PatientIntelligencePatientSetting,
    PatientIntelligenceRule,
    PatientMetricSnapshot,
)
from app.modules.integrations.whatsapp_consent import (
    patient_allows_engagement_whatsapp,
)
from app.modules.patients.models import Patient, WhatsAppConsentStatus
from app.modules.patients.services.search import PatientSearchService
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionPlan,
)
from app.modules.tenants.models import Branch, Tenant, now_utc


def _patient_fixture(session: Session):
    tenant = Tenant(name="Intelligence Clinic")
    session.add(tenant)
    session.flush()
    branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
    session.add(branch)
    session.flush()
    patient = Patient(
        tenant_id=tenant.id,
        branch_id=branch.id,
        patient_number="PAT-001",
        full_name="Raj Kumar",
    )
    session.add(patient)
    session.flush()
    return tenant, branch, patient


def _rule(session: Session, tenant_id: str, **overrides):
    flag_key = overrides.pop("flag_key", "ACTIVE_PATIENT")
    values = {
        "tenant_id": tenant_id,
        "rule_key": flag_key.lower(),
        "name": flag_key.replace("_", " ").title(),
        "category": IntelligenceFlagCategory.ENGAGEMENT,
        "metric_key": "days_since_activity",
        "operator": "lte",
        "threshold": Decimal("30"),
        "flag_key": flag_key,
        "severity": "info",
    }
    values.update(overrides)
    row = PatientIntelligenceRule(**values)
    session.add(row)
    session.flush()
    return row


def test_new_tenant_has_no_implicit_business_rules(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, _patient = _patient_fixture(session)
        assert list_tenant_rules(session, tenant.id) == []


def test_between_operator_uses_both_tenant_configured_thresholds(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        _rule(
            session,
            tenant.id,
            flag_key="TENANT_INTERVAL",
            metric_key="recurring_interval_days",
            operator="between",
            threshold=Decimal("18"),
            threshold_secondary=Decimal("42"),
        )

        inside = evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=patient,
            metric_values={"recurring_interval_days": Decimal("40")},
            now=now_utc(),
        )
        outside = evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=patient,
            metric_values={"recurring_interval_days": Decimal("43")},
            now=now_utc(),
        )

        assert {flag.flag_key for flag in inside} == {"TENANT_INTERVAL"}
        assert {flag.flag_key for flag in outside} == set()


def test_existing_hms_activity_is_adapted_into_metrics_flags_and_timeline(test_engine):
    with Session(test_engine) as session:
        tenant, branch, patient = _patient_fixture(session)
        _rule(session, tenant.id)
        _rule(
            session,
            tenant.id,
            rule_key="appointment_no_show",
            name="Appointment no-show",
            flag_key="APPOINTMENT_NO_SHOW",
            category=IntelligenceFlagCategory.CARE_OPERATIONAL,
            metric_key="no_show_count",
            operator="gte",
            threshold=Decimal("1"),
            action_enabled=True,
            action_key="no_show_rebooking",
            action_channel="whatsapp",
            action_template_key="patient_reengagement",
            action_requires_approval=True,
        )
        session.add(
            Appointment(
                tenant_id=tenant.id,
                branch_id=branch.id,
                patient_id=patient.id,
                appointment_date=date.today() - timedelta(days=3),
                status=AppointmentStatus.CONSULTATION_COMPLETED,
            )
        )
        session.add(
            Appointment(
                tenant_id=tenant.id,
                branch_id=branch.id,
                patient_id=patient.id,
                appointment_date=date.today() - timedelta(days=1),
                status=AppointmentStatus.NO_SHOW,
            )
        )
        session.commit()

        result = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        assert result.metrics.completed_visits == 1
        assert result.metrics.no_show_count == 1
        assert {flag.flag_key for flag in result.flags} >= {
            "ACTIVE_PATIENT",
            "APPOINTMENT_NO_SHOW",
        }
        assert [item.activity_type for item in result.timeline] == [
            "appointment",
            "appointment",
        ]
        assert any(
            action.action_key == "no_show_rebooking" and action.requires_approval
            for action in result.engagement_actions
        )


def test_refresh_is_idempotent_for_flags_and_actions(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        session.commit()

        first = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )
        second = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        assert {flag.id for flag in first.flags} == {flag.id for flag in second.flags}
        assert {action.id for action in first.engagement_actions} == {
            action.id for action in second.engagement_actions
        }


def test_refresh_sorts_engagement_actions_with_mixed_datetime_awareness(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        rule = _rule(
            session,
            tenant.id,
            rule_key="mixed_datetime_followup",
            name="Mixed datetime follow-up",
            flag_key="MIXED_DATETIME_FOLLOWUP",
            metric_key="days_since_activity",
            operator="gte",
            threshold=Decimal("0"),
            action_enabled=True,
            action_key="mixed_datetime_action",
            action_channel="whatsapp",
            action_template_key="patient_reengagement",
            action_requires_approval=True,
        )
        session.add(
            PatientEngagementAction(
                tenant_id=tenant.id,
                patient_id=patient.id,
                source_flag_id=None,
                action_key="legacy_naive_action",
                channel="whatsapp",
                template_key="patient_reengagement",
                status=EngagementActionStatus.RECOMMENDED,
                requires_approval=True,
                personalization_json="{}",
                reason="Legacy row with naive timestamp",
                dedupe_key=f"legacy-naive-{patient.id}",
                created_at=datetime(2026, 8, 11, 9, 0, 0),
            )
        )
        session.add(
            PatientEngagementAction(
                tenant_id=tenant.id,
                patient_id=patient.id,
                source_flag_id=None,
                action_key="aware_action",
                channel="whatsapp",
                template_key="patient_reengagement",
                status=EngagementActionStatus.RECOMMENDED,
                requires_approval=True,
                personalization_json="{}",
                reason="Aware timestamp row",
                dedupe_key=f"aware-{patient.id}",
                created_at=datetime(2026, 8, 11, 10, 0, 0, tzinfo=timezone.utc),
            )
        )
        session.commit()

        result = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        action_keys = [action.action_key for action in result.engagement_actions]
        assert "legacy_naive_action" in action_keys
        assert "aware_action" in action_keys
        assert "mixed_datetime_action" in action_keys
        assert rule.id


def test_highest_configured_value_tier_wins(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        for key, threshold, priority in (
            ("PREMIUM_PATIENT", "5000", 10),
            ("GOLD_PATIENT", "3000", 20),
            ("SILVER_PATIENT", "1000", 30),
        ):
            _rule(
                session,
                tenant.id,
                rule_key=key.lower(),
                name=key,
                flag_key=key,
                category=IntelligenceFlagCategory.VALUE,
                metric_key="net_collected_30d",
                operator="gte",
                threshold=Decimal(threshold),
                priority=priority,
                exclusive_group="patient_value_tier",
            )
        flags = evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=patient,
            metric_values={
                "net_collected_30d": Decimal("6000"),
                "net_collected_365d": Decimal("60000"),
                "days_since_activity": Decimal("1"),
            },
            now=now_utc(),
        )

        tiers = {
            flag.flag_key
            for flag in flags
            if flag.flag_key in {"PREMIUM_PATIENT", "GOLD_PATIENT", "SILVER_PATIENT"}
        }
        assert tiers == {"PREMIUM_PATIENT"}


def test_active_membership_is_a_configurable_premium_value_condition(test_engine):
    with Session(test_engine) as session:
        tenant, branch, non_member = _patient_fixture(session)
        member = Patient(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_number="PAT-003",
            full_name="Active Member",
        )
        session.add(member)
        session.flush()
        _rule(
            session,
            tenant.id,
            rule_key="silver_patient",
            name="Silver",
            flag_key="SILVER_PATIENT",
            category=IntelligenceFlagCategory.VALUE,
            metric_key="net_collected_30d",
            operator="gte",
            threshold=Decimal("1000"),
            priority=30,
            exclusive_group="patient_value_tier",
        )
        _rule(
            session,
            tenant.id,
            rule_key="premium_active_member",
            name="Premium member",
            flag_key="PREMIUM_PATIENT",
            category=IntelligenceFlagCategory.VALUE,
            metric_key="net_collected_30d",
            operator="gte",
            threshold=Decimal("1000"),
            priority=10,
            exclusive_group="patient_value_tier",
            requires_active_membership=True,
        )
        common_metrics = {
            "net_collected_30d": Decimal("1705"),
            "net_collected_365d": Decimal("1705"),
            "days_since_activity": Decimal("1"),
        }

        non_member_flags = evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=non_member,
            metric_values={**common_metrics, "active_membership": Decimal("0")},
            now=now_utc(),
        )
        member_flags = evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=member,
            metric_values={**common_metrics, "active_membership": Decimal("1")},
            now=now_utc(),
        )

        assert any(flag.flag_key == "SILVER_PATIENT" for flag in non_member_flags)
        premium = next(
            flag for flag in member_flags if flag.flag_key == "PREMIUM_PATIENT"
        )
        assert "Active paid membership" in premium.explanation


def test_intelligence_engagement_requires_explicit_opt_in():
    patient = Patient(
        tenant_id="tenant_1",
        patient_number="PAT-002",
        full_name="Consent Patient",
    )
    assert patient_allows_engagement_whatsapp(patient) is False
    patient.whatsapp_consent_status = WhatsAppConsentStatus.OPTED_IN
    assert patient_allows_engagement_whatsapp(patient) is True


def test_paid_membership_patient_detail_intelligence_is_returned(test_engine):
    with Session(test_engine) as session:
        tenant, branch, patient = _patient_fixture(session)
        _rule(
            session,
            tenant.id,
            rule_key="membership_active",
            name="Membership active",
            flag_key="MEMBERSHIP_ACTIVE",
            category=IntelligenceFlagCategory.MEMBERSHIP,
            metric_key="active_membership",
            operator="eq",
            threshold=Decimal("1"),
        )
        plan = PatientSubscriptionPlan(
            tenant_id=tenant.id,
            branch_id=branch.id,
            name="Smart Care Plan",
            price_amount=1000,
            duration_days=365,
        )
        session.add(plan)
        session.flush()
        session.add(
            PatientSubscriptionEnrollment(
                tenant_id=tenant.id,
                branch_id=branch.id,
                patient_id=patient.id,
                plan_id=plan.id,
                starts_on=date.today() - timedelta(days=10),
                ends_on=date.today() + timedelta(days=355),
                paid_amount=1000,
            )
        )
        session.commit()

        result = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        assert result.metrics.active_membership is True
        assert any(flag.flag_key == "MEMBERSHIP_ACTIVE" for flag in result.flags)


def test_patient_search_and_references_include_current_intelligence_flags(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        session.commit()
        _rule(
            session,
            tenant.id,
            rule_key="gold_patient",
            name="Gold",
            flag_key="GOLD_PATIENT",
            category=IntelligenceFlagCategory.VALUE,
            metric_key="net_collected_30d",
            operator="gte",
            threshold=Decimal("3000"),
            badge_label="Gold",
            badge_background_color="#fef3c7",
            badge_text_color="#92400e",
            badge_border_color="#fcd34d",
            display_as_patient_badge=True,
            priority=20,
            exclusive_group="patient_value_tier",
        )
        _rule(session, tenant.id)
        evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=patient,
            metric_values={
                "net_collected_30d": Decimal("4000"),
                "net_collected_365d": Decimal("4000"),
                "days_since_activity": Decimal("1"),
            },
            now=now_utc(),
        )

        search_rows = PatientSearchService(session).search(tenant_id=tenant.id, q="Raj")
        reference_rows = PatientSearchService(session).references(
            tenant_id=tenant.id, patient_ids=[patient.id]
        )

        assert {flag.flag_key for flag in search_rows[0].intelligence_flags} >= {
            "GOLD_PATIENT"
        }
        assert "ACTIVE_PATIENT" not in {
            flag.flag_key for flag in search_rows[0].intelligence_flags
        }
        assert {flag.flag_key for flag in reference_rows[0].intelligence_flags} == {
            flag.flag_key for flag in search_rows[0].intelligence_flags
        }


def test_manual_refill_date_drives_configurable_refill_rule(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        expected_date = date.today() + timedelta(days=14)
        _rule(
            session,
            tenant.id,
            rule_key="manual_refill_due",
            name="Refill due soon",
            flag_key="REFILL_DUE_SOON",
            category=IntelligenceFlagCategory.RECURRING,
            metric_key="days_until_expected_refill",
            operator="lte",
            threshold=Decimal("21"),
        )
        session.add(
            PatientIntelligencePatientSetting(
                tenant_id=tenant.id,
                patient_id=patient.id,
                manual_expected_refill_at=datetime.combine(
                    expected_date, time.min, tzinfo=timezone.utc
                ),
                notes="Monthly medicine pickup",
            )
        )
        session.commit()

        result = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        assert result.metrics.expected_refill_at.date() == expected_date
        assert result.manual_expected_refill_at.date() == expected_date
        assert result.manual_refill_notes == "Monthly medicine pickup"
        refill_flag = next(
            flag for flag in result.flags if flag.flag_key == "REFILL_DUE_SOON"
        )
        assert refill_flag.evidence["value"] in {"13", "14"}
        snapshot = session.exec(
            select(PatientMetricSnapshot).where(
                PatientMetricSnapshot.patient_id == patient.id
            )
        ).one()
        recurring_evidence = json.loads(snapshot.evidence_json)["recurring_medicine"]
        assert recurring_evidence["manual_schedule"] is True
        assert recurring_evidence["manual_notes"] == "Monthly medicine pickup"


def test_configured_no_approval_action_is_automatically_queued(
    test_engine, monkeypatch
):
    queued: list[dict] = []

    def fake_queue(_session, **kwargs):
        queued.append(kwargs)

        class Event:
            id = "notification_1"

        return Event()

    monkeypatch.setattr(
        "app.modules.notifications.services.events.queue_whatsapp_template_if_allowed",
        fake_queue,
    )
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        _rule(
            session,
            tenant.id,
            rule_key="tenant_refill_reminder",
            name="Tenant refill reminder",
            flag_key="TENANT_REFILL_REMINDER",
            category=IntelligenceFlagCategory.RECURRING,
            metric_key="days_until_expected_refill",
            operator="lte",
            threshold=Decimal("30"),
            action_enabled=True,
            action_key="tenant_monthly_prescription",
            action_channel="whatsapp",
            action_template_key="medicine_refill_patient",
            action_requires_approval=False,
        )
        session.add(
            PatientIntelligencePatientSetting(
                tenant_id=tenant.id,
                patient_id=patient.id,
                manual_expected_refill_at=datetime.combine(
                    date.today() + timedelta(days=10),
                    time.min,
                    tzinfo=timezone.utc,
                ),
            )
        )
        session.commit()

        result = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        action = next(
            item
            for item in result.engagement_actions
            if item.action_key == "tenant_monthly_prescription"
        )
        assert action.status == "queued"
        assert action.notification_event_id == "notification_1"
        assert queued[0]["flow_key"] == "medicine_refill_patient"
        assert queued[0]["resource_type"] == "patient_engagement_action"
