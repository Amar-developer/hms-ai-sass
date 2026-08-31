import {
  flowOptions,
  initialDraft,
  newTemplateDraft,
} from "./constants";
import {
  SmsConsentBasis,
  SmsCountryApiMode,
  SmsFlowKey,
  SmsLanguage,
  SmsMessageClassification,
  SmsSettingsDraft,
  SmsTemplateDraft,
} from "./types";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numberText(value: unknown): string {
  return value === null || value === undefined || value === ""
    ? ""
    : String(value);
}

/** Blank optional numbers must be sent as null - the backend rejects "" and 0. */
function optionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

/** Blank secrets must be sent as null so the backend keeps the stored value. */
function optionalSecret(value: string): string | null {
  return value.trim() || null;
}

export function readTemplateDraft(raw: any): SmsTemplateDraft {
  const flowKey = raw.flow_key as SmsFlowKey;
  const base = newTemplateDraft(flowKey);
  return {
    id: text(raw.id) || base.id,
    flowKey,
    name: text(raw.name),
    language: (raw.language || "en") as SmsLanguage,
    enabled: Boolean(raw.enabled),
    classification: (raw.classification ||
      base.classification) as SmsMessageClassification,
    consentBasis: (raw.consent_basis || base.consentBasis) as SmsConsentBasis,
    dltTemplateId: text(raw.dlt_template_id),
    registeredBody: text(raw.registered_body),
    variableKeys: Array.isArray(raw.variable_keys)
      ? raw.variable_keys
          .map(text)
          .filter(Boolean)
      : [],
    approvedByProvider: Boolean(raw.approved_by_provider),
  };
}

export function readDraft(value: any): SmsSettingsDraft {
  if (!value) return initialDraft;
  const savedFlows: any[] = Array.isArray(value.flows) ? value.flows : [];
  const savedTemplates = savedFlows.map(readTemplateDraft);
  return {
    enabled: Boolean(value.enabled),
    apiMode: (value.sms_country_api_mode || "unknown") as SmsCountryApiMode,
    apiUrl: text(value.api_url),
    // Credentials are write-only: the backend never returns them, and a blank
    // field is sent as null so the stored secret is kept.
    apiKey: "",
    apiToken: "",
    username: "",
    password: "",
    webhookSecret: "",
    defaultCountryCode: text(value.default_country_code) || "+91",
    timeoutSeconds: Number(value.timeout_seconds ?? 15),
    maxAttempts: Number(value.max_attempts ?? 5),
    maxSegmentsPerMessage: Number(value.max_segments_per_message ?? 3),
    dailyMessageLimit: numberText(value.daily_message_limit),
    monthlySegmentLimit: numberText(value.monthly_segment_limit),
    patientNotificationsEnabled: value.patient_notifications_enabled !== false,
    staffNotificationsEnabled: Boolean(value.staff_notifications_enabled),
    defaultSenderId: text(value.default_sender_id),
    throughputLimitPerMinute: numberText(value.throughput_limit_per_minute),
    retentionDays: numberText(value.retention_days),
    notes: text(value.notes),
    accountConfirmed: Boolean(value.account_confirmed),
    dpaConfirmed: Boolean(value.dpa_confirmed),
    pricingConfirmed: Boolean(value.pricing_confirmed),
    deliveryReceiptsConfirmed: Boolean(value.delivery_receipts_confirmed),
    callbackContractConfirmed: Boolean(value.callback_contract_confirmed),
    staticIpAllowlistingConfirmed: Boolean(
      value.static_ip_allowlisting_confirmed,
    ),
    flows: savedTemplates,
  };
}

export function addTemplateToDraft(
  draft: SmsSettingsDraft,
  flowKey: SmsFlowKey,
  name: string,
): SmsSettingsDraft {
  return { ...draft, flows: [...draft.flows, newTemplateDraft(flowKey, name)] };
}

export function removeTemplateFromDraft(
  draft: SmsSettingsDraft,
  templateId: string,
): SmsSettingsDraft {
  return {
    ...draft,
    flows: draft.flows.filter((flow) => flow.id !== templateId),
  };
}

export function setTemplateInDraft(
  draft: SmsSettingsDraft,
  templateId: string,
  updates: Partial<SmsTemplateDraft>,
): SmsSettingsDraft {
  return {
    ...draft,
    flows: draft.flows.map((flow) =>
      flow.id === templateId ? { ...flow, ...updates } : flow,
    ),
  };
}

export function setVariableKeysInDraft(
  draft: SmsSettingsDraft,
  templateId: string,
  rawValue: string,
): SmsSettingsDraft {
  const variableKeys = rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
  return setTemplateInDraft(draft, templateId, { variableKeys });
}

/** Enabling one template for a flowKey turns off every other one for it,
 * enforcing "only one enabled template per workflow" the same way the
 * backend does, without waiting for a round trip to report the conflict. */
export function enableTemplateExclusively(
  draft: SmsSettingsDraft,
  templateId: string,
): SmsSettingsDraft {
  const target = draft.flows.find((flow) => flow.id === templateId);
  if (!target) return draft;
  return {
    ...draft,
    flows: draft.flows.map((flow) =>
      flow.id === templateId
        ? { ...flow, enabled: true }
        : flow.flowKey === target.flowKey && flow.language === target.language
          ? { ...flow, enabled: false }
          : flow,
    ),
  };
}

function templateLabel(template: SmsTemplateDraft): string {
  const eventLabel =
    flowOptions.find((item) => item.key === template.flowKey)?.label ||
    template.flowKey;
  return template.name.trim() ? `${eventLabel} — ${template.name.trim()}` : eventLabel;
}

/**
 * Mirrors the backend validators so the form reports problems inline instead of
 * surfacing a 422 after a round trip.
 */
export function validateDraft(draft: SmsSettingsDraft): string[] {
  const errors: string[] = [];
  if (draft.apiUrl.trim() && !/^https:\/\//i.test(draft.apiUrl.trim())) {
    errors.push("SMSCountry API URL must use HTTPS.");
  }
  if (draft.enabled && !draft.apiUrl.trim()) {
    errors.push("SMSCountry API URL is required when SMS is enabled.");
  }
  if (draft.enabled && draft.apiMode === "rest" && draft.apiUrl.trim()) {
    const path = draft.apiUrl.trim().split("?")[0];
    const account = path.includes("/Accounts/")
      ? path.split("/Accounts/")[1].split("/")[0]
      : null;
    if (account === null) {
      errors.push(
        "SMSCountry REST API URL must contain an /Accounts/ segment, e.g. " +
          "https://restapi.smscountry.com/v0.1/Accounts/{auth_key}/SMSes/",
      );
    } else if (account !== "{auth_key}") {
      // The auth key is a credential and is stored encrypted; putting it in
      // the URL would leave it in plaintext config and in URL logs.
      errors.push(
        "Use {auth_key} in the API URL instead of the auth key itself — it is " +
          "substituted from the saved credential when a message is sent.",
      );
    }
  }
  const restValues = [draft.apiKey.trim(), draft.apiToken.trim()];
  if (restValues.some(Boolean) && !restValues.every(Boolean)) {
    errors.push("Both the REST auth key and token are required.");
  }
  const legacyValues = [draft.username.trim(), draft.password.trim()];
  if (legacyValues.some(Boolean) && !legacyValues.every(Boolean)) {
    errors.push("Both the legacy username and password are required.");
  }
  const templateIds = new Set<string>();
  const enabledFlowKeys = new Set<string>();
  for (const template of draft.flows) {
    if (templateIds.has(template.id)) {
      errors.push("Two templates share the same identifier — remove one.");
    }
    templateIds.add(template.id);
    if (!template.enabled) continue;
    const label = templateLabel(template);
    const enabledKey = `${template.flowKey}:${template.language}`;
    if (enabledFlowKeys.has(enabledKey)) {
      errors.push(
        `Only one enabled template is allowed for ${
          flowOptions.find((item) => item.key === template.flowKey)?.label ||
          template.flowKey
        } in ${template.language.toUpperCase()} — disable the other one first.`,
      );
    }
    enabledFlowKeys.add(enabledKey);
    if (!template.dltTemplateId.trim()) {
      errors.push(`DLT template ID is required for ${label}.`);
    }
    if (!template.registeredBody.trim()) {
      errors.push(`Registered template body is required for ${label}.`);
    }
    if (!template.approvedByProvider) {
      errors.push(`Provider approval is required for ${label}.`);
    }
    if (template.classification === "promotional") {
      errors.push(`Promotional SMS is not supported for ${label} in this rollout.`);
    }
  }
  return errors;
}

export function buildSmsSettingsPayload(
  draft: SmsSettingsDraft,
): Record<string, unknown> {
  return {
    provider: "smscountry",
    enabled: draft.enabled,
    sms_country_api_mode: draft.apiMode,
    api_url: draft.apiUrl.trim() || null,
    api_key: optionalSecret(draft.apiKey),
    api_token: optionalSecret(draft.apiToken),
    username: optionalSecret(draft.username),
    password: optionalSecret(draft.password),
    webhook_secret: optionalSecret(draft.webhookSecret),
    default_country_code: draft.defaultCountryCode.trim() || "+91",
    timeout_seconds: draft.timeoutSeconds,
    max_attempts: draft.maxAttempts,
    max_segments_per_message: draft.maxSegmentsPerMessage,
    daily_message_limit: optionalNumber(draft.dailyMessageLimit),
    monthly_segment_limit: optionalNumber(draft.monthlySegmentLimit),
    patient_notifications_enabled: draft.patientNotificationsEnabled,
    staff_notifications_enabled: draft.staffNotificationsEnabled,
    account_confirmed: draft.accountConfirmed,
    dpa_confirmed: draft.dpaConfirmed,
    pricing_confirmed: draft.pricingConfirmed,
    delivery_receipts_confirmed: draft.deliveryReceiptsConfirmed,
    callback_contract_confirmed: draft.callbackContractConfirmed,
    static_ip_allowlisting_confirmed: draft.staticIpAllowlistingConfirmed,
    default_sender_id: draft.defaultSenderId.trim(),
    throughput_limit_per_minute: optionalNumber(draft.throughputLimitPerMinute),
    retention_days: optionalNumber(draft.retentionDays),
    notes: draft.notes.trim(),
    // Entirely blank dynamically-added rows are dropped rather than saved.
    flows: draft.flows
      .filter(
        (template) =>
          template.enabled ||
          template.dltTemplateId.trim() ||
          template.registeredBody.trim() ||
          template.variableKeys.length > 0 ||
          template.name.trim(),
      )
      .map((template) => ({
        id: template.id,
        flow_key: template.flowKey,
        name: template.name.trim(),
        language: template.language,
        enabled: template.enabled,
        classification: template.classification,
        consent_basis: template.consentBasis,
        dlt_template_id: template.dltTemplateId.trim(),
        registered_body: template.registeredBody.trim(),
        variable_keys: template.variableKeys,
        approved_by_provider: template.approvedByProvider,
      })),
  };
}
