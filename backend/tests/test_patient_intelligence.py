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
from app.api.v1 import patient_intelligence as patient_intelligence_api
from app.modules.patient_intelligence.jobs import daily_refresh
from app.modules.patient_intelligence.models import (
    EngagementActionStatus,
    IntelligenceFlagCategory,
    IntelligenceFlagStatus,
    PatientEngagementAction,
    PatientIntelligenceContentItem,
    PatientIntelligenceFlag,
    PatientIntelligencePatientSetting,
    PatientIntelligenceRule,
    PatientMetricSnapshot,
)
from app.modules.patient_intelligence.schemas import IntelligenceRuleUpdate
from app.modules.integrations.whatsapp_consent import (
    patient_allows_engagement_whatsapp,
)
from app.modules.identity.models import User
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


def test_daily_refresh_job_batches_and_processes_whatsapp(test_engine, monkeypatch):
    refresh_counts = iter([2, 0])
    processed = {}

    def fake_refresh(_session, *, limit):
        processed.setdefault("limits", []).append(limit)
        return next(refresh_counts)

    def fake_process(_session):
        processed["whatsapp"] = True
        return 1

    monkeypatch.setattr(daily_refresh, "refresh_due_patient_intelligence", fake_refresh)
    monkeypatch.setattr(
        daily_refresh, "process_due_whatsapp_notifications", fake_process
    )

    total = daily_refresh.run_daily_refresh(
        session_factory=lambda: Session(test_engine),
        batch_size=2,
        max_batches=5,
    )

    assert total == 2
    assert processed["limits"] == [2, 2]
    assert processed["whatsapp"] is True


def test_daily_refresh_job_queues_admin_report_before_sending(test_engine, monkeypatch):
    """The cron entry point must enqueue the end-of-day admin report and then
    deliver it in the same run, so an external scheduler needs one invocation."""
    order = []

    monkeypatch.setattr(
        daily_refresh, "refresh_due_patient_intelligence", lambda _session, *, limit: 0
    )

    def fake_queue(_session):
        order.append("queue")
        return 3

    def fake_process(_session):
        order.append("send")
        return 3

    monkeypatch.setattr(
        daily_refresh, "queue_due_whatsapp_admin_daily_reports", fake_queue
    )
    monkeypatch.setattr(
        daily_refresh, "process_due_whatsapp_notifications", fake_process
    )

    daily_refresh.run_daily_refresh(session_factory=lambda: Session(test_engine))

    assert order == ["queue", "send"]

    order.clear()
    daily_refresh.run_daily_refresh(
        session_factory=lambda: Session(test_engine),
        queue_admin_daily_report=False,
    )
    assert order == ["send"]


def test_between_operator_uses_both_tenant_configured_thresholds(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        patient.whatsapp_consent_status = WhatsAppConsentStatus.OPTED_IN
        session.add(patient)
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


def test_duplicate_matching_rule_flag_keys_create_only_one_patient_flag(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        preferred = _rule(
            session,
            tenant.id,
            rule_key="membership_due_primary",
            flag_key="MEMBERSHIP_RENEWAL_DUE",
            priority=10,
        )
        _rule(
            session,
            tenant.id,
            rule_key="membership_due_legacy",
            flag_key="MEMBERSHIP_RENEWAL_DUE",
            priority=20,
        )

        flags = evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=patient,
            metric_values={"days_since_activity": Decimal("1")},
            now=now_utc(),
        )

        matching = [flag for flag in flags if flag.flag_key == "MEMBERSHIP_RENEWAL_DUE"]
        assert len(matching) == 1
        assert matching[0].rule_id == preferred.id


def test_update_rule_allows_template_edit_with_legacy_duplicate_flag(
    test_engine, monkeypatch
):
    with Session(test_engine) as session:
        tenant, _branch, _patient = _patient_fixture(session)
        user = User(
            name="Tenant Admin",
            email="tenant.admin@example.test",
            password_hash="unused",
            is_super_admin=True,
        )
        session.add(user)
        editable = _rule(
            session,
            tenant.id,
            rule_key="membership_renewal_primary",
            flag_key="MEMBERSHIP_RENEWAL_DUE",
            category=IntelligenceFlagCategory.MEMBERSHIP,
            metric_key="membership_days_remaining",
            operator="between",
            threshold=Decimal("0"),
            threshold_secondary=Decimal("7"),
            action_enabled=True,
            action_key="membership_renewal_reminder",
            action_channel="whatsapp",
            action_template_key="membership_renewal_patient",
        )
        _rule(
            session,
            tenant.id,
            rule_key="membership_renewal_legacy_duplicate",
            flag_key="MEMBERSHIP_RENEWAL_DUE",
            category=IntelligenceFlagCategory.MEMBERSHIP,
            metric_key="membership_days_remaining",
            operator="between",
            threshold=Decimal("0"),
            threshold_secondary=Decimal("7"),
            action_enabled=True,
            action_key="membership_renewal_reminder_legacy",
            action_channel="whatsapp",
            action_template_key="legacy_membership_renewal_patient",
        )
        session.commit()

        monkeypatch.setattr(patient_intelligence_api, "_entitled", lambda *args: None)

        updated = patient_intelligence_api.update_rule(
            editable.id,
            IntelligenceRuleUpdate(
                action_template_key="clinic_subscription_renewal_reminder"
            ),
            tenant_id=tenant.id,
            current_user=user,
            session=session,
        )

        assert updated.action_template_key == "clinic_subscription_renewal_reminder"


def test_create_rule_allows_multiple_paths_to_same_badge_key(test_engine, monkeypatch):
    with Session(test_engine) as session:
        tenant, _branch, _patient = _patient_fixture(session)
        user = User(
            name="Tenant Admin",
            email="tenant.badges@example.test",
            password_hash="unused",
            is_super_admin=True,
        )
        session.add(user)
        session.commit()
        monkeypatch.setattr(patient_intelligence_api, "_entitled", lambda *args: None)

        first = patient_intelligence_api.create_rule(
            patient_intelligence_api.IntelligenceRuleCreate(
                rule_key="premium_monthly_member",
                name="Premium monthly member",
                category="value",
                metric_key="net_collected_30d",
                operator="gte",
                threshold=Decimal("2500"),
                threshold_secondary=None,
                window_days=None,
                flag_key="PREMIUM_PATIENT",
                severity="success",
                badge_label=None,
                badge_background_color=None,
                badge_text_color=None,
                badge_border_color=None,
                display_as_patient_badge=False,
                priority=10,
                exclusive_group="patient_value_tier",
                score_dimension="value",
                score_weight=Decimal("100"),
                required_flag_keys=[],
                expires_after_days=60,
                auto_resolve=False,
                requires_active_membership=True,
                action_enabled=False,
                action_key=None,
                action_channel=None,
                action_template_key=None,
                action_requires_approval=False,
                action_cooldown_days=None,
                is_enabled=True,
            ),
            tenant_id=tenant.id,
            current_user=user,
            session=session,
        )
        second = patient_intelligence_api.create_rule(
            patient_intelligence_api.IntelligenceRuleCreate(
                rule_key="premium_monthly_collection",
                name="Premium monthly collection",
                category="value",
                metric_key="net_collected_30d",
                operator="gte",
                threshold=Decimal("4000"),
                threshold_secondary=None,
                window_days=None,
                flag_key="PREMIUM_PATIENT",
                severity="success",
                badge_label=None,
                badge_background_color=None,
                badge_text_color=None,
                badge_border_color=None,
                display_as_patient_badge=False,
                priority=11,
                exclusive_group="patient_value_tier",
                score_dimension="value",
                score_weight=Decimal("100"),
                required_flag_keys=[],
                expires_after_days=60,
                auto_resolve=False,
                requires_active_membership=False,
                action_enabled=False,
                action_key=None,
                action_channel=None,
                action_template_key=None,
                action_requires_approval=False,
                action_cooldown_days=None,
                is_enabled=True,
            ),
            tenant_id=tenant.id,
            current_user=user,
            session=session,
        )

        assert first.flag_key == second.flag_key == "PREMIUM_PATIENT"
        assert first.rule_key != second.rule_key


def test_content_library_crud_is_tenant_configured(test_engine, monkeypatch):
    with Session(test_engine) as session:
        tenant, _branch, _patient = _patient_fixture(session)
        user = User(
            name="Tenant Admin",
            email="tenant.content@example.test",
            password_hash="unused",
            is_super_admin=True,
        )
        session.add(user)
        session.commit()
        monkeypatch.setattr(patient_intelligence_api, "_entitled", lambda *args: None)

        created = patient_intelligence_api.create_content_item(
            patient_intelligence_api.IntelligenceContentCreate(
                content_key="monthly_awareness",
                title="Monthly awareness",
                category="health_tip",
                language="en",
                audience_flag_key="HEALTH_TIP_DUE",
                body_text="Drink water and follow your clinician advice.",
                priority=20,
                is_enabled=True,
            ),
            tenant_id=tenant.id,
            current_user=user,
            session=session,
        )

        listed = patient_intelligence_api.list_content_library(
            tenant_id=tenant.id,
            current_user=user,
            session=session,
        )
        assert [item.id for item in listed] == [created.id]

        updated = patient_intelligence_api.update_content_item(
            created.id,
            patient_intelligence_api.IntelligenceContentUpdate(
                title="Updated awareness",
                body_text="Updated tenant-approved content.",
                is_enabled=False,
            ),
            tenant_id=tenant.id,
            current_user=user,
            session=session,
        )
        assert updated.title == "Updated awareness"
        assert updated.body_text == "Updated tenant-approved content."
        assert updated.is_enabled is False

        patient_intelligence_api.delete_content_item(
            created.id,
            tenant_id=tenant.id,
            current_user=user,
            session=session,
        )
        assert session.get(PatientIntelligenceContentItem, created.id) is None


def test_delete_rule_resolves_flags_and_cancels_unsent_actions(
    test_engine, monkeypatch
):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        user = User(
            name="Tenant Admin",
            email="tenant.delete@example.test",
            password_hash="unused",
            is_super_admin=True,
        )
        session.add(user)
        rule = _rule(
            session,
            tenant.id,
            rule_key="monthly_health_tip",
            name="Monthly health tip",
            flag_key="HEALTH_TIP_DUE",
            category=IntelligenceFlagCategory.ENGAGEMENT,
            metric_key="patient_age_days",
            operator="gte",
            threshold=Decimal("0"),
            action_enabled=True,
            action_key="monthly_health_tip",
            action_channel="whatsapp",
            action_template_key="health_tip_patient",
        )
        session.commit()
        result = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )
        flag = next(item for item in result.flags if item.flag_key == "HEALTH_TIP_DUE")
        action = next(
            item
            for item in result.engagement_actions
            if item.action_key == "monthly_health_tip"
        )

        monkeypatch.setattr(patient_intelligence_api, "_entitled", lambda *args: None)

        patient_intelligence_api.delete_rule(
            rule.id,
            tenant_id=tenant.id,
            current_user=user,
            session=session,
        )

        assert session.get(PatientIntelligenceRule, rule.id) is None
        stored_flag = session.get(PatientIntelligenceFlag, flag.id)
        stored_action = session.get(PatientEngagementAction, action.id)
        assert stored_flag is not None
        assert stored_flag.status == IntelligenceFlagStatus.RESOLVED
        assert stored_flag.rule_id is None
        assert stored_action is not None
        assert stored_action.status == EngagementActionStatus.CANCELLED


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


def test_same_badge_can_have_membership_or_collection_rule_paths(test_engine):
    with Session(test_engine) as session:
        tenant, branch, non_member = _patient_fixture(session)
        member = Patient(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_number="PAT-004",
            full_name="Monthly Member",
        )
        high_value_non_member = Patient(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_number="PAT-005",
            full_name="Monthly High Value",
        )
        session.add(member)
        session.add(high_value_non_member)
        session.flush()
        _rule(
            session,
            tenant.id,
            rule_key="premium_monthly_member",
            name="Premium monthly member",
            flag_key="PREMIUM_PATIENT",
            category=IntelligenceFlagCategory.VALUE,
            metric_key="net_collected_30d",
            operator="gte",
            threshold=Decimal("2500"),
            priority=10,
            exclusive_group="patient_value_tier",
            requires_active_membership=True,
        )
        _rule(
            session,
            tenant.id,
            rule_key="premium_monthly_collection",
            name="Premium monthly collection",
            flag_key="PREMIUM_PATIENT",
            category=IntelligenceFlagCategory.VALUE,
            metric_key="net_collected_30d",
            operator="gte",
            threshold=Decimal("4000"),
            priority=11,
            exclusive_group="patient_value_tier",
        )

        non_member_flags = evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=non_member,
            metric_values={
                "net_collected_30d": Decimal("3000"),
                "active_membership": Decimal("0"),
            },
            now=now_utc(),
        )
        member_flags = evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=member,
            metric_values={
                "net_collected_30d": Decimal("3000"),
                "active_membership": Decimal("1"),
            },
            now=now_utc(),
        )
        high_value_flags = evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=high_value_non_member,
            metric_values={
                "net_collected_30d": Decimal("4500"),
                "active_membership": Decimal("0"),
            },
            now=now_utc(),
        )

        assert {flag.flag_key for flag in non_member_flags} == set()
        assert [flag.flag_key for flag in member_flags] == ["PREMIUM_PATIENT"]
        assert [flag.flag_key for flag in high_value_flags] == ["PREMIUM_PATIENT"]


def test_value_tier_grace_period_prevents_sudden_downgrade(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        earned_at = datetime(2026, 8, 1, tzinfo=timezone.utc)
        _rule(
            session,
            tenant.id,
            rule_key="premium_monthly_collection",
            name="Premium",
            flag_key="PREMIUM_PATIENT",
            category=IntelligenceFlagCategory.VALUE,
            metric_key="net_collected_30d",
            operator="gte",
            threshold=Decimal("4000"),
            priority=10,
            exclusive_group="patient_value_tier",
            auto_resolve=False,
            expires_after_days=60,
        )
        _rule(
            session,
            tenant.id,
            rule_key="gold_monthly_collection",
            name="Gold",
            flag_key="GOLD_PATIENT",
            category=IntelligenceFlagCategory.VALUE,
            metric_key="net_collected_30d",
            operator="gte",
            threshold=Decimal("1000"),
            priority=20,
            exclusive_group="patient_value_tier",
        )

        initial_flags = evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=patient,
            metric_values={"net_collected_30d": Decimal("4500")},
            now=earned_at,
        )
        grace_flags = evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=patient,
            metric_values={"net_collected_30d": Decimal("2000")},
            now=earned_at + timedelta(days=30),
        )
        expired_flags = evaluate_flags(
            session,
            tenant_id=tenant.id,
            patient=patient,
            metric_values={"net_collected_30d": Decimal("2000")},
            now=earned_at + timedelta(days=61),
        )

        assert {flag.flag_key for flag in initial_flags} == {"PREMIUM_PATIENT"}
        assert {flag.flag_key for flag in grace_flags} == {"PREMIUM_PATIENT"}
        assert {flag.flag_key for flag in expired_flags} == {"GOLD_PATIENT"}


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
        patient.monthly_tracking_enabled = True
        session.add(patient)
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


def test_monthly_tracking_auto_schedule_uses_next_month_first():
    assert patient_intelligence_api._first_day_of_next_month(date(2026, 8, 24)) == date(
        2026, 9, 1
    )
    assert patient_intelligence_api._first_day_of_next_month(
        date(2026, 12, 15)
    ) == date(2027, 1, 1)


def test_due_window_comes_from_enabled_rule_threshold(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, _patient = _patient_fixture(session)
        _rule(
            session,
            tenant.id,
            rule_key="monthly_lab_test_reminder",
            name="Monthly lab reminder",
            flag_key="MONTHLY_LAB_TEST_DUE",
            category=IntelligenceFlagCategory.RECURRING,
            metric_key="days_until_expected_lab_test",
            operator="lte",
            threshold=Decimal("7"),
        )
        _rule(
            session,
            tenant.id,
            rule_key="monthly_lab_test_reminder_disabled",
            name="Disabled lab reminder",
            flag_key="DISABLED_MONTHLY_LAB_TEST_DUE",
            category=IntelligenceFlagCategory.RECURRING,
            metric_key="days_until_expected_lab_test",
            operator="lte",
            threshold=Decimal("30"),
            is_enabled=False,
        )
        session.commit()

        rules = list_tenant_rules(session, tenant.id)

        assert (
            patient_intelligence_api._rule_due_window_days(
                rules, "days_until_expected_lab_test"
            )
            == 7
        )


def test_patient_monthly_tracking_fields_auto_advance_after_crossing(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        today = date.today()
        crossed_refill_on = today - timedelta(days=1)
        patient.monthly_tracking_enabled = True
        patient.monthly_refill_on = crossed_refill_on
        patient.monthly_refill_notes = "Monthly medicine refill"
        patient.monthly_lab_on = today
        patient.monthly_lab_test_name = "Sugar test"
        session.add(patient)
        session.commit()

        result = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        session.refresh(patient)
        assert patient.monthly_refill_on is not None
        assert patient.monthly_refill_on > today
        assert patient.monthly_refill_on != crossed_refill_on
        assert result.metrics.expected_refill_at.date() == patient.monthly_refill_on
        assert result.manual_refill_notes == "Monthly medicine refill"
        assert patient.monthly_lab_on == today
        assert result.manual_expected_lab_at.date() == today
        assert result.manual_lab_test_name == "Sugar test"


def test_patient_monthly_tracking_fields_are_ignored_when_disabled(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        patient.monthly_tracking_enabled = False
        patient.monthly_refill_on = date.today()
        patient.monthly_lab_on = date.today()
        session.add(patient)
        session.commit()

        result = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        assert result.metrics.expected_refill_at is None
        assert result.manual_expected_refill_at is None
        assert result.manual_expected_lab_at is None


def test_membership_expiring_inside_configured_window_creates_tracking_actions(
    test_engine,
):
    with Session(test_engine) as session:
        tenant, branch, patient = _patient_fixture(session)
        plan = PatientSubscriptionPlan(
            tenant_id=tenant.id,
            branch_id=branch.id,
            name="Smart Care Plan",
            price_amount=299,
            duration_days=30,
            free_consultations=1,
        )
        session.add(plan)
        session.flush()
        enrollment = PatientSubscriptionEnrollment(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            plan_id=plan.id,
            starts_on=date.today() - timedelta(days=9),
            ends_on=date.today() + timedelta(days=2),
            paid_amount=299,
            used_consultations=0,
        )
        session.add(enrollment)
        _rule(
            session,
            tenant.id,
            rule_key="membership_renewal_reminder_due",
            name="Membership renewal reminder due",
            flag_key="MEMBERSHIP_RENEWAL_DUE",
            category=IntelligenceFlagCategory.MEMBERSHIP,
            metric_key="membership_days_remaining",
            operator="between",
            threshold=Decimal("0"),
            threshold_secondary=Decimal("7"),
            requires_active_membership=True,
            action_enabled=True,
            action_key="membership_renewal_reminder",
            action_channel="whatsapp",
            action_template_key="membership_renewal_patient",
            action_requires_approval=True,
        )
        _rule(
            session,
            tenant.id,
            rule_key="unused_membership_benefit_reminder",
            name="Unused membership benefit reminder",
            flag_key="UNUSED_MEMBERSHIP_BENEFIT",
            category=IntelligenceFlagCategory.MEMBERSHIP,
            metric_key="unused_membership_benefit_count",
            operator="gte",
            threshold=Decimal("1"),
            requires_active_membership=True,
            action_enabled=True,
            action_key="unused_membership_benefit_reminder",
            action_channel="whatsapp",
            action_template_key="unused_benefit_patient",
            action_requires_approval=True,
        )
        session.commit()

        result = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        action_keys = {action.action_key for action in result.engagement_actions}
        assert "membership_renewal_reminder" in action_keys
        assert "unused_membership_benefit_reminder" in action_keys
        renewal_flag = next(
            flag for flag in result.flags if flag.flag_key == "MEMBERSHIP_RENEWAL_DUE"
        )
        assert renewal_flag.evidence["value"] in {"1", "2"}


def test_membership_renewal_action_revives_when_window_matches_again(test_engine):
    with Session(test_engine) as session:
        tenant, branch, patient = _patient_fixture(session)
        patient.whatsapp_consent_status = WhatsAppConsentStatus.OPTED_IN
        session.add(patient)
        plan = PatientSubscriptionPlan(
            tenant_id=tenant.id,
            branch_id=branch.id,
            name="Smart Care Plan",
            price=299,
            duration_days=30,
        )
        session.add(plan)
        session.flush()
        enrollment = PatientSubscriptionEnrollment(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            plan_id=plan.id,
            starts_on=date.today() - timedelta(days=9),
            ends_on=date.today() + timedelta(days=2),
            paid_amount=299,
        )
        session.add(enrollment)
        _rule(
            session,
            tenant.id,
            rule_key="membership_renewal_reminder_due",
            name="Membership renewal reminder due",
            flag_key="MEMBERSHIP_RENEWAL_DUE",
            category=IntelligenceFlagCategory.MEMBERSHIP,
            metric_key="membership_days_remaining",
            operator="between",
            threshold=Decimal("0"),
            threshold_secondary=Decimal("7"),
            requires_active_membership=True,
            action_enabled=True,
            action_key="membership_renewal_reminder",
            action_channel="whatsapp",
            action_template_key="membership_renewal_patient",
            action_requires_approval=True,
            action_cooldown_days=7,
        )
        session.commit()

        created = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )
        action = next(
            item
            for item in created.engagement_actions
            if item.action_key == "membership_renewal_reminder"
        )
        assert action.status == EngagementActionStatus.RECOMMENDED

        enrollment.ends_on = date.today() + timedelta(days=20)
        session.add(enrollment)
        session.commit()
        cancelled = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )
        action = next(
            item
            for item in cancelled.engagement_actions
            if item.action_key == "membership_renewal_reminder"
        )
        assert action.status == EngagementActionStatus.CANCELLED

        enrollment.ends_on = date.today() + timedelta(days=4)
        session.add(enrollment)
        session.commit()
        revived = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )
        action = next(
            item
            for item in revived.engagement_actions
            if item.action_key == "membership_renewal_reminder"
        )
        assert action.status == EngagementActionStatus.RECOMMENDED
        assert action.reason == "Configured action for Membership renewal reminder due"


def test_suppressed_engagement_revives_after_patient_opts_in(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        _rule(
            session,
            tenant.id,
            rule_key="health_tip_due",
            name="Monthly health tip",
            flag_key="HEALTH_TIP_DUE",
            category=IntelligenceFlagCategory.ENGAGEMENT,
            metric_key="patient_age_days",
            operator="gte",
            threshold=Decimal("0"),
            action_enabled=True,
            action_key="monthly_health_tip",
            action_channel="whatsapp",
            action_template_key="health_tip_patient",
            action_requires_approval=True,
        )
        session.commit()

        suppressed = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        action = next(
            item
            for item in suppressed.engagement_actions
            if item.action_key == "monthly_health_tip"
        )
        assert action.status == "suppressed"
        assert action.reason == (
            "Explicit WhatsApp opt-in is required for intelligence engagement"
        )

        patient.whatsapp_consent_status = WhatsAppConsentStatus.OPTED_IN
        session.add(patient)
        session.commit()

        revived = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        action = next(
            item
            for item in revived.engagement_actions
            if item.action_key == "monthly_health_tip"
        )
        assert action.status == "recommended"
        assert action.reason == "Configured action for Monthly health tip"


def test_health_tip_action_uses_tenant_content_library(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        patient.whatsapp_consent_status = WhatsAppConsentStatus.OPTED_IN
        session.add(patient)
        _rule(
            session,
            tenant.id,
            rule_key="health_tip_due",
            name="Monthly health tip",
            flag_key="HEALTH_TIP_DUE",
            category=IntelligenceFlagCategory.ENGAGEMENT,
            metric_key="patient_age_days",
            operator="gte",
            threshold=Decimal("0"),
            action_enabled=True,
            action_key="monthly_health_tip",
            action_channel="whatsapp",
            action_template_key="health_tip_patient",
            action_requires_approval=True,
        )
        session.add(
            PatientIntelligenceContentItem(
                tenant_id=tenant.id,
                content_key="monthly_awareness",
                title="Monthly awareness",
                category="health_tip",
                language="en",
                audience_flag_key="HEALTH_TIP_DUE",
                body_text="Tenant-approved health awareness content.",
                priority=10,
                is_enabled=True,
            )
        )
        session.commit()

        result = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        action = next(
            item
            for item in result.engagement_actions
            if item.action_key == "monthly_health_tip"
        )
        assert action.personalization["content_key"] == "monthly_awareness"
        assert action.personalization["content_title"] == "Monthly awareness"
        assert (
            action.personalization["content_body"]
            == "Tenant-approved health awareness content."
        )
        assert action.personalization["health_tip_topic"] == "Monthly awareness"


def test_engagement_action_personalization_includes_segment_context(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        patient.whatsapp_consent_status = WhatsAppConsentStatus.OPTED_IN
        session.add(patient)
        _rule(
            session,
            tenant.id,
            rule_key="inactive_patient_reengagement",
            name="Inactive patient re-engagement",
            flag_key="INACTIVE_PATIENT_REENGAGEMENT",
            category=IntelligenceFlagCategory.ENGAGEMENT,
            metric_key="days_since_activity",
            operator="gte",
            threshold=Decimal("0"),
            action_enabled=True,
            action_key="inactive_patient_reengagement",
            action_channel="whatsapp",
            action_template_key="patient_reengagement",
            action_requires_approval=True,
            score_dimension="engagement",
            score_weight=Decimal("12"),
        )
        session.commit()

        result = refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        action = next(
            item
            for item in result.engagement_actions
            if item.action_key == "inactive_patient_reengagement"
        )
        assert action.status == "recommended"
        assert action.personalization["engagement_segment"] == (
            "Inactive patient re-engagement"
        )
        assert action.personalization["flag_label"] == ("Inactive Patient Reengagement")
        assert "days_since_activity" in action.personalization
        assert "last_activity_date" in action.personalization
        assert action.personalization["clinic_name"] == tenant.name
        assert result.score_summary["engagement"] == Decimal("12")
        assert result.score_summary["total"] == Decimal("12")


def test_dashboard_returns_phase_three_segment_overview(test_engine, monkeypatch):
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        user = User(
            name="Tenant Admin",
            email="tenant.segment@example.test",
            password_hash="unused",
            is_super_admin=True,
        )
        patient.whatsapp_consent_status = WhatsAppConsentStatus.OPTED_IN
        session.add(user)
        session.add(patient)
        _rule(
            session,
            tenant.id,
            rule_key="inactive_patient_reengagement",
            name="Inactive patient re-engagement",
            flag_key="INACTIVE_PATIENT_REENGAGEMENT",
            category=IntelligenceFlagCategory.ENGAGEMENT,
            metric_key="days_since_activity",
            operator="gte",
            threshold=Decimal("0"),
            action_enabled=True,
            action_key="inactive_patient_reengagement",
            action_channel="whatsapp",
            action_template_key="patient_reengagement",
            action_requires_approval=True,
            score_dimension="risk",
            score_weight=Decimal("7"),
        )
        session.commit()
        refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )
        monkeypatch.setattr(patient_intelligence_api, "_entitled", lambda *args: None)

        dashboard = patient_intelligence_api.intelligence_dashboard(
            limit=25,
            offset=0,
            tenant_id=tenant.id,
            current_user=user,
            session=session,
        )

        segment = next(
            item
            for item in dashboard.segments
            if item.flag_key == "INACTIVE_PATIENT_REENGAGEMENT"
        )
        assert segment.patient_count == 1
        assert segment.open_engagement_count == 1
        assert segment.recommended_count == 1
        assert dashboard.rows[0].score_summary["risk"] == Decimal("7")
        assert dashboard.summary["risk_score_total"] == 7


def test_bulk_queue_recommended_engagement_actions(test_engine, monkeypatch):
    queued: list[dict] = []

    def fake_queue(_session, **kwargs):
        queued.append(kwargs)

        class Event:
            id = f"notification_{len(queued)}"

        return Event()

    monkeypatch.setattr(patient_intelligence_api, "_entitled", lambda *args: None)
    monkeypatch.setattr(
        patient_intelligence_api,
        "queue_whatsapp_template_if_allowed",
        fake_queue,
    )
    with Session(test_engine) as session:
        tenant, _branch, patient = _patient_fixture(session)
        user = User(
            name="Tenant Admin",
            email="tenant.bulk@example.test",
            password_hash="unused",
            is_super_admin=True,
        )
        patient.whatsapp_consent_status = WhatsAppConsentStatus.OPTED_IN
        session.add(user)
        session.add(patient)
        _rule(
            session,
            tenant.id,
            rule_key="inactive_patient_reengagement",
            name="Inactive patient re-engagement",
            flag_key="INACTIVE_PATIENT_REENGAGEMENT",
            category=IntelligenceFlagCategory.ENGAGEMENT,
            metric_key="days_since_activity",
            operator="gte",
            threshold=Decimal("0"),
            action_enabled=True,
            action_key="inactive_patient_reengagement",
            action_channel="whatsapp",
            action_template_key="patient_reengagement",
            action_requires_approval=True,
        )
        session.commit()
        refresh_patient_intelligence(
            session, tenant_id=tenant.id, patient_id=patient.id
        )

        preview = patient_intelligence_api.bulk_queue_engagement_actions(
            patient_intelligence_api.BulkEngagementQueueRequest(
                flag_key="INACTIVE_PATIENT_REENGAGEMENT",
                dry_run=True,
            ),
            tenant_id=tenant.id,
            current_user=user,
            session=session,
        )
        assert preview.matched == 1
        assert preview.queued == 0

        result = patient_intelligence_api.bulk_queue_engagement_actions(
            patient_intelligence_api.BulkEngagementQueueRequest(
                flag_key="INACTIVE_PATIENT_REENGAGEMENT",
            ),
            tenant_id=tenant.id,
            current_user=user,
            session=session,
        )

        assert result.matched == 1
        assert result.queued == 1
        assert result.notification_event_ids == ["notification_1"]
        assert queued[0]["flow_key"] == "patient_reengagement"
        action = session.exec(select(PatientEngagementAction)).first()
        assert action is not None
        assert action.status == EngagementActionStatus.QUEUED


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
        patient.whatsapp_consent_status = WhatsAppConsentStatus.OPTED_IN
        session.add(patient)
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
        patient.monthly_tracking_enabled = True
        session.add(patient)
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
