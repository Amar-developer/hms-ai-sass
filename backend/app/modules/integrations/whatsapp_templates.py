from app.modules.integrations.whatsapp_schemas import (
    WhatsAppLanguage,
    WhatsAppTemplateSettings,
)


DEFAULT_WHATSAPP_LANGUAGE: WhatsAppLanguage = "en"


def resolve_template_identifier(
    config: dict,
    *,
    flow_key: str,
    preferred_language: str | None = None,
) -> tuple[str, str]:
    """Resolve an approved identifier, falling back to the tenant default."""
    default_language = str(config.get("default_language") or DEFAULT_WHATSAPP_LANGUAGE)
    requested_language = str(preferred_language or default_language)
    default_templates = WhatsAppTemplateSettings.model_validate(
        config.get("templates") or {}
    )
    default_identifier = getattr(default_templates, flow_key, "").strip()

    if requested_language != default_language:
        localized = config.get("localized_templates") or {}
        language_templates = WhatsAppTemplateSettings.model_validate(
            localized.get(requested_language) or {}
        )
        localized_identifier = getattr(language_templates, flow_key, "").strip()
        if localized_identifier:
            return localized_identifier, requested_language

    return default_identifier, default_language
