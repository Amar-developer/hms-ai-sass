import json
import calendar
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from statistics import median

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.billing.models import Invoice, InvoiceStatus, Payment
from app.modules.home_care.models import HomeCareBooking, HomeCareVisitLog
from app.modules.integrations.whatsapp_entity_fields import build_entity_context
from app.modules.integrations.whatsapp_consent import patient_allows_engagement_whatsapp
from app.modules.lab.models import LabOrder, LabOrderItem
from app.modules.patient_intelligence.models import (
    EngagementActionStatus,
    IntelligenceFlagStatus,
    PatientEngagementAction,
    PatientIntelligenceContentItem,
    PatientIntelligenceFlag,
    PatientIntelligenceFlagHistory,
    PatientIntelligencePatientSetting,
    PatientIntelligenceRule,
    PatientMetricSnapshot,
)
from app.modules.patient_intelligence.schemas import (
    EngagementActionRead,
    IntelligenceFlagRead,
    MetricSnapshotRead,
    PatientIntelligenceRead,
    TimelineItemRead,
)
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionEnrollmentStatus,
    PatientSubscriptionPlan,
)
from app.modules.patient_subscriptions.services.serialization import (
    free_items_from_json,
    usage_from_json,
)
from app.modules.patients.models import Patient
from app.modules.pharmacy.models import (
    PharmacyIssue,
    PharmacyIssueItem,
    PharmacyIssueStatus,
)
from app.modules.tenants.models import Tenant, now_utc
from app.modules.subscriptions.service import enforce_module_enabled


CALCULATION_VERSION = 2
QUALIFYING_APPOINTMENT_STATUSES = {
    AppointmentStatus.CONSULTATION_COMPLETED,
    AppointmentStatus.BILLED,
}
ENGAGEMENT_OPT_IN_REQUIRED_REASON = (
    "Explicit WhatsApp opt-in is required for intelligence engagement"
)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _utc_sort_datetime(value: datetime | None) -> datetime:
    aware = _aware(value)
    if aware is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    return aware.astimezone(timezone.utc)


def _date_at_utc(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


def _json(value: dict) -> str:
    return json.dumps(value, default=str, separators=(",", ":"))


def _add_one_month(value: date) -> date:
    month = value.month + 1
    year = value.year
    if month > 12:
        month = 1
        year += 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _advance_monthly_date(value: date | None, today: date) -> date | None:
    if not value:
        return None
    next_value = value
    while next_value < today:
        next_value = _add_one_month(next_value)
    return next_value


def _date_as_utc_start(value: date | None) -> datetime | None:
    return datetime.combine(value, time.min, tzinfo=timezone.utc) if value else None


def _humanize_key(value: str | None) -> str:
    return str(value or "").replace("_", " ").replace("-", " ").title()


def _money(value: Decimal | int | float | str | None) -> str:
    amount = Decimal(str(value or "0"))
    return f"₹{amount:,.2f}"


CONTENT_TEMPLATE_KEYS = {"health_tip_patient", "patient_reengagement"}
CONTENT_FALLBACK_CATEGORIES = {"health_tip", "awareness", "general"}


def _content_context_for_flag(
    content_items: list[PatientIntelligenceContentItem],
    *,
    flag_key: str,
    template_key: str,
) -> dict[str, str]:
    if template_key not in CONTENT_TEMPLATE_KEYS:
        return {}
    enabled_items = [item for item in content_items if item.is_enabled]
    selected = next(
        (item for item in enabled_items if item.audience_flag_key == flag_key),
        None,
    )
    if selected is None:
        selected = next(
            (
                item
                for item in enabled_items
                if not item.audience_flag_key
                and item.category in CONTENT_FALLBACK_CATEGORIES
            ),
            None,
        )
    if selected is None:
        return {}
    return {
        "content_key": selected.content_key,
        "content_title": selected.title,
        "content_body": selected.body_text,
        "content_category": _humanize_key(selected.category),
        "content_language": selected.language,
        "health_tip_topic": selected.title,
    }


def list_tenant_rules(
    session: Session, tenant_id: str
) -> list[PatientIntelligenceRule]:
    """Return tenant-owned rules; new tenants intentionally start empty."""
    return session.exec(
        select(PatientIntelligenceRule)
        .where(PatientIntelligenceRule.tenant_id == tenant_id)
        .order_by(PatientIntelligenceRule.priority, PatientIntelligenceRule.rule_key)
    ).all()


def score_summary_for_flags(
    flags: list[PatientIntelligenceFlag],
    rules_by_id: dict[str, PatientIntelligenceRule],
) -> dict[str, Decimal]:
    """Sum tenant-configured scoring weights from currently active flags."""
    summary: dict[str, Decimal] = {
        "value": Decimal("0"),
        "engagement": Decimal("0"),
        "risk": Decimal("0"),
        "loyalty": Decimal("0"),
        "total": Decimal("0"),
    }
    for flag in flags:
        rule = rules_by_id.get(flag.rule_id or "")
        if not rule or not rule.score_dimension:
            continue
        weight = Decimal(rule.score_weight or 0)
        if weight <= 0:
            continue
        summary.setdefault(rule.score_dimension, Decimal("0"))
        summary[rule.score_dimension] += weight
        summary["total"] += weight
    return summary


def _patient_or_404(
    session: Session,
    tenant_id: str,
    patient_id: str,
    *,
    for_update: bool = False,
) -> Patient:
    statement = select(Patient).where(
        Patient.id == patient_id,
        Patient.tenant_id == tenant_id,
    )
    if for_update:
        # A refresh reads and then creates/updates several patient-scoped rows.
        # Serializing on the always-present patient row prevents two requests
        # from both observing a missing flag and inserting the same flag key.
        statement = statement.with_for_update()
    patient = session.exec(statement).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    return patient


def _recurring_medicine(
    session: Session, tenant_id: str, patient_id: str, now: datetime
) -> tuple[str | None, int | None, datetime | None, dict]:
    rows = session.exec(
        select(PharmacyIssueItem, PharmacyIssue)
        .join(PharmacyIssue, PharmacyIssue.id == PharmacyIssueItem.pharmacy_issue_id)
        .where(
            PharmacyIssue.tenant_id == tenant_id,
            PharmacyIssue.patient_id == patient_id,
            PharmacyIssue.status == PharmacyIssueStatus.DISPENSED,
            PharmacyIssueItem.medicine_id.is_not(None),
        )
        .order_by(PharmacyIssue.dispensed_at, PharmacyIssue.created_at)
    ).all()
    dates: dict[str, list[datetime]] = defaultdict(list)
    names: dict[str, str] = {}
    for item, issue in rows:
        occurred = _aware(issue.dispensed_at or issue.created_at)
        if item.medicine_id and occurred:
            dates[item.medicine_id].append(occurred)
            names[item.medicine_id] = item.medicine_name
    candidates = []
    for medicine_id, occurrences in dates.items():
        unique = sorted(set(occurrences))
        # Two observations are the mathematical minimum for an interval. What
        # qualifies as recurring is decided by tenant rules, not here.
        if len(unique) < 2:
            continue
        gaps = [(right - left).days for left, right in zip(unique, unique[1:])]
        interval = int(round(median(gaps)))
        candidates.append(
            (len(unique), unique[-1], medicine_id, interval, unique, gaps)
        )
    if not candidates:
        return None, None, None, {}
    _count, last, medicine_id, interval, occurrences, gaps = max(candidates)
    expected = last + timedelta(days=interval)
    return (
        medicine_id,
        interval,
        expected,
        {
            "medicine_name": names.get(medicine_id, "Regular medicine"),
            "dispense_dates": [value.date().isoformat() for value in occurrences[-6:]],
            "intervals_days": gaps[-5:],
            "occurrence_count": len(occurrences),
            "max_deviation_days": max((abs(gap - interval) for gap in gaps), default=0),
            "expected_refill_at": expected.isoformat(),
            "days_until_expected": (expected - now).days,
        },
    )


def calculate_metrics(
    session: Session, *, tenant_id: str, patient_id: str, now: datetime | None = None
) -> tuple[PatientMetricSnapshot, dict[str, Decimal], list[TimelineItemRead]]:
    patient = _patient_or_404(session, tenant_id, patient_id)
    current = _aware(now or now_utc())
    assert current is not None
    appointments = session.exec(
        select(Appointment).where(
            Appointment.tenant_id == tenant_id, Appointment.patient_id == patient_id
        )
    ).all()
    labs = session.exec(
        select(LabOrder).where(
            LabOrder.tenant_id == tenant_id, LabOrder.patient_id == patient_id
        )
    ).all()
    pharmacy = session.exec(
        select(PharmacyIssue).where(
            PharmacyIssue.tenant_id == tenant_id, PharmacyIssue.patient_id == patient_id
        )
    ).all()
    home_bookings = session.exec(
        select(HomeCareBooking).where(
            HomeCareBooking.tenant_id == tenant_id,
            HomeCareBooking.patient_id == patient_id,
        )
    ).all()
    booking_ids = [row.id for row in home_bookings]
    home_visits = (
        session.exec(
            select(HomeCareVisitLog).where(
                HomeCareVisitLog.tenant_id == tenant_id,
                HomeCareVisitLog.booking_id.in_(booking_ids),
            )
        ).all()
        if booking_ids
        else []
    )
    invoices = session.exec(
        select(Invoice).where(
            Invoice.tenant_id == tenant_id, Invoice.patient_id == patient_id
        )
    ).all()
    invoice_ids = [row.id for row in invoices]
    payments = (
        session.exec(
            select(Payment).where(
                Payment.tenant_id == tenant_id, Payment.invoice_id.in_(invoice_ids)
            )
        ).all()
        if invoice_ids
        else []
    )
    memberships = session.exec(
        select(PatientSubscriptionEnrollment).where(
            PatientSubscriptionEnrollment.tenant_id == tenant_id,
            PatientSubscriptionEnrollment.patient_id == patient_id,
        )
    ).all()
    membership_plan_ids = list({row.plan_id for row in memberships})
    membership_plans = {
        row.id: row
        for row in (
            session.exec(
                select(PatientSubscriptionPlan).where(
                    PatientSubscriptionPlan.tenant_id == tenant_id,
                    PatientSubscriptionPlan.id.in_(membership_plan_ids),
                )
            ).all()
            if membership_plan_ids
            else []
        )
    }

    def net_payment(row: Payment) -> Decimal:
        return max(Decimal("0"), Decimal(row.amount) - Decimal(row.refunded_amount))

    net_30 = sum(
        (
            net_payment(row)
            for row in payments
            if _aware(row.collected_at) >= current - timedelta(days=30)
        ),
        Decimal("0"),
    )
    net_365 = sum(
        (
            net_payment(row)
            for row in payments
            if _aware(row.collected_at) >= current - timedelta(days=365)
        ),
        Decimal("0"),
    )
    lifetime = sum((net_payment(row) for row in payments), Decimal("0"))
    outstanding = sum(
        (
            Decimal(row.balance_amount)
            for row in invoices
            if row.status not in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}
        ),
        Decimal("0"),
    )
    paid_membership_enrollment_ids = {
        row.patient_subscription_enrollment_id
        for row in invoices
        if row.patient_subscription_enrollment_id
        and row.status not in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}
        and Decimal(row.balance_amount) <= Decimal("0")
    }
    active_memberships = [
        row
        for row in memberships
        if row.status == PatientSubscriptionEnrollmentStatus.ACTIVE
        and row.starts_on <= current.date() <= row.ends_on
        and (
            row.id in paid_membership_enrollment_ids
            or row.paid_amount
            >= (
                membership_plans.get(row.plan_id).price_amount
                if membership_plans.get(row.plan_id)
                else 0
            )
        )
    ]
    active_membership = max(
        active_memberships, key=lambda row: row.ends_on, default=None
    )
    active_plan = (
        membership_plans.get(active_membership.plan_id) if active_membership else None
    )
    unused_consultations = (
        max(
            int(active_plan.free_consultations or 0)
            - int(active_membership.used_consultations or 0),
            0,
        )
        if active_membership and active_plan
        else 0
    )
    unused_lab = 0
    unused_medicine = 0
    if active_membership and active_plan:
        free_lab = free_items_from_json(active_plan.free_lab_test_ids_json)
        used_lab = usage_from_json(active_membership.used_free_lab_json)
        unused_lab = sum(
            max(int(limit or 0) - int(used_lab.get(item_id, 0) or 0), 0)
            for item_id, limit in free_lab.items()
        )
        free_medicine = free_items_from_json(active_plan.free_medicine_ids_json)
        used_medicine = usage_from_json(active_membership.used_free_medicine_json)
        unused_medicine = sum(
            max(int(limit or 0) - int(used_medicine.get(item_id, 0) or 0), 0)
            for item_id, limit in free_medicine.items()
        )
    medicine_id, interval, expected_refill, recurrence_evidence = _recurring_medicine(
        session, tenant_id, patient_id, current
    )
    patient_setting = session.exec(
        select(PatientIntelligencePatientSetting).where(
            PatientIntelligencePatientSetting.tenant_id == tenant_id,
            PatientIntelligencePatientSetting.patient_id == patient_id,
        )
    ).first()
    today = current.date()
    monthly_tracking_enabled = bool(patient.monthly_tracking_enabled)
    fallback_refill_on = (
        _aware(patient_setting.manual_expected_refill_at).date()
        if patient_setting
        and patient_setting.manual_expected_refill_at
        and monthly_tracking_enabled
        else None
    )
    fallback_lab_on = (
        _aware(patient_setting.manual_expected_lab_at).date()
        if patient_setting
        and patient_setting.manual_expected_lab_at
        and monthly_tracking_enabled
        else None
    )
    refill_on = (
        _advance_monthly_date(patient.monthly_refill_on or fallback_refill_on, today)
        if monthly_tracking_enabled
        else None
    )
    lab_on = (
        _advance_monthly_date(patient.monthly_lab_on or fallback_lab_on, today)
        if monthly_tracking_enabled
        else None
    )
    patient_tracking_changed = False
    if refill_on != patient.monthly_refill_on:
        patient.monthly_refill_on = refill_on
        patient_tracking_changed = True
    if lab_on != patient.monthly_lab_on:
        patient.monthly_lab_on = lab_on
        patient_tracking_changed = True
    if (
        monthly_tracking_enabled
        and patient_setting
        and patient_setting.notes
        and not patient.monthly_refill_notes
    ):
        patient.monthly_refill_notes = patient_setting.notes
        patient_tracking_changed = True
    if (
        monthly_tracking_enabled
        and patient_setting
        and patient_setting.manual_lab_test_name
        and not patient.monthly_lab_test_name
    ):
        patient.monthly_lab_test_name = patient_setting.manual_lab_test_name
        patient_tracking_changed = True
    if (
        monthly_tracking_enabled
        and patient_setting
        and patient_setting.manual_lab_notes
        and not patient.monthly_lab_notes
    ):
        patient.monthly_lab_notes = patient_setting.manual_lab_notes
        patient_tracking_changed = True
    if patient_tracking_changed:
        patient.updated_at = now_utc()
        session.add(patient)
        session.flush()

    if refill_on:
        expected_refill = _date_as_utc_start(refill_on)
        recurrence_evidence = {
            **recurrence_evidence,
            "manual_expected_refill_at": expected_refill.isoformat(),
            "manual_schedule": True,
            "manual_notes": patient.monthly_refill_notes,
            "days_until_expected": (expected_refill - current).days,
        }
    expected_lab_at = _date_as_utc_start(lab_on)

    activity_dates: list[datetime] = []
    activity_dates.extend(
        _date_at_utc(row.appointment_date)
        for row in appointments
        if row.status in QUALIFYING_APPOINTMENT_STATUSES
    )
    activity_dates.extend(_aware(row.created_at) for row in labs)
    activity_dates.extend(
        _aware(row.dispensed_at or row.created_at) for row in pharmacy
    )
    activity_dates.extend(_date_at_utc(row.visit_date) for row in home_visits)
    activity_dates.extend(_aware(row.created_at) for row in invoices)
    activity_dates = [value for value in activity_dates if value is not None]
    first_activity = min(activity_dates, default=_aware(patient.created_at))
    last_activity = max(activity_dates, default=_aware(patient.created_at))

    snapshot = session.exec(
        select(PatientMetricSnapshot).where(
            PatientMetricSnapshot.tenant_id == tenant_id,
            PatientMetricSnapshot.patient_id == patient_id,
        )
    ).first() or PatientMetricSnapshot(tenant_id=tenant_id, patient_id=patient_id)
    snapshot.first_activity_at = first_activity
    snapshot.last_activity_at = last_activity
    snapshot.completed_visits = sum(
        row.status in QUALIFYING_APPOINTMENT_STATUSES for row in appointments
    )
    snapshot.no_show_count = sum(
        row.status == AppointmentStatus.NO_SHOW for row in appointments
    )
    snapshot.lab_order_count = len(labs)
    snapshot.pharmacy_dispense_count = sum(
        row.status == PharmacyIssueStatus.DISPENSED for row in pharmacy
    )
    snapshot.home_care_visit_count = sum(
        str(row.status).lower() == "completed" for row in home_visits
    )
    snapshot.net_collected_30d = net_30
    snapshot.net_collected_365d = net_365
    snapshot.lifetime_net_collected = lifetime
    snapshot.outstanding_amount = outstanding
    snapshot.active_membership = bool(active_membership)
    snapshot.membership_ends_on = (
        _date_at_utc(active_membership.ends_on) if active_membership else None
    )
    snapshot.expected_refill_at = expected_refill
    snapshot.recurring_medicine_id = medicine_id
    snapshot.recurring_interval_days = interval
    snapshot.evidence_json = _json(
        {
            "recurring_medicine": recurrence_evidence,
            "manual_lab": {
                "expected_lab_at": expected_lab_at.isoformat()
                if expected_lab_at
                else None,
                "lab_test_name": patient.monthly_lab_test_name,
                "notes": patient.monthly_lab_notes,
                "days_until_expected": (expected_lab_at - current).days
                if expected_lab_at
                else None,
            },
            "membership": {
                "active": bool(active_membership),
                "plan_id": active_membership.plan_id if active_membership else None,
                "plan_name": (
                    membership_plans[active_membership.plan_id].name
                    if active_membership
                    and active_membership.plan_id in membership_plans
                    else None
                ),
                "ends_on": active_membership.ends_on.isoformat()
                if active_membership
                else None,
                "paid_amount": active_membership.paid_amount
                if active_membership
                else 0,
                "unused_consultations": unused_consultations,
                "unused_lab_tests": unused_lab,
                "unused_medicines": unused_medicine,
            },
        }
    )
    snapshot.calculated_at = current
    snapshot.calculation_version = CALCULATION_VERSION
    session.add(snapshot)
    session.flush()

    days_since = Decimal((current - last_activity).days if last_activity else 9999)
    membership_days = (
        Decimal((active_membership.ends_on - current.date()).days)
        if active_membership
        else Decimal("9999")
    )
    recurrence_count = Decimal(recurrence_evidence.get("occurrence_count", 0))
    recurrence_deviation = Decimal(recurrence_evidence.get("max_deviation_days", 0))
    days_until_refill = Decimal(recurrence_evidence.get("days_until_expected", 9999))
    days_until_lab = (
        Decimal((expected_lab_at - current).days)
        if expected_lab_at
        else Decimal("9999")
    )
    unused_benefits = Decimal(unused_consultations + unused_lab + unused_medicine)
    values = {
        "net_collected_30d": net_30,
        "net_collected_365d": net_365,
        "lifetime_net_collected": lifetime,
        "outstanding_amount": outstanding,
        "days_since_activity": days_since,
        "completed_visits": Decimal(snapshot.completed_visits),
        "no_show_count": Decimal(snapshot.no_show_count),
        "lab_order_count": Decimal(snapshot.lab_order_count),
        "pharmacy_dispense_count": Decimal(snapshot.pharmacy_dispense_count),
        "home_care_visit_count": Decimal(snapshot.home_care_visit_count),
        "recurring_interval_days": Decimal(interval or 0),
        "recurring_occurrence_count": recurrence_count,
        "recurring_max_deviation_days": recurrence_deviation,
        "days_until_expected_refill": days_until_refill,
        "days_until_expected_lab_test": days_until_lab,
        "active_membership": Decimal(1 if active_membership else 0),
        "membership_days_remaining": membership_days,
        "unused_membership_benefit_count": unused_benefits,
        "unused_free_consultations": Decimal(unused_consultations),
        "unused_free_lab_tests": Decimal(unused_lab),
        "unused_free_medicines": Decimal(unused_medicine),
        "patient_age_days": Decimal(
            max((current - first_activity).days, 0) if first_activity else 0
        ),
    }
    rules = [rule for rule in list_tenant_rules(session, tenant_id) if rule.is_enabled]

    def within_window(value: datetime | None, days: int | None) -> bool:
        occurred = _aware(value)
        return bool(
            occurred and (days is None or occurred >= current - timedelta(days=days))
        )

    for rule in rules:
        window = rule.window_days
        metric = rule.metric_key
        if metric in {"net_collected", "net_collected_30d", "net_collected_365d"}:
            collection_window = (
                30
                if metric == "net_collected_30d" and window is None
                else 365
                if metric == "net_collected_365d" and window is None
                else window
            )
            value = sum(
                (
                    net_payment(payment)
                    for payment in payments
                    if within_window(payment.collected_at, collection_window)
                ),
                Decimal("0"),
            )
        elif metric == "completed_visits":
            value = Decimal(
                sum(
                    row.status in QUALIFYING_APPOINTMENT_STATUSES
                    and within_window(_date_at_utc(row.appointment_date), window)
                    for row in appointments
                )
            )
        elif metric == "no_show_count":
            value = Decimal(
                sum(
                    row.status == AppointmentStatus.NO_SHOW
                    and within_window(_date_at_utc(row.appointment_date), window)
                    for row in appointments
                )
            )
        elif metric == "lab_order_count":
            value = Decimal(sum(within_window(row.created_at, window) for row in labs))
        elif metric == "pharmacy_dispense_count":
            value = Decimal(
                sum(
                    row.status == PharmacyIssueStatus.DISPENSED
                    and within_window(row.dispensed_at or row.created_at, window)
                    for row in pharmacy
                )
            )
        elif metric == "home_care_visit_count":
            value = Decimal(
                sum(
                    str(row.status).lower() == "completed"
                    and within_window(_date_at_utc(row.visit_date), window)
                    for row in home_visits
                )
            )
        else:
            value = values.get(metric, Decimal("0"))
        values[rule.id] = value
    timeline = _timeline(appointments, labs, pharmacy, home_visits, invoices)
    return snapshot, values, timeline


def _timeline(
    appointments, labs, pharmacy, home_visits, invoices
) -> list[TimelineItemRead]:
    items: list[TimelineItemRead] = []
    for row in appointments:
        items.append(
            TimelineItemRead(
                occurred_at=_date_at_utc(row.appointment_date),
                activity_type="appointment",
                source_module="appointments",
                source_id=row.id,
                status=row.status.value,
                title=f"Appointment {row.status.value.replace('_', ' ')}",
            )
        )
    for row in labs:
        items.append(
            TimelineItemRead(
                occurred_at=_aware(row.created_at),
                activity_type="lab_order",
                source_module="lab",
                source_id=row.id,
                status=row.status.value,
                title="Lab order",
                amount=Decimal(row.amount),
            )
        )
    for row in pharmacy:
        items.append(
            TimelineItemRead(
                occurred_at=_aware(row.dispensed_at or row.created_at),
                activity_type="pharmacy_issue",
                source_module="pharmacy",
                source_id=row.id,
                status=row.status.value,
                title="Pharmacy issue",
                amount=Decimal(row.amount),
            )
        )
    for row in home_visits:
        items.append(
            TimelineItemRead(
                occurred_at=_date_at_utc(row.visit_date),
                activity_type="home_care_visit",
                source_module="home_care",
                source_id=row.id,
                status=str(row.status),
                title="Home-care visit",
                amount=Decimal(row.total_amount),
            )
        )
    for row in invoices:
        items.append(
            TimelineItemRead(
                occurred_at=_aware(row.created_at),
                activity_type="invoice",
                source_module="billing",
                source_id=row.id,
                status=row.status.value,
                title=f"Invoice {row.invoice_number}",
                amount=Decimal(row.total_amount),
            )
        )
    return sorted(items, key=lambda item: item.occurred_at, reverse=True)[:100]


def _matches(rule: PatientIntelligenceRule, value: Decimal) -> bool:
    threshold = Decimal(rule.threshold)
    if rule.operator == "gte":
        return value >= threshold
    if rule.operator == "gt":
        return value > threshold
    if rule.operator == "lte":
        return value <= threshold
    if rule.operator == "lt":
        return value < threshold
    if rule.operator == "eq":
        return value == threshold
    if rule.operator == "neq":
        return value != threshold
    if rule.operator == "between":
        if rule.threshold_secondary is None:
            return False
        lower, upper = sorted(
            [Decimal(rule.threshold), Decimal(rule.threshold_secondary)]
        )
        return lower <= value <= upper
    return False


def _explanation(rule: PatientIntelligenceRule, value: Decimal) -> str:
    labels = {
        "net_collected_30d": "Net collections in the last 30 days",
        "days_since_activity": "Days since the last qualifying activity",
        "no_show_count": "Recorded appointment no-shows",
        "recurring_interval_days": "Detected medicine interval in days",
        "refill_due": "Expected regular medicine refill is approaching",
        "active_membership": "A paid membership is currently active",
        "membership_days_remaining": "Membership days remaining",
        "days_until_expected_lab_test": "Days until expected lab test",
        "unused_membership_benefit_count": "Unused membership benefits",
        "unused_free_consultations": "Unused free consultations",
        "unused_free_lab_tests": "Unused free lab tests",
        "unused_free_medicines": "Unused free medicines",
        "high_value_at_risk": "Historical value and inactivity conditions are both met",
    }
    membership_condition = (
        " Active paid membership is also required and was verified."
        if rule.requires_active_membership
        else ""
    )
    threshold = str(rule.threshold)
    if rule.operator == "between" and rule.threshold_secondary is not None:
        threshold = f"{threshold} and {rule.threshold_secondary}"
    return f"{labels.get(rule.metric_key, rule.metric_key)}: {value}; configured rule: {rule.operator} {threshold}.{membership_condition}"


def evaluate_flags(
    session: Session,
    *,
    tenant_id: str,
    patient: Patient,
    metric_values: dict[str, Decimal],
    now: datetime,
) -> list[PatientIntelligenceFlag]:
    rules = [row for row in list_tenant_rules(session, tenant_id) if row.is_enabled]
    rules.sort(key=lambda row: (row.priority, row.rule_key))
    existing = {
        row.flag_key: row
        for row in session.exec(
            select(PatientIntelligenceFlag).where(
                PatientIntelligenceFlag.tenant_id == tenant_id,
                PatientIntelligenceFlag.patient_id == patient.id,
            )
        ).all()
    }

    def flag_rule(flag: PatientIntelligenceFlag) -> PatientIntelligenceRule | None:
        return next((item for item in rules if item.id == flag.rule_id), None)

    def flag_expired(
        flag: PatientIntelligenceFlag,
        rule: PatientIntelligenceRule | None,
    ) -> bool:
        return bool(
            rule
            and rule.expires_after_days
            and _aware(flag.last_detected_at)
            and now
            > _aware(flag.last_detected_at) + timedelta(days=rule.expires_after_days)
        )

    retained_group_owner: dict[str, str] = {}
    for flag in sorted(
        existing.values(),
        key=lambda item: (
            flag_rule(item).priority if flag_rule(item) else 10000,
            item.flag_key,
        ),
    ):
        rule = flag_rule(flag)
        if (
            rule
            and rule.exclusive_group
            and not rule.auto_resolve
            and not flag_expired(flag, rule)
            and flag.status
            not in {IntelligenceFlagStatus.RESOLVED, IntelligenceFlagStatus.CLOSED}
        ):
            retained_group_owner.setdefault(rule.exclusive_group, flag.flag_key)

    matched: set[str] = set()
    matched_exclusive_groups: dict[str, str] = {}
    for rule in rules:
        # Tenant configuration may contain legacy rules that share a flag key.
        # The first matching rule by priority owns that patient flag.
        if rule.flag_key in matched:
            continue
        value = metric_values.get(
            rule.id, metric_values.get(rule.metric_key, Decimal("0"))
        )
        required_flags = set(rule.required_flag_keys)
        rule_matches = (
            _matches(rule, value)
            and (
                not rule.requires_active_membership
                or metric_values.get("active_membership", Decimal("0")) == Decimal("1")
            )
            and required_flags.issubset(matched)
        )
        if rule.exclusive_group and rule_matches:
            retained_owner = retained_group_owner.get(rule.exclusive_group)
            matched_owner = matched_exclusive_groups.get(rule.exclusive_group)
            rule_matches = matched_owner is None and (
                retained_owner is None or retained_owner == rule.flag_key
            )
        if not rule_matches:
            continue
        matched.add(rule.flag_key)
        if rule.exclusive_group:
            matched_exclusive_groups[rule.exclusive_group] = rule.flag_key
        explanation = _explanation(rule, value)
        evidence = _json(
            {
                "metric": rule.metric_key,
                "window_days": rule.window_days,
                "value": str(value),
                "threshold": str(rule.threshold),
                "threshold_secondary": str(rule.threshold_secondary)
                if rule.threshold_secondary is not None
                else None,
                "operator": rule.operator,
                "required_flag_keys": rule.required_flag_keys,
                "requires_active_membership": rule.requires_active_membership,
                "active_membership": metric_values.get(
                    "active_membership", Decimal("0")
                )
                == Decimal("1"),
                "rule_version": rule.version,
            }
        )
        flag = existing.get(rule.flag_key)
        created = flag is None
        if not flag:
            flag = PatientIntelligenceFlag(
                tenant_id=tenant_id,
                branch_id=patient.branch_id,
                patient_id=patient.id,
                rule_id=rule.id,
                flag_key=rule.flag_key,
                category=rule.category,
                severity=rule.severity,
                explanation=explanation,
                evidence_json=evidence,
                first_detected_at=now,
                last_detected_at=now,
            )
        else:
            was_resolved = flag.status in {
                IntelligenceFlagStatus.RESOLVED,
                IntelligenceFlagStatus.CLOSED,
            }
            flag.status = IntelligenceFlagStatus.OPEN if was_resolved else flag.status
            flag.resolved_at = None if was_resolved else flag.resolved_at
            flag.last_detected_at = now
            flag.rule_id = rule.id
            flag.severity = rule.severity
            flag.explanation = explanation
            flag.evidence_json = evidence
            flag.updated_at = now
        session.add(flag)
        session.flush()
        existing[rule.flag_key] = flag
        if (
            created
            or flag.status == IntelligenceFlagStatus.OPEN
            and flag.resolved_at is None
            and flag.last_detected_at == now
        ):
            if created:
                session.add(
                    PatientIntelligenceFlagHistory(
                        tenant_id=tenant_id,
                        patient_id=patient.id,
                        flag_id=flag.id,
                        to_status="open",
                        reason=explanation,
                        evidence_json=evidence,
                    )
                )
    for key, flag in existing.items():
        if key in matched or flag.status in {
            IntelligenceFlagStatus.RESOLVED,
            IntelligenceFlagStatus.CLOSED,
        }:
            continue
        rule = flag_rule(flag) or next(
            (item for item in rules if item.flag_key == key),
            None,
        )
        expired = flag_expired(flag, rule)
        exclusive_owner = (
            matched_exclusive_groups.get(rule.exclusive_group)
            or retained_group_owner.get(rule.exclusive_group)
            if rule and rule.exclusive_group
            else None
        )
        blocked_by_higher_tier = bool(exclusive_owner and exclusive_owner != key)
        if (
            rule
            and not rule.auto_resolve
            and not expired
            and not blocked_by_higher_tier
        ):
            continue
        previous = flag.status.value
        flag.status = IntelligenceFlagStatus.RESOLVED
        flag.resolved_at = now
        flag.updated_at = now
        session.add(flag)
        reason = (
            "The configured flag lifetime expired."
            if expired
            else "The latest calculation no longer meets the configured rule."
        )
        session.add(
            PatientIntelligenceFlagHistory(
                tenant_id=tenant_id,
                patient_id=patient.id,
                flag_id=flag.id,
                from_status=previous,
                to_status="resolved",
                reason=reason,
                evidence_json=flag.evidence_json,
            )
        )
    session.flush()
    return session.exec(
        select(PatientIntelligenceFlag).where(
            PatientIntelligenceFlag.tenant_id == tenant_id,
            PatientIntelligenceFlag.patient_id == patient.id,
            PatientIntelligenceFlag.status.notin_(
                [IntelligenceFlagStatus.RESOLVED, IntelligenceFlagStatus.CLOSED]
            ),
        )
    ).all()


def recommend_actions(
    session: Session,
    *,
    tenant_id: str,
    patient: Patient,
    flags: list[PatientIntelligenceFlag],
    snapshot: PatientMetricSnapshot,
    now: datetime,
) -> list[PatientEngagementAction]:
    existing = {
        row.dedupe_key: row
        for row in session.exec(
            select(PatientEngagementAction).where(
                PatientEngagementAction.tenant_id == tenant_id,
                PatientEngagementAction.patient_id == patient.id,
            )
        ).all()
    }
    rules_by_id = {rule.id: rule for rule in list_tenant_rules(session, tenant_id)}
    tenant = session.get(Tenant, tenant_id)
    memberships = session.exec(
        select(PatientSubscriptionEnrollment).where(
            PatientSubscriptionEnrollment.tenant_id == tenant_id,
            PatientSubscriptionEnrollment.patient_id == patient.id,
        )
    ).all()
    active_membership = max(
        (
            row
            for row in memberships
            if row.status == PatientSubscriptionEnrollmentStatus.ACTIVE
        ),
        key=lambda row: row.ends_on,
        default=None,
    )
    membership_plan = (
        session.get(PatientSubscriptionPlan, active_membership.plan_id)
        if active_membership
        else None
    )
    membership_invoice = (
        session.get(Invoice, active_membership.purchase_invoice_id)
        if active_membership and active_membership.purchase_invoice_id
        else None
    )
    latest_pharmacy_issue = session.exec(
        select(PharmacyIssue)
        .where(
            PharmacyIssue.tenant_id == tenant_id,
            PharmacyIssue.patient_id == patient.id,
        )
        .order_by(PharmacyIssue.created_at.desc())
    ).first()
    latest_lab_order = session.exec(
        select(LabOrder)
        .where(
            LabOrder.tenant_id == tenant_id,
            LabOrder.patient_id == patient.id,
        )
        .order_by(LabOrder.created_at.desc())
    ).first()
    latest_lab_item_names: list[str] = []
    if latest_lab_order:
        latest_lab_item_names = [
            item.test_name
            for item in session.exec(
                select(LabOrderItem)
                .where(
                    LabOrderItem.tenant_id == tenant_id,
                    LabOrderItem.lab_order_id == latest_lab_order.id,
                )
                .order_by(LabOrderItem.created_at)
            ).all()
        ]
    content_items = session.exec(
        select(PatientIntelligenceContentItem)
        .where(
            PatientIntelligenceContentItem.tenant_id == tenant_id,
            PatientIntelligenceContentItem.is_enabled.is_(True),
        )
        .order_by(
            PatientIntelligenceContentItem.priority,
            PatientIntelligenceContentItem.title,
        )
    ).all()
    try:
        snapshot_evidence = json.loads(snapshot.evidence_json or "{}")
    except (TypeError, ValueError):
        snapshot_evidence = {}
    manual_lab = snapshot_evidence.get("manual_lab") or {}
    membership_evidence = snapshot_evidence.get("membership") or {}
    unused_consultations = int(membership_evidence.get("unused_consultations") or 0)
    unused_lab_tests = int(membership_evidence.get("unused_lab_tests") or 0)
    unused_medicines = int(membership_evidence.get("unused_medicines") or 0)
    unused_benefits_summary = (
        f"Consultations: {unused_consultations}, "
        f"Lab tests: {unused_lab_tests}, Medicines: {unused_medicines}"
    )
    days_since_activity = (
        max((now - _aware(snapshot.last_activity_at)).days, 0)
        if snapshot.last_activity_at
        else 0
    )
    for flag in flags:
        rule = rules_by_id.get(flag.rule_id or "")
        if not rule or not rule.action_enabled:
            continue
        if (
            not rule.action_key
            or not rule.action_template_key
            or not rule.action_channel
        ):
            continue
        values = {
            **build_entity_context(
                rule.action_template_key,
                {
                    "patient": patient,
                    "clinic": tenant,
                    "intelligence": snapshot,
                    "membership": active_membership,
                    "membership_plan": membership_plan,
                    "invoice": membership_invoice,
                    "pharmacy_issue": latest_pharmacy_issue,
                    "lab_order": latest_lab_order,
                },
            ),
            "recipient_name": patient.full_name,
            "clinic_name": tenant.name if tenant else "",
            "action_key": rule.action_key,
            "action_channel": rule.action_channel,
            "action_template_key": rule.action_template_key,
            "action_status": EngagementActionStatus.RECOMMENDED.value,
            "action_reason": f"Configured action for {rule.name}",
            "engagement_segment": rule.name,
            "flag_label": rule.badge_label or _humanize_key(flag.flag_key),
            "flag_key_label": _humanize_key(flag.flag_key),
            "flag_reason": flag.explanation,
            "last_activity_date": snapshot.last_activity_at.strftime("%d %B %Y")
            if snapshot.last_activity_at
            else "",
            "days_since_activity": str(days_since_activity),
            "completed_visits": str(snapshot.completed_visits),
            "no_show_count": str(snapshot.no_show_count),
            "lab_order_count": str(snapshot.lab_order_count),
            "pharmacy_dispense_count": str(snapshot.pharmacy_dispense_count),
            "home_care_visit_count": str(snapshot.home_care_visit_count),
            "thirty_day_collected": _money(snapshot.net_collected_30d),
            "annual_collected": _money(snapshot.net_collected_365d),
            "lifetime_collected": _money(snapshot.lifetime_net_collected),
            "outstanding_amount": _money(snapshot.outstanding_amount),
            "membership_plan_name": membership_plan.name if membership_plan else "",
            "health_tip_topic": rule.name,
            "lab_test_name": manual_lab.get("lab_test_name")
            or ", ".join(latest_lab_item_names),
            "lab_notes": manual_lab.get("notes") or "",
            "unused_consultations": str(unused_consultations),
            "unused_lab_tests": str(unused_lab_tests),
            "unused_medicines": str(unused_medicines),
            "unused_benefits_summary": unused_benefits_summary,
        }
        values.update(
            _content_context_for_flag(
                content_items,
                flag_key=flag.flag_key,
                template_key=rule.action_template_key,
            )
        )
        if snapshot.expected_refill_at:
            values["expected_date"] = snapshot.expected_refill_at.strftime("%d %B %Y")
            values["refill_date"] = values["expected_date"]
        if manual_lab.get("expected_lab_at"):
            lab_date = _aware(datetime.fromisoformat(manual_lab["expected_lab_at"]))
            values["lab_due_date"] = lab_date.strftime("%d %B %Y") if lab_date else ""
        if snapshot.membership_ends_on:
            values["expiry_date"] = snapshot.membership_ends_on.strftime("%d %B %Y")
            values["days_remaining"] = str(
                max((snapshot.membership_ends_on.date() - now.date()).days, 0)
            )
        if rule.action_cooldown_days:
            period = str(now.date().toordinal() // rule.action_cooldown_days)
        else:
            period = flag.first_detected_at.date().isoformat()
        action_key = rule.action_key
        dedupe = f"patient-intelligence:{action_key}:{patient.id}:{period}"
        if dedupe in existing:
            action = existing[dedupe]
            whatsapp_allowed = (
                rule.action_channel != "whatsapp"
                or patient_allows_engagement_whatsapp(patient)
            )
            action.source_flag_id = flag.id
            action.template_key = rule.action_template_key
            action.channel = rule.action_channel
            action.requires_approval = rule.action_requires_approval
            action.personalization_json = _json(values)
            if (
                action.status == EngagementActionStatus.SUPPRESSED
                and action.reason == ENGAGEMENT_OPT_IN_REQUIRED_REASON
                and whatsapp_allowed
            ):
                action.status = EngagementActionStatus.RECOMMENDED
                action.reason = f"Configured action for {rule.name}"
                action.updated_at = now
            elif (
                action.status
                in {
                    EngagementActionStatus.CANCELLED,
                    EngagementActionStatus.SUPPRESSED,
                }
                and whatsapp_allowed
            ):
                action.status = EngagementActionStatus.RECOMMENDED
                action.reason = f"Configured action for {rule.name}"
                action.notification_event_id = None
                action.updated_at = now
            elif (
                action.status == EngagementActionStatus.CANCELLED
                and not whatsapp_allowed
            ):
                action.status = EngagementActionStatus.SUPPRESSED
                action.reason = ENGAGEMENT_OPT_IN_REQUIRED_REASON
                action.notification_event_id = None
                action.updated_at = now
            session.add(action)
            continue
        action = PatientEngagementAction(
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            patient_id=patient.id,
            source_flag_id=flag.id,
            action_key=action_key,
            channel=rule.action_channel,
            template_key=rule.action_template_key,
            status=(
                EngagementActionStatus.RECOMMENDED
                if rule.action_channel != "whatsapp"
                or patient_allows_engagement_whatsapp(patient)
                else EngagementActionStatus.SUPPRESSED
            ),
            requires_approval=rule.action_requires_approval,
            personalization_json=_json(values),
            reason=(
                f"Configured action for {rule.name}"
                if rule.action_channel != "whatsapp"
                or patient_allows_engagement_whatsapp(patient)
                else ENGAGEMENT_OPT_IN_REQUIRED_REASON
            ),
            dedupe_key=dedupe,
        )
        session.add(action)
        existing[dedupe] = action
    active_flag_ids = {flag.id for flag in flags}
    for action in existing.values():
        if (
            action.source_flag_id
            and action.source_flag_id not in active_flag_ids
            and action.status
            in {EngagementActionStatus.RECOMMENDED, EngagementActionStatus.APPROVED}
        ):
            action.status = EngagementActionStatus.CANCELLED
            action.reason = "The source flag is no longer active"
            action.updated_at = now
            session.add(action)
    session.flush()
    return sorted(
        existing.values(),
        key=lambda row: _utc_sort_datetime(row.created_at),
        reverse=True,
    )


def queue_automatic_engagement_actions(
    session: Session,
    *,
    tenant_id: str,
    patient: Patient,
    actions: list[PatientEngagementAction],
) -> None:
    """Queue configured no-approval actions; rule timing and templates stay tenant-owned."""
    from app.modules.notifications.services.events import (
        queue_whatsapp_template_if_allowed,
    )

    for action in actions:
        if (
            action.status != EngagementActionStatus.RECOMMENDED
            or action.requires_approval
            or action.channel != "whatsapp"
        ):
            continue
        if not patient_allows_engagement_whatsapp(patient):
            action.status = EngagementActionStatus.SUPPRESSED
            action.reason = ENGAGEMENT_OPT_IN_REQUIRED_REASON
            action.updated_at = now_utc()
            session.add(action)
            continue
        event = queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=action.branch_id,
            flow_key=action.template_key,
            recipient=patient.mobile,
            resource_type="patient_engagement_action",
            resource_id=action.id,
            dedupe_key=f"whatsapp:{action.dedupe_key}",
        )
        if not event:
            continue
        action.status = EngagementActionStatus.QUEUED
        action.notification_event_id = event.id
        action.updated_at = now_utc()
        session.add(action)


def refresh_patient_intelligence(
    session: Session, *, tenant_id: str, patient_id: str
) -> PatientIntelligenceRead:
    patient = _patient_or_404(session, tenant_id, patient_id, for_update=True)
    now = _aware(now_utc())
    assert now is not None
    snapshot, values, timeline = calculate_metrics(
        session, tenant_id=tenant_id, patient_id=patient_id, now=now
    )
    flags = evaluate_flags(
        session, tenant_id=tenant_id, patient=patient, metric_values=values, now=now
    )
    actions = recommend_actions(
        session,
        tenant_id=tenant_id,
        patient=patient,
        flags=flags,
        snapshot=snapshot,
        now=now,
    )
    queue_automatic_engagement_actions(
        session,
        tenant_id=tenant_id,
        patient=patient,
        actions=actions,
    )
    rules_by_id = {rule.id: rule for rule in list_tenant_rules(session, tenant_id)}
    badge_rules = sorted(
        (
            rules_by_id[flag.rule_id]
            for flag in flags
            if flag.rule_id in rules_by_id
            and rules_by_id[flag.rule_id].display_as_patient_badge
        ),
        key=lambda rule: (rule.priority, rule.rule_key),
    )
    session.commit()
    session.refresh(snapshot)
    return PatientIntelligenceRead(
        patient_id=patient.id,
        current_tier=(badge_rules[0].badge_label if badge_rules else None),
        score_summary=score_summary_for_flags(flags, rules_by_id),
        manual_expected_refill_at=_date_as_utc_start(patient.monthly_refill_on)
        if patient.monthly_tracking_enabled
        else None,
        manual_refill_notes=patient.monthly_refill_notes
        if patient.monthly_tracking_enabled
        else None,
        manual_expected_lab_at=_date_as_utc_start(patient.monthly_lab_on)
        if patient.monthly_tracking_enabled
        else None,
        manual_lab_test_name=patient.monthly_lab_test_name
        if patient.monthly_tracking_enabled
        else None,
        manual_lab_notes=patient.monthly_lab_notes
        if patient.monthly_tracking_enabled
        else None,
        metrics=MetricSnapshotRead.model_validate(snapshot, from_attributes=True),
        flags=[
            IntelligenceFlagRead(
                id=flag.id,
                flag_key=flag.flag_key,
                category=flag.category.value,
                severity=flag.severity,
                status=flag.status.value,
                explanation=flag.explanation,
                evidence=json.loads(flag.evidence_json or "{}"),
                first_detected_at=flag.first_detected_at,
                last_detected_at=flag.last_detected_at,
                resolved_at=flag.resolved_at,
                label=rules_by_id[flag.rule_id].badge_label
                if flag.rule_id in rules_by_id
                and rules_by_id[flag.rule_id].display_as_patient_badge
                else None,
                background_color=rules_by_id[flag.rule_id].badge_background_color
                if flag.rule_id in rules_by_id
                else None,
                text_color=rules_by_id[flag.rule_id].badge_text_color
                if flag.rule_id in rules_by_id
                else None,
                border_color=rules_by_id[flag.rule_id].badge_border_color
                if flag.rule_id in rules_by_id
                else None,
                priority=rules_by_id[flag.rule_id].priority
                if flag.rule_id in rules_by_id
                else None,
            )
            for flag in flags
        ],
        timeline=timeline,
        engagement_actions=[
            EngagementActionRead(
                id=row.id,
                action_key=row.action_key,
                template_key=row.template_key,
                status=row.status.value,
                requires_approval=row.requires_approval,
                personalization=json.loads(row.personalization_json or "{}"),
                reason=row.reason,
                notification_event_id=row.notification_event_id,
                created_at=row.created_at,
            )
            for row in actions
        ],
    )


def refresh_tenant_existing_data(
    session: Session, *, tenant_id: str, limit: int = 500, offset: int = 0
) -> int:
    patient_ids = session.exec(
        select(Patient.id)
        .where(Patient.tenant_id == tenant_id)
        .order_by(Patient.id)
        .offset(offset)
        .limit(limit)
    ).all()
    for patient_id in patient_ids:
        refresh_patient_intelligence(
            session, tenant_id=tenant_id, patient_id=patient_id
        )
    return len(patient_ids)


def invalidate_tenant_intelligence(session: Session, *, tenant_id: str) -> int:
    """Mark existing projections stale after tenant configuration changes."""
    snapshots = session.exec(
        select(PatientMetricSnapshot).where(
            PatientMetricSnapshot.tenant_id == tenant_id,
            PatientMetricSnapshot.calculation_version == CALCULATION_VERSION,
        )
    ).all()
    for snapshot in snapshots:
        snapshot.calculation_version = 0
        session.add(snapshot)
    session.flush()
    return len(snapshots)


def refresh_due_patient_intelligence(
    session: Session, *, limit: int = 100, now: datetime | None = None
) -> int:
    """Incrementally refresh stale existing-data projections for entitled tenants."""
    current = _aware(now or now_utc())
    assert current is not None
    cutoff = current - timedelta(hours=24)
    candidates = session.exec(
        select(Patient)
        .outerjoin(
            PatientMetricSnapshot,
            (PatientMetricSnapshot.tenant_id == Patient.tenant_id)
            & (PatientMetricSnapshot.patient_id == Patient.id),
        )
        .where(
            (PatientMetricSnapshot.id.is_(None))
            | (PatientMetricSnapshot.calculated_at < cutoff)
            | (PatientMetricSnapshot.calculation_version != CALCULATION_VERSION)
        )
        .order_by(PatientMetricSnapshot.calculated_at, Patient.id)
        .limit(max(limit * 5, limit))
    ).all()
    entitlement_cache: dict[str, bool] = {}
    processed = 0
    for patient in candidates:
        enabled = entitlement_cache.get(patient.tenant_id)
        if enabled is None:
            try:
                enforce_module_enabled(
                    session, patient.tenant_id, "patient_intelligence"
                )
                enabled = True
            except HTTPException:
                enabled = False
            entitlement_cache[patient.tenant_id] = enabled
        if not enabled:
            continue
        refresh_patient_intelligence(
            session, tenant_id=patient.tenant_id, patient_id=patient.id
        )
        processed += 1
        if processed >= limit:
            break
    return processed
