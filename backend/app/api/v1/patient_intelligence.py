import json
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlmodel import Session, select

from app.core.auth import require_permission
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
    PatientIntelligenceFlag,
    PatientIntelligencePatientSetting,
    PatientIntelligenceRule,
    PatientMetricSnapshot,
)
from app.modules.patient_intelligence.schemas import (
    IntelligenceRuleCreate,
    IntelligenceRuleBase,
    IntelligenceRuleRead,
    IntelligenceRuleUpdate,
    IntelligenceDashboardFlag,
    IntelligenceDashboardPatient,
    IntelligenceDashboardRead,
    ManualRefillScheduleRead,
    ManualRefillScheduleUpdate,
    PatientIntelligenceRead,
)
from app.modules.patient_intelligence.service import (
    invalidate_tenant_intelligence,
    list_tenant_rules,
    refresh_patient_intelligence,
    refresh_tenant_existing_data,
)
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc
from app.modules.integrations.whatsapp_consent import (
    patient_allows_engagement_whatsapp,
)
from app.modules.notifications.services.events import queue_whatsapp_template_if_allowed
from app.modules.patients.models import Patient


router = APIRouter(prefix="/patient-intelligence")

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
    ("active_membership", "Active paid membership", False),
    ("membership_days_remaining", "Membership days remaining", False),
)


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
    for patient, snapshot in filtered:
        patient_flags = flags_by_patient.get(patient.id, [])
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
        dashboard_flags.sort(key=lambda item: (item.priority, item.flag_key))
        patient_actions = actions_by_patient.get(patient.id, [])
        setting = settings_by_patient.get(patient.id)
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
                active_flag_count=len(patient_flags),
                open_engagement_count=sum(
                    action.status in open_action_statuses for action in patient_actions
                ),
                expected_refill_at=snapshot.expected_refill_at if snapshot else None,
                manual_expected_refill_at=(
                    setting.manual_expected_refill_at if setting else None
                ),
                manual_refill_notes=setting.notes if setting else None,
                flags=dashboard_flags,
            )
        )
    total = len(dashboard_rows)
    page_rows = dashboard_rows[offset : offset + limit]
    today = date.today()
    upcoming_refill_patient_ids = {
        patient.id
        for patient, snapshot in filtered
        if snapshot
        and snapshot.expected_refill_at
        and snapshot.expected_refill_at.date() > today
        and snapshot.expected_refill_at.date() <= today + timedelta(days=2)
    }
    today_medicine_patient_ids = {
        patient.id
        for patient, snapshot in filtered
        if snapshot
        and snapshot.expected_refill_at
        and snapshot.expected_refill_at.date() == today
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
            "manual_refill_dates": sum(
                row.manual_expected_refill_at is not None for row in dashboard_rows
            ),
        },
        badge_distribution=sorted(
            distribution.values(), key=lambda item: (-item["count"], item["label"])
        ),
        flag_options=list(flag_options_by_key.values()),
        rows=page_rows,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch(
    "/patients/{patient_id}/manual-refill",
    response_model=ManualRefillScheduleRead,
    dependencies=[Depends(require_permission(permissions.PATIENT_INTELLIGENCE_MANAGE))],
)
def update_manual_refill_schedule(
    patient_id: str,
    payload: ManualRefillScheduleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_permission(permissions.PATIENT_INTELLIGENCE_MANAGE)
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
    setting.manual_expected_refill_at = (
        datetime.combine(payload.expected_refill_on, time.min, tzinfo=timezone.utc)
        if payload.expected_refill_on
        else None
    )
    setting.notes = payload.notes
    setting.updated_by_user_id = current_user.id
    setting.updated_at = now_utc()
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
            {"expected_refill_on": payload.expected_refill_on, "notes": payload.notes},
            default=str,
        ),
    )
    return ManualRefillScheduleRead(
        patient_id=patient_id,
        expected_refill_at=setting.manual_expected_refill_at,
        notes=setting.notes,
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
        from fastapi import HTTPException, status

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
            detail=exc.errors(include_url=False),
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
    session.commit()
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
        "notification_event_id": event.id,
        "status": action.status.value,
    }
