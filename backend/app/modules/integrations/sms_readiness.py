from app.modules.integrations.sms_schemas import (
    SmsReadinessCheck,
    SmsReadinessRead,
    SmsReadinessUpdate,
)


P0_SMS_FLOWS = {
    "appointment_booked_patient",
    "appointment_reminder_patient",
    "appointment_rescheduled_patient",
    "appointment_cancelled_patient",
    "queue_token_alert_patient",
    "payment_pending_patient",
    "lab_report_ready_patient",
    "follow_up_reminder_patient",
}


def _check(key: str, label: str, status: str, message: str) -> SmsReadinessCheck:
    return SmsReadinessCheck(key=key, label=label, status=status, message=message)


def evaluate_sms_readiness(settings: SmsReadinessUpdate) -> SmsReadinessRead:
    checks: list[SmsReadinessCheck] = []
    checks.append(
        _check(
            "smscountry_account",
            "SMSCountry account",
            "pass" if settings.account_confirmed else "block",
            "Licensed SMSCountry account details are confirmed."
            if settings.account_confirmed
            else "Confirm the licensed SMSCountry account before implementation.",
        )
    )
    checks.append(
        _check(
            "api_contract",
            "API contract",
            "pass" if settings.sms_country_api_mode != "unknown" else "block",
            f"SMSCountry {settings.sms_country_api_mode} API is selected."
            if settings.sms_country_api_mode != "unknown"
            else "Confirm whether the account uses REST API or legacy HTTP API.",
        )
    )
    checks.append(
        _check(
            "dpa_and_retention",
            "DPA and retention",
            "pass" if settings.dpa_confirmed and settings.retention_days else "block",
            f"DPA is confirmed and retention is {settings.retention_days} days."
            if settings.dpa_confirmed and settings.retention_days
            else "Confirm provider DPA and message metadata retention period.",
        )
    )
    checks.append(
        _check(
            "pricing_and_limits",
            "Pricing and limits",
            "pass"
            if settings.pricing_confirmed and settings.throughput_limit_per_minute
            else "block",
            "Pricing and throughput limits are documented."
            if settings.pricing_confirmed and settings.throughput_limit_per_minute
            else "Confirm pricing, balance behavior, and throughput limits.",
        )
    )
    checks.append(
        _check(
            "dlt_identity",
            "DLT identity",
            "pass"
            if settings.dlt_entity_id and settings.default_sender_id
            else "block",
            "DLT entity ID and sender header are recorded."
            if settings.dlt_entity_id and settings.default_sender_id
            else "Record DLT entity ID and approved sender header.",
        )
    )
    checks.append(
        _check(
            "delivery_receipts",
            "Delivery receipts",
            "pass"
            if settings.delivery_receipts_confirmed
            and settings.callback_contract_confirmed
            else "block",
            "Delivery receipt and callback contract are confirmed."
            if settings.delivery_receipts_confirmed
            and settings.callback_contract_confirmed
            else "Confirm delivery receipt states and callback verification contract.",
        )
    )

    enabled_flows = [flow for flow in settings.flows if flow.enabled]
    p0_ready = {
        flow.flow_key
        for flow in enabled_flows
        if flow.approved_by_provider
        and flow.dlt_template_id
        and flow.registered_body
        and flow.classification != "promotional"
    }
    missing_p0 = sorted(P0_SMS_FLOWS - p0_ready)
    checks.append(
        _check(
            "p0_templates",
            "P0 templates",
            "pass" if not missing_p0 else "block",
            "All P0 SMS flows have approved DLT templates."
            if not missing_p0
            else f"Missing approved templates for: {', '.join(missing_p0)}.",
        )
    )

    checks.append(
        _check(
            "static_ip_allowlisting",
            "IP allowlisting",
            "pass" if settings.static_ip_allowlisting_confirmed else "warning",
            "Static-IP allowlisting is confirmed or not required."
            if settings.static_ip_allowlisting_confirmed
            else "Confirm whether SMSCountry requires static-IP allowlisting.",
        )
    )

    blockers = sum(check.status == "block" for check in checks)
    warnings = sum(check.status == "warning" for check in checks)
    return SmsReadinessRead(
        **settings.model_dump(),
        status="not_ready" if blockers else "attention" if warnings else "ready",
        passed=sum(check.status == "pass" for check in checks),
        warnings=warnings,
        blockers=blockers,
        checks=checks,
    )
