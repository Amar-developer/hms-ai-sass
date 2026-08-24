import json
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlmodel import Session, select

from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.audit.service import record_audit_event
from app.modules.identity import permissions
from app.modules.identity.models import User
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
from app.modules.patient_intelligence.schemas import (
    BulkEngagementQueueRead,
    BulkEngagementQueueRequest,
    IntelligenceContentCreate,
    IntelligenceContentRead,
    IntelligenceContentUpdate,
    IntelligenceRuleCreate,
    IntelligenceRuleBase,
    IntelligenceRuleRead,
    IntelligenceRuleUpdate,
    IntelligenceDashboardFlag,
    IntelligenceDashboardPatient,
    IntelligenceDashboardRead,
    IntelligenceDashboardSegment,
    ManualLabScheduleRead,
    ManualLabScheduleUpdate,
    ManualRefillScheduleRead,
    ManualRefillScheduleUpdate,
    PatientIntelligenceRead,
)
from app.modules.patient_intelligence.service import (
    invalidate_tenant_intelligence,
    list_tenant_rules,
    refresh_patient_intelligence,
    refresh_tenant_existing_data,
    score_summary_for_flags,
)
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc
from app.modules.integrations.whatsapp_consent import (
    patient_allows_engagement_whatsapp,
)
from app.modules.notifications.services.events import queue_whatsapp_template_if_allowed
from app.modules.patients.models import Patient


router = APIRouter(prefix="/patient-intelligence")


def _action_month_timestamp(action: PatientEngagementAction) -> datetime:
    return action.updated_at or action.created_at


def _action_in_month(action: PatientEngagementAction, month: date) -> bool:
    stamp = _action_month_timestamp(action).date()
    return stamp.year == month.year and stamp.month == month.month


def _action_bucket(action: PatientEngagementAction) -> str | None:
    text = " ".join(
        [
            action.action_key or "",
            action.template_key or "",
            action.reason or "",
        ]
    ).lower()
    if any(token in text for token in ("health_tip", "awareness")):
        return "health_tip"
    if "membership_renewal" in text or "renewal" in text:
        return "membership"
    if any(token in text for token in ("medicine_refill", "refill", "lab_test", "lab")):
        return "monthly"
    return None


def _action_status_rank(status_value: str) -> int:
    return {
        EngagementActionStatus.SENT.value: 5,
        EngagementActionStatus.QUEUED.value: 4,
        EngagementActionStatus.APPROVED.value: 3,
        EngagementActionStatus.RECOMMENDED.value: 2,
        EngagementActionStatus.FAILED.value: 1,
        EngagementActionStatus.SUPPRESSED.value: 1,
        EngagementActionStatus.CANCELLED.value: 0,
    }.get(status_value, 0)


def _monthly_action_summary(
    actions: list[PatientEngagementAction], month: date
) -> dict[str, tuple[str, datetime | None]]:
    summary: dict[str, PatientEngagementAction] = {}
    for action in actions:
        if not _action_in_month(action, month):
            continue
        bucket = _action_bucket(action)
        if not bucket:
            continue
        previous = summary.get(bucket)
        if previous is None:
            summary[bucket] = action
            continue
        current_rank = _action_status_rank(action.status.value)
        previous_rank = _action_status_rank(previous.status.value)
        if current_rank > previous_rank or (
            current_rank == previous_rank
            and _action_month_timestamp(action) > _action_month_timestamp(previous)
        ):
            summary[bucket] = action
    return {
        key: (action.status.value, _action_month_timestamp(action))
        for key, action in summary.items()
    }


def _first_day_of_next_month(value: date | None = None) -> date:
    current = value or date.today()
    if current.month == 12:
        return date(current.year + 1, 1, 1)
    return date(current.year, current.month + 1, 1)


def _rule_due_window_days(rules: list[PatientIntelligenceRule], metric_key: str) -> int:
    windows: list[int] = []
    for rule in rules:
        if not rule.is_enabled or rule.metric_key != metric_key:
            continue
        if rule.operator in {"lte", "lt", "eq"}:
            threshold = rule.threshold
        elif rule.operator == "between" and rule.threshold_secondary is not None:
            threshold = rule.threshold_secondary
        else:
            continue
        try:
            windows.append(max(int(threshold), 0))
        except (TypeError, ValueError):
            continue
    return max(windows, default=2)


METRIC_CATALOG = (
    ("net_collected", "Net collected", True),
    ("lifetime_net_collected", "Lifetime net collected", False),
    ("outstanding_amount", "Outstanding amount", False),
    ("completed_visits", "Completed visits", True),
    ("no_show_count", "Appointment no-shows", True),
    ("lab_order_count", "Lab orders", True),
    ("pharmacy_dispense_count", "Pharmacy dispenses", True),
    ("home_care_visit_count", "Completed home-care visits", True),
    ("days_since_activity", "Days since last activity", False),
    ("patient_age_days", "Days since first patient activity", False),
    ("recurring_interval_days", "Recurring medicine interval", False),
    ("recurring_occurrence_count", "Recurring medicine occurrences", False),
    ("recurring_max_deviation_days", "Recurring interval deviation", False),
    ("days_until_expected_refill", "Days until expected refill", False),
    ("days_until_expected_lab_test", "Days until expected lab test", False),
    ("active_membership", "Active paid membership", False),
    ("membership_days_remaining", "Membership days remaining", False),
    ("unused_membership_benefit_count", "Unused membership benefit count", False),
    ("unused_free_consultations", "Unused free consultations", False),
    ("unused_free_lab_tests", "Unused free lab tests", False),
    ("unused_free_medicines", "Unused free medicines", False),
)


def _safe_validation_errors(exc: ValidationError) -> list[dict]:
    errors: list[dict] = []
    for error in exc.errors(include_url=False):
        clean = dict(error)
        if "ctx" in clean:
            clean["ctx"] = {
                str(key): str(value) for key, value in dict(clean["ctx"]).items()
            }
        errors.append(clean)
    return errors


@router.get(
    "/dashboard",
    response_model=IntelligenceDashboardRead,
    dependencies=[Depends(require_permission(permissions.PATIENT_INTELLIGENCE_READ))],
)
def intelligence_dashboard(
    branch_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    flag_key: str | None = None,
    category: str | None = None,
    engagement_status: str | None = None,
    q: str | None = None,
    limit: int = Query(default=25, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_READ)
    ),
    session: Session = Depends(get_session),
) -> IntelligenceDashboardRead:
    _entitled(session, tenant_id, current_user)
    patient_metric_rows = session.exec(
        select(Patient, PatientMetricSnapshot)
        .outerjoin(
            PatientMetricSnapshot,
            (PatientMetricSnapshot.tenant_id == Patient.tenant_id)
            & (PatientMetricSnapshot.patient_id == Patient.id),
        )
        .where(Patient.tenant_id == tenant_id)
        .order_by(Patient.full_name, Patient.patient_number)
    ).all()
    patient_ids = [patient.id for patient, _snapshot in patient_metric_rows]
    rules = {rule.id: rule for rule in list_tenant_rules(session, tenant_id)}
    active_flags = (
        session.exec(
            select(PatientIntelligenceFlag).where(
                PatientIntelligenceFlag.tenant_id == tenant_id,
                PatientIntelligenceFlag.patient_id.in_(patient_ids),
                PatientIntelligenceFlag.status.notin_(
                    [IntelligenceFlagStatus.RESOLVED, IntelligenceFlagStatus.CLOSED]
                ),
            )
        ).all()
        if patient_ids
        else []
    )
    actions = (
        session.exec(
            select(PatientEngagementAction).where(
                PatientEngagementAction.tenant_id == tenant_id,
                PatientEngagementAction.patient_id.in_(patient_ids),
            )
        ).all()
        if patient_ids
        else []
    )
    settings = (
        session.exec(
            select(PatientIntelligencePatientSetting).where(
                PatientIntelligencePatientSetting.tenant_id == tenant_id,
                PatientIntelligencePatientSetting.patient_id.in_(patient_ids),
            )
        ).all()
        if patient_ids
        else []
    )
    flags_by_patient: dict[str, list[PatientIntelligenceFlag]] = {}
    for flag in active_flags:
        flags_by_patient.setdefault(flag.patient_id, []).append(flag)
    actions_by_patient: dict[str, list[PatientEngagementAction]] = {}
    for action in actions:
        actions_by_patient.setdefault(action.patient_id, []).append(action)
    settings_by_patient = {setting.patient_id: setting for setting in settings}
    open_action_statuses = {
        EngagementActionStatus.RECOMMENDED,
        EngagementActionStatus.APPROVED,
        EngagementActionStatus.QUEUED,
    }
    normalized_query = (q or "").strip().lower()
    filtered: list[tuple[Patient, PatientMetricSnapshot | None]] = []
    for patient, snapshot in patient_metric_rows:
        if branch_id and patient.branch_id != branch_id:
            continue
        last_activity = snapshot.last_activity_at if snapshot else None
        last_date = last_activity.date() if last_activity else None
        if from_date and (not last_date or last_date < from_date):
            continue
        if to_date and (not last_date or last_date > to_date):
            continue
        if (
            normalized_query
            and normalized_query
            not in " ".join(
                [
                    patient.full_name,
                    patient.patient_number,
                    patient.mobile or "",
                    patient.guardian_mobile or "",
                ]
            ).lower()
        ):
            continue
        patient_flags = flags_by_patient.get(patient.id, [])
        if flag_key and not any(flag.flag_key == flag_key for flag in patient_flags):
            continue
        if category and not any(
            flag.category.value == category for flag in patient_flags
        ):
            continue
        patient_actions = actions_by_patient.get(patient.id, [])
        if engagement_status and not any(
            action.status.value == engagement_status for action in patient_actions
        ):
            continue
        filtered.append((patient, snapshot))

    dashboard_rows: list[IntelligenceDashboardPatient] = []
    distribution: dict[str, dict] = {}
    segment_rows: dict[str, dict] = {}
    current_month = date.today()
    for patient, snapshot in filtered:
        patient_flags = flags_by_patient.get(patient.id, [])
        patient_actions = actions_by_patient.get(patient.id, [])
        communication_summary = _monthly_action_summary(patient_actions, current_month)
        score_summary = score_summary_for_flags(patient_flags, rules)
        dashboard_flags = []
        for flag in patient_flags:
            rule = rules.get(flag.rule_id or "")
            label = (rule.badge_label or rule.name) if rule else flag.flag_key
            dashboard_flags.append(
                IntelligenceDashboardFlag(
                    flag_key=flag.flag_key,
                    label=label,
                    category=flag.category.value,
                    severity=flag.severity,
                    background_color=rule.badge_background_color if rule else None,
                    text_color=rule.badge_text_color if rule else None,
                    border_color=rule.badge_border_color if rule else None,
                    priority=rule.priority if rule else 100,
                )
            )
            bucket = distribution.setdefault(
                flag.flag_key,
                {
                    "flag_key": flag.flag_key,
                    "label": label,
                    "count": 0,
                    "background_color": rule.badge_background_color if rule else None,
                    "text_color": rule.badge_text_color if rule else None,
                    "border_color": rule.badge_border_color if rule else None,
                },
            )
            bucket["count"] += 1
            segment = segment_rows.setdefault(
                flag.flag_key,
                {
                    "flag_key": flag.flag_key,
                    "label": label,
                    "category": flag.category.value,
                    "severity": flag.severity,
                    "patient_count": 0,
                    "open_engagement_count": 0,
                    "recommended_count": 0,
                    "approved_count": 0,
                    "queued_count": 0,
                    "sent_count": 0,
                    "suppressed_count": 0,
                    "failed_count": 0,
                    "background_color": rule.badge_background_color if rule else None,
                    "text_color": rule.badge_text_color if rule else None,
                    "border_color": rule.badge_border_color if rule else None,
                    "priority": rule.priority if rule else 100,
                },
            )
            segment["patient_count"] += 1
            for action in patient_actions:
                if action.source_flag_id != flag.id:
                    continue
                if action.status in open_action_statuses:
                    segment["open_engagement_count"] += 1
                count_key = f"{action.status.value}_count"
                if count_key in segment:
                    segment[count_key] += 1
        dashboard_flags.sort(key=lambda item: (item.priority, item.flag_key))
        setting = settings_by_patient.get(patient.id)
        manual_refill_at = (
            datetime.combine(patient.monthly_refill_on, time.min, tzinfo=timezone.utc)
            if patient.monthly_tracking_enabled and patient.monthly_refill_on
            else setting.manual_expected_refill_at
            if setting and patient.monthly_tracking_enabled
            else None
        )
        manual_lab_at = (
            datetime.combine(patient.monthly_lab_on, time.min, tzinfo=timezone.utc)
            if patient.monthly_tracking_enabled and patient.monthly_lab_on
            else setting.manual_expected_lab_at
            if setting and patient.monthly_tracking_enabled
            else None
        )
        dashboard_rows.append(
            IntelligenceDashboardPatient(
                patient_id=patient.id,
                patient_number=patient.patient_number,
                full_name=patient.full_name,
                mobile=patient.mobile,
                branch_id=patient.branch_id,
                last_activity_at=snapshot.last_activity_at if snapshot else None,
                net_collected_30d=snapshot.net_collected_30d if snapshot else 0,
                net_collected_365d=snapshot.net_collected_365d if snapshot else 0,
                completed_visits=snapshot.completed_visits if snapshot else 0,
                score_summary=score_summary,
                active_flag_count=len(patient_flags),
                open_engagement_count=sum(
                    action.status in open_action_statuses for action in patient_actions
                ),
                expected_refill_at=snapshot.expected_refill_at if snapshot else None,
                manual_expected_refill_at=manual_refill_at,
                manual_refill_notes=patient.monthly_refill_notes
                or (setting.notes if setting else None),
                manual_expected_lab_at=manual_lab_at,
                manual_lab_test_name=patient.monthly_lab_test_name
                or (setting.manual_lab_test_name if setting else None),
                manual_lab_notes=patient.monthly_lab_notes
                or (setting.manual_lab_notes if setting else None),
                monthly_reminder_status=communication_summary.get(
                    "monthly", ("not_sent", None)
                )[0],
                monthly_reminder_at=communication_summary.get(
                    "monthly", ("not_sent", None)
                )[1],
                membership_reminder_status=communication_summary.get(
                    "membership", ("not_sent", None)
                )[0],
                membership_reminder_at=communication_summary.get(
                    "membership", ("not_sent", None)
                )[1],
                health_tip_status=communication_summary.get(
                    "health_tip", ("not_sent", None)
                )[0],
                health_tip_at=communication_summary.get(
                    "health_tip", ("not_sent", None)
                )[1],
                flags=dashboard_flags,
            )
        )
    total = len(dashboard_rows)
    page_rows = dashboard_rows[offset : offset + limit]
    today = date.today()
    refill_window_days = _rule_due_window_days(
        rules.values(), "days_until_expected_refill"
    )
    lab_window_days = _rule_due_window_days(
        rules.values(), "days_until_expected_lab_test"
    )
    upcoming_refill_patient_ids = {
        patient.id
        for patient, snapshot in filtered
        if snapshot
        and snapshot.expected_refill_at
        and snapshot.expected_refill_at.date() > today
        and snapshot.expected_refill_at.date()
        <= today + timedelta(days=refill_window_days)
    }
    today_medicine_patient_ids = {
        patient.id
        for patient, snapshot in filtered
        if snapshot
        and snapshot.expected_refill_at
        and snapshot.expected_refill_at.date() == today
    }
    upcoming_lab_patient_ids = {
        row.patient_id
        for row in dashboard_rows
        if row.manual_expected_lab_at
        and row.manual_expected_lab_at.date() > today
        and row.manual_expected_lab_at.date() <= today + timedelta(days=lab_window_days)
    }
    today_lab_patient_ids = {
        row.patient_id
        for row in dashboard_rows
        if row.manual_expected_lab_at and row.manual_expected_lab_at.date() == today
    }
    flag_options_by_key: dict[str, dict[str, str]] = {}
    for rule in sorted(rules.values(), key=lambda item: (item.priority, item.name)):
        if not rule.is_enabled or rule.flag_key in flag_options_by_key:
            continue
        flag_options_by_key[rule.flag_key] = {
            "flag_key": rule.flag_key,
            "label": rule.badge_label or rule.name,
            "category": rule.category.value,
        }
    return IntelligenceDashboardRead(
        summary={
            "total_patients": total,
            "patients_with_flags": sum(bool(row.flags) for row in dashboard_rows),
            "active_flags": sum(row.active_flag_count for row in dashboard_rows),
            "open_engagement_actions": sum(
                row.open_engagement_count for row in dashboard_rows
            ),
            "scheduled_refills": sum(
                row.expected_refill_at is not None for row in dashboard_rows
            ),
            "upcoming_refill_reminders": len(upcoming_refill_patient_ids),
            "today_medicine_patients": len(today_medicine_patient_ids),
            "upcoming_lab_test_reminders": len(upcoming_lab_patient_ids),
            "today_lab_test_patients": len(today_lab_patient_ids),
            "manual_refill_dates": sum(
                row.manual_expected_refill_at is not None for row in dashboard_rows
            ),
            "manual_lab_dates": sum(
                row.manual_expected_lab_at is not None for row in dashboard_rows
            ),
            "value_score_total": int(
                sum(row.score_summary.get("value", 0) for row in dashboard_rows)
            ),
            "engagement_score_total": int(
                sum(row.score_summary.get("engagement", 0) for row in dashboard_rows)
            ),
            "risk_score_total": int(
                sum(row.score_summary.get("risk", 0) for row in dashboard_rows)
            ),
            "loyalty_score_total": int(
                sum(row.score_summary.get("loyalty", 0) for row in dashboard_rows)
            ),
        },
        badge_distribution=sorted(
            distribution.values(), key=lambda item: (-item["count"], item["label"])
        ),
        segments=[
            IntelligenceDashboardSegment(**row)
            for row in sorted(
                segment_rows.values(),
                key=lambda item: (
                    item["category"],
                    item["priority"],
                    item["label"],
                ),
            )
        ],
        flag_options=list(flag_options_by_key.values()),
        rows=page_rows,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch(
    "/patients/{patient_id}/manual-refill",
    response_model=ManualRefillScheduleRead,
    dependencies=[
        Depends(
            require_any_permission(
                permissions.PATIENT_INTELLIGENCE_MANAGE,
                permissions.PATIENTS_EDIT,
            )
        )
    ],
)
def update_manual_refill_schedule(
    patient_id: str,
    payload: ManualRefillScheduleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_INTELLIGENCE_MANAGE,
            permissions.PATIENTS_EDIT,
        )
    ),
    session: Session = Depends(get_session),
) -> ManualRefillScheduleRead:
    _entitled(session, tenant_id, current_user)
    patient = session.get(Patient, patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    setting = session.exec(
        select(PatientIntelligencePatientSetting).where(
            PatientIntelligencePatientSetting.tenant_id == tenant_id,
            PatientIntelligencePatientSetting.patient_id == patient_id,
        )
    ).first()
    if not setting:
        setting = PatientIntelligencePatientSetting(
            tenant_id=tenant_id, patient_id=patient_id
        )
    expected_refill_on = payload.expected_refill_on or (
        _first_day_of_next_month() if payload.auto_schedule else None
    )
    if expected_refill_on:
        patient.monthly_tracking_enabled = True
    elif not patient.monthly_lab_on:
        patient.monthly_tracking_enabled = False
    patient.monthly_refill_on = expected_refill_on
    patient.monthly_refill_notes = payload.notes
    patient.updated_at = now_utc()
    setting.manual_expected_refill_at = (
        datetime.combine(expected_refill_on, time.min, tzinfo=timezone.utc)
        if expected_refill_on
        else None
    )
    setting.notes = payload.notes
    setting.updated_by_user_id = current_user.id
    setting.updated_at = now_utc()
    session.add(patient)
    session.add(setting)
    session.flush()
    refresh_patient_intelligence(session, tenant_id=tenant_id, patient_id=patient_id)
    session.refresh(setting)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=patient.branch_id,
        actor_user_id=current_user.id,
        action="patient_intelligence.manual_refill_updated",
        resource_type="patient",
        resource_id=patient_id,
        purpose="patient_engagement_configuration",
        metadata_json=json.dumps(
            {"expected_refill_on": expected_refill_on, "notes": payload.notes},
            default=str,
        ),
    )
    return ManualRefillScheduleRead(
        patient_id=patient_id,
        expected_refill_at=(
            datetime.combine(patient.monthly_refill_on, time.min, tzinfo=timezone.utc)
            if patient.monthly_refill_on
            else None
        ),
        notes=patient.monthly_refill_notes,
        updated_at=setting.updated_at,
    )


@router.patch(
    "/patients/{patient_id}/manual-lab",
    response_model=ManualLabScheduleRead,
    dependencies=[
        Depends(
            require_any_permission(
                permissions.PATIENT_INTELLIGENCE_MANAGE,
                permissions.PATIENTS_EDIT,
            )
        )
    ],
)
def update_manual_lab_schedule(
    patient_id: str,
    payload: ManualLabScheduleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENT_INTELLIGENCE_MANAGE,
            permissions.PATIENTS_EDIT,
        )
    ),
    session: Session = Depends(get_session),
) -> ManualLabScheduleRead:
    _entitled(session, tenant_id, current_user)
    patient = session.get(Patient, patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    setting = session.exec(
        select(PatientIntelligencePatientSetting).where(
            PatientIntelligencePatientSetting.tenant_id == tenant_id,
            PatientIntelligencePatientSetting.patient_id == patient_id,
        )
    ).first()
    if not setting:
        setting = PatientIntelligencePatientSetting(
            tenant_id=tenant_id, patient_id=patient_id
        )
    expected_lab_on = payload.expected_lab_on or (
        _first_day_of_next_month() if payload.auto_schedule else None
    )
    if expected_lab_on:
        patient.monthly_tracking_enabled = True
    elif not patient.monthly_refill_on:
        patient.monthly_tracking_enabled = False
    patient.monthly_lab_on = expected_lab_on
    patient.monthly_lab_test_name = payload.lab_test_name or None
    patient.monthly_lab_notes = payload.notes or None
    patient.updated_at = now_utc()
    setting.manual_expected_lab_at = (
        datetime.combine(expected_lab_on, time.min, tzinfo=timezone.utc)
        if expected_lab_on
        else None
    )
    setting.manual_lab_test_name = payload.lab_test_name or None
    setting.manual_lab_notes = payload.notes or None
    setting.updated_by_user_id = current_user.id
    setting.updated_at = now_utc()
    session.add(patient)
    session.add(setting)
    session.flush()
    refresh_patient_intelligence(session, tenant_id=tenant_id, patient_id=patient_id)
    session.refresh(setting)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=patient.branch_id,
        actor_user_id=current_user.id,
        action="patient_intelligence.manual_lab_updated",
        resource_type="patient",
        resource_id=patient_id,
        purpose="patient_engagement_configuration",
        metadata_json=json.dumps(
            {
                "expected_lab_on": expected_lab_on,
                "lab_test_name": payload.lab_test_name,
                "notes": payload.notes,
            },
            default=str,
        ),
    )
    return ManualLabScheduleRead(
        patient_id=patient_id,
        expected_lab_at=(
            datetime.combine(patient.monthly_lab_on, time.min, tzinfo=timezone.utc)
            if patient.monthly_lab_on
            else None
        ),
        lab_test_name=patient.monthly_lab_test_name,
        notes=patient.monthly_lab_notes,
        updated_at=setting.updated_at,
    )


def _entitled(session: Session, tenant_id: str, current_user: User) -> None:
    # Patient Intelligence is a paid plug-in capability. Tenant-admin status
    # grants configuration permission but never bypasses plan entitlement.
    enforce_module_enabled(session, tenant_id, "patient_intelligence")


@router.get(
    "/patients/{patient_id}",
    response_model=PatientIntelligenceRead,
    dependencies=[Depends(require_permission(permissions.PATIENT_INTELLIGENCE_READ))],
)
def patient_intelligence(
    patient_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_READ)
    ),
    session: Session = Depends(get_session),
) -> PatientIntelligenceRead:
    _entitled(session, tenant_id, current_user)
    return refresh_patient_intelligence(
        session, tenant_id=tenant_id, patient_id=patient_id
    )


@router.get(
    "/rules",
    response_model=list[IntelligenceRuleRead],
    dependencies=[
        Depends(require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE))
    ],
)
def list_rules(
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> list[PatientIntelligenceRule]:
    _entitled(session, tenant_id, current_user)
    return list_tenant_rules(session, tenant_id)


@router.get(
    "/configuration-options",
    response_model=dict,
    dependencies=[
        Depends(require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE))
    ],
)
def configuration_options(
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> dict:
    _entitled(session, tenant_id, current_user)
    return {
        "metrics": [
            {"key": key, "label": label, "supports_window": supports_window}
            for key, label, supports_window in METRIC_CATALOG
        ],
        "operators": ["gte", "gt", "lte", "lt", "eq", "neq", "between"],
        "categories": [category.value for category in IntelligenceFlagCategory],
        "score_dimensions": [
            {"key": "value", "label": "Value score"},
            {"key": "engagement", "label": "Engagement score"},
            {"key": "risk", "label": "Risk score"},
            {"key": "loyalty", "label": "Loyalty score"},
        ],
        # Phase 1 has a real consent-aware executor only for WhatsApp. Future
        # executors can add their channel here without changing rule storage.
        "channels": ["whatsapp"],
    }


@router.post(
    "/rules",
    response_model=IntelligenceRuleRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE))
    ],
)
def create_rule(
    payload: IntelligenceRuleCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> PatientIntelligenceRule:
    _entitled(session, tenant_id, current_user)
    duplicate = session.exec(
        select(PatientIntelligenceRule).where(
            PatientIntelligenceRule.tenant_id == tenant_id,
            PatientIntelligenceRule.rule_key == payload.rule_key,
        )
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A rule with this key already exists",
        )
    values = payload.model_dump(exclude={"category", "required_flag_keys"})
    row = PatientIntelligenceRule(
        tenant_id=tenant_id,
        category=IntelligenceFlagCategory(payload.category),
        required_flag_keys_json=json.dumps(payload.required_flag_keys),
        **values,
    )
    session.add(row)
    invalidate_tenant_intelligence(session, tenant_id=tenant_id)
    session.commit()
    session.refresh(row)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        action="patient_intelligence.rule_created",
        resource_type="patient_intelligence_rule",
        resource_id=row.id,
        purpose="patient_engagement_configuration",
    )
    return row


@router.patch(
    "/rules/{rule_id}",
    response_model=IntelligenceRuleRead,
    dependencies=[
        Depends(require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE))
    ],
)
def update_rule(
    rule_id: str,
    payload: IntelligenceRuleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> PatientIntelligenceRule:
    _entitled(session, tenant_id, current_user)
    row = session.get(PatientIntelligenceRule, rule_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found"
        )
    changes = payload.model_dump(exclude_unset=True)
    candidate = {
        field: getattr(row, field)
        for field in IntelligenceRuleBase.model_fields
        if field != "required_flag_keys"
    }
    candidate["required_flag_keys"] = row.required_flag_keys
    candidate.update(changes)
    try:
        IntelligenceRuleBase.model_validate(candidate)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_safe_validation_errors(exc),
        ) from exc
    for key, value in changes.items():
        if key == "required_flag_keys":
            row.required_flag_keys_json = json.dumps(value)
        elif key == "category":
            row.category = IntelligenceFlagCategory(value)
        else:
            setattr(row, key, value)
    row.version += 1
    row.updated_at = now_utc()
    session.add(row)
    invalidate_tenant_intelligence(session, tenant_id=tenant_id)
    session.commit()
    session.refresh(row)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        action="patient_intelligence.rule_updated",
        resource_type="patient_intelligence_rule",
        resource_id=row.id,
        purpose="patient_engagement_configuration",
    )
    return row


@router.get(
    "/content-library",
    response_model=list[IntelligenceContentRead],
    dependencies=[
        Depends(require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE))
    ],
)
def list_content_library(
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> list[PatientIntelligenceContentItem]:
    _entitled(session, tenant_id, current_user)
    return session.exec(
        select(PatientIntelligenceContentItem)
        .where(PatientIntelligenceContentItem.tenant_id == tenant_id)
        .order_by(
            PatientIntelligenceContentItem.priority,
            PatientIntelligenceContentItem.title,
        )
    ).all()


@router.post(
    "/content-library",
    response_model=IntelligenceContentRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE))
    ],
)
def create_content_item(
    payload: IntelligenceContentCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> PatientIntelligenceContentItem:
    _entitled(session, tenant_id, current_user)
    duplicate = session.exec(
        select(PatientIntelligenceContentItem).where(
            PatientIntelligenceContentItem.tenant_id == tenant_id,
            PatientIntelligenceContentItem.content_key == payload.content_key,
        )
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A content item with this key already exists",
        )
    row = PatientIntelligenceContentItem(tenant_id=tenant_id, **payload.model_dump())
    session.add(row)
    invalidate_tenant_intelligence(session, tenant_id=tenant_id)
    session.commit()
    session.refresh(row)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        action="patient_intelligence.content_created",
        resource_type="patient_intelligence_content",
        resource_id=row.id,
        purpose="patient_engagement_configuration",
    )
    return row


@router.patch(
    "/content-library/{content_id}",
    response_model=IntelligenceContentRead,
    dependencies=[
        Depends(require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE))
    ],
)
def update_content_item(
    content_id: str,
    payload: IntelligenceContentUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> PatientIntelligenceContentItem:
    _entitled(session, tenant_id, current_user)
    row = session.get(PatientIntelligenceContentItem, content_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Content item not found"
        )
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    row.updated_at = now_utc()
    session.add(row)
    invalidate_tenant_intelligence(session, tenant_id=tenant_id)
    session.commit()
    session.refresh(row)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        action="patient_intelligence.content_updated",
        resource_type="patient_intelligence_content",
        resource_id=row.id,
        purpose="patient_engagement_configuration",
    )
    return row


@router.delete(
    "/content-library/{content_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        Depends(require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE))
    ],
)
def delete_content_item(
    content_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> None:
    _entitled(session, tenant_id, current_user)
    row = session.get(PatientIntelligenceContentItem, content_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Content item not found"
        )
    session.delete(row)
    invalidate_tenant_intelligence(session, tenant_id=tenant_id)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        action="patient_intelligence.content_deleted",
        resource_type="patient_intelligence_content",
        resource_id=content_id,
        purpose="patient_engagement_configuration",
    )
    return None


@router.delete(
    "/rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        Depends(require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE))
    ],
)
def delete_rule(
    rule_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_RULES_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> None:
    _entitled(session, tenant_id, current_user)
    row = session.get(PatientIntelligenceRule, rule_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found"
        )
    flags = session.exec(
        select(PatientIntelligenceFlag).where(
            PatientIntelligenceFlag.tenant_id == tenant_id,
            PatientIntelligenceFlag.rule_id == row.id,
        )
    ).all()
    flag_ids = [flag.id for flag in flags]
    actions = (
        session.exec(
            select(PatientEngagementAction).where(
                PatientEngagementAction.tenant_id == tenant_id,
                PatientEngagementAction.source_flag_id.in_(flag_ids),
            )
        ).all()
        if flag_ids
        else []
    )
    now = now_utc()
    for action in actions:
        if action.status in {
            EngagementActionStatus.RECOMMENDED,
            EngagementActionStatus.APPROVED,
            EngagementActionStatus.SUPPRESSED,
        }:
            action.status = EngagementActionStatus.CANCELLED
            action.reason = "The source rule was deleted"
            action.updated_at = now
        session.add(action)
    for flag in flags:
        if flag.status not in {
            IntelligenceFlagStatus.RESOLVED,
            IntelligenceFlagStatus.CLOSED,
        }:
            flag.status = IntelligenceFlagStatus.RESOLVED
            flag.resolved_at = now
        flag.rule_id = None
        flag.updated_at = now
        session.add(flag)
    session.delete(row)
    invalidate_tenant_intelligence(session, tenant_id=tenant_id)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        action="patient_intelligence.rule_deleted",
        resource_type="patient_intelligence_rule",
        resource_id=rule_id,
        purpose="patient_engagement_configuration",
    )
    return None


@router.post(
    "/adapt-existing-data",
    response_model=dict[str, int],
    dependencies=[Depends(require_permission(permissions.PATIENT_INTELLIGENCE_MANAGE))],
)
def adapt_existing_data(
    limit: int = Query(default=500, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_MANAGE)
    ),
    session: Session = Depends(get_session),
) -> dict[str, int]:
    _entitled(session, tenant_id, current_user)
    count = refresh_tenant_existing_data(
        session, tenant_id=tenant_id, limit=limit, offset=offset
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        action="patient_intelligence.existing_data_adapted",
        resource_type="patient_intelligence",
        resource_id=tenant_id,
        purpose="patient_intelligence_backfill",
        metadata_json=f'{{"patients": {count}}}',
    )
    return {"patients_processed": count}


def _queue_engagement_whatsapp_action(
    session: Session,
    *,
    tenant_id: str,
    action: PatientEngagementAction,
    current_user: User,
    commit: bool = True,
) -> tuple[str, str | None]:
    if action.status not in {
        EngagementActionStatus.RECOMMENDED,
        EngagementActionStatus.APPROVED,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Engagement action is not sendable",
        )
    if action.channel != "whatsapp":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The configured {action.channel} channel is not sent through the WhatsApp endpoint",
        )
    patient = session.get(Patient, action.patient_id)
    if not patient_allows_engagement_whatsapp(patient):
        action.status = EngagementActionStatus.SUPPRESSED
        action.reason = (
            "Explicit WhatsApp opt-in is required for intelligence engagement"
        )
        action.updated_at = now_utc()
        session.add(action)
        if commit:
            session.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Patient has not explicitly opted in to engagement messages",
        )
    if action.requires_approval:
        action.status = EngagementActionStatus.APPROVED
        action.approved_by_user_id = current_user.id
        action.approved_at = now_utc()
        session.add(action)
        if commit:
            session.commit()
    event = queue_whatsapp_template_if_allowed(
        session,
        tenant_id=tenant_id,
        branch_id=action.branch_id,
        flow_key=action.template_key,
        recipient=patient.mobile if patient else None,
        resource_type="patient_engagement_action",
        resource_id=action.id,
        dedupe_key=f"whatsapp:{action.dedupe_key}",
        queued_by_user_id=current_user.id,
    )
    if not event:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="WhatsApp is unavailable or the approved template flow is not configured",
        )
    action.status = EngagementActionStatus.QUEUED
    action.notification_event_id = event.id
    action.updated_at = now_utc()
    session.add(action)
    if commit:
        session.commit()
    return action.status.value, event.id


@router.post(
    "/engagement-actions/bulk-queue",
    response_model=BulkEngagementQueueRead,
    dependencies=[Depends(require_permission(permissions.PATIENT_ENGAGEMENT_SEND))],
)
def bulk_queue_engagement_actions(
    payload: BulkEngagementQueueRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_ENGAGEMENT_SEND)
    ),
    session: Session = Depends(get_session),
) -> BulkEngagementQueueRead:
    _entitled(session, tenant_id, current_user)
    statement = (
        select(PatientEngagementAction, PatientIntelligenceFlag)
        .join(
            PatientIntelligenceFlag,
            PatientIntelligenceFlag.id == PatientEngagementAction.source_flag_id,
        )
        .where(
            PatientEngagementAction.tenant_id == tenant_id,
            PatientEngagementAction.status == EngagementActionStatus.RECOMMENDED,
            PatientEngagementAction.channel == "whatsapp",
            PatientIntelligenceFlag.status.notin_(
                [IntelligenceFlagStatus.RESOLVED, IntelligenceFlagStatus.CLOSED]
            ),
        )
        .order_by(PatientEngagementAction.created_at)
        .limit(payload.limit)
    )
    if payload.flag_key:
        statement = statement.where(
            PatientIntelligenceFlag.flag_key == payload.flag_key
        )
    if payload.category:
        statement = statement.where(
            PatientIntelligenceFlag.category == payload.category
        )
    if payload.action_key:
        statement = statement.where(
            PatientEngagementAction.action_key == payload.action_key
        )
    rows = session.exec(statement).all()
    if payload.dry_run:
        return BulkEngagementQueueRead(
            matched=len(rows),
            queued=0,
            suppressed=0,
            skipped=0,
            failed=0,
        )
    result = BulkEngagementQueueRead(
        matched=len(rows),
        queued=0,
        suppressed=0,
        skipped=0,
        failed=0,
    )
    for action, _flag in rows:
        try:
            _status, event_id = _queue_engagement_whatsapp_action(
                session,
                tenant_id=tenant_id,
                action=action,
                current_user=current_user,
                commit=True,
            )
            result.queued += 1
            if event_id:
                result.notification_event_ids.append(event_id)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_409_CONFLICT and "opted in" in str(
                exc.detail
            ):
                result.suppressed += 1
            else:
                result.failed += 1
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        action="patient_engagement.bulk_whatsapp_queued",
        resource_type="patient_engagement_action",
        resource_id=tenant_id,
        purpose="patient_engagement_campaign",
        metadata_json=json.dumps(
            {
                "matched": result.matched,
                "queued": result.queued,
                "suppressed": result.suppressed,
                "failed": result.failed,
                "flag_key": payload.flag_key,
                "category": payload.category,
                "action_key": payload.action_key,
            }
        ),
    )
    return result


@router.post(
    "/engagement-actions/{action_id}/send",
    response_model=dict[str, str],
    dependencies=[Depends(require_permission(permissions.PATIENT_ENGAGEMENT_SEND))],
)
def send_engagement_action(
    action_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_ENGAGEMENT_SEND)
    ),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    _entitled(session, tenant_id, current_user)
    action = session.get(PatientEngagementAction, action_id)
    if not action or action.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Engagement action not found"
        )
    _status, event_id = _queue_engagement_whatsapp_action(
        session=session,
        tenant_id=tenant_id,
        action=action,
        current_user=current_user,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=action.branch_id,
        actor_user_id=current_user.id,
        action="patient_engagement.whatsapp_queued",
        resource_type="patient_engagement_action",
        resource_id=action.id,
        purpose="patient_engagement",
        metadata_json=f'{{"template_key": "{action.template_key}"}}',
    )
    return {
        "action_id": action.id,
        "notification_event_id": event_id or "",
        "status": action.status.value,
    }
