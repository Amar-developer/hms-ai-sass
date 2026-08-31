import math
from dataclasses import dataclass
from hashlib import sha256

from app.infrastructure.integrations.ports.sms import SmsTemplateReference
from app.modules.integrations.sms_schemas import SmsFlowReadiness, SmsSettingsUpdate


SMS_VARIABLE_PLACEHOLDER = "{#var#}"
GSM_SINGLE_SEGMENT_LIMIT = 160
GSM_MULTI_SEGMENT_LIMIT = 153
UNICODE_SINGLE_SEGMENT_LIMIT = 70
UNICODE_MULTI_SEGMENT_LIMIT = 67

GSM_7_BASIC_CHARS = (
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ"
    "\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
GSM_7_EXTENDED_CHARS = "^{}\\[~]|€"


@dataclass(frozen=True)
class SmsSegmentEstimate:
    encoding: str
    characters: int
    segments: int


@dataclass(frozen=True)
class ResolvedSmsTemplate:
    template: SmsTemplateReference
    body: str
    body_hash: str
    segment_estimate: SmsSegmentEstimate
    variable_values: list[str]


def _gsm_character_count(value: str) -> int | None:
    count = 0
    for character in value:
        if character in GSM_7_BASIC_CHARS:
            count += 1
        elif character in GSM_7_EXTENDED_CHARS:
            count += 2
        else:
            return None
    return count


def estimate_sms_segments(value: str) -> SmsSegmentEstimate:
    gsm_count = _gsm_character_count(value)
    if gsm_count is not None:
        limit = (
            GSM_SINGLE_SEGMENT_LIMIT
            if gsm_count <= GSM_SINGLE_SEGMENT_LIMIT
            else GSM_MULTI_SEGMENT_LIMIT
        )
        return SmsSegmentEstimate(
            encoding="gsm7",
            characters=gsm_count,
            segments=max(1, math.ceil(gsm_count / limit)),
        )
    characters = len(value)
    limit = (
        UNICODE_SINGLE_SEGMENT_LIMIT
        if characters <= UNICODE_SINGLE_SEGMENT_LIMIT
        else UNICODE_MULTI_SEGMENT_LIMIT
    )
    return SmsSegmentEstimate(
        encoding="unicode",
        characters=characters,
        segments=max(1, math.ceil(characters / limit)),
    )


def _flow_by_key(
    settings: SmsSettingsUpdate, flow_key: str, language: str = "en"
) -> SmsFlowReadiness:
    """The one enabled template for this event, in the best available language.

    A tenant may keep several templates registered per flow_key (an
    alternate DLT resubmission, a retired wording, a different language) but
    only one may be enabled per (flow_key, language) - schema validation
    guarantees that. Preference order: the requested language, then English,
    then whatever else is enabled for this event rather than sending
    nothing because the patient's language has no live template.
    """
    enabled = [
        flow for flow in settings.flows if flow.flow_key == flow_key and flow.enabled
    ]
    for candidate_language in (language, "en"):
        for flow in enabled:
            if flow.language == candidate_language:
                return flow
    if enabled:
        return enabled[0]
    raise ValueError(f"SMS flow {flow_key} is not configured")


def render_sms_template(
    registered_body: str, variable_keys: list[str], values: dict[str, object]
) -> tuple[str, list[str]]:
    placeholder_count = registered_body.count(SMS_VARIABLE_PLACEHOLDER)
    if placeholder_count != len(variable_keys):
        raise ValueError(
            "SMS template variable mapping must match registered DLT placeholders"
        )
    body = registered_body
    rendered_values: list[str] = []
    for key in variable_keys:
        value = str(values.get(key) or "").strip()
        if not value:
            raise ValueError(f"SMS template value is missing for {key}")
        rendered_values.append(value)
        body = body.replace(SMS_VARIABLE_PLACEHOLDER, value, 1)
    return body, rendered_values


def resolve_sms_template(
    settings: SmsSettingsUpdate,
    *,
    flow_key: str,
    values: dict[str, object],
    language: str = "en",
) -> ResolvedSmsTemplate:
    flow = _flow_by_key(settings, flow_key, language)
    body, variable_values = render_sms_template(
        flow.registered_body,
        flow.variable_keys,
        values,
    )
    estimate = estimate_sms_segments(body)
    if estimate.segments > settings.max_segments_per_message:
        raise ValueError(
            f"SMS template {flow_key} renders to {estimate.segments} segment(s), "
            f"above the configured limit of {settings.max_segments_per_message}"
        )
    return ResolvedSmsTemplate(
        template=SmsTemplateReference(
            flow_key=flow.flow_key,
            dlt_entity_id=settings.dlt_entity_id,
            dlt_template_id=flow.dlt_template_id,
            sender_id=settings.default_sender_id,
            classification=flow.classification,
            language=flow.language,
        ),
        body=body,
        body_hash=sha256(body.encode("utf-8")).hexdigest(),
        segment_estimate=estimate,
        variable_values=variable_values,
    )
