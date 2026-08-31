import {
  SmsConsentBasis,
  SmsCountryApiMode,
  SmsFlowKey,
  SmsMessageClassification,
  SmsSettingsDraft,
  SmsTemplateDraft,
} from "./types";

export const MAX_VARIABLE_KEYS = 12;

export const MAX_TEMPLATES_PER_TENANT = 50;

export const apiModeOptions: [SmsCountryApiMode, string][] = [
  ["unknown", "Not confirmed yet"],
  ["rest", "REST API (key and token)"],
  ["http_legacy", "Legacy HTTP API (username and password)"],
];

export const classificationOptions: [SmsMessageClassification, string][] = [
  ["transactional", "Transactional"],
  ["service_implicit", "Service - implicit consent"],
  ["service_explicit", "Service - explicit consent"],
  ["promotional", "Promotional"],
];

export const consentBasisOptions: [SmsConsentBasis, string][] = [
  ["patient_transaction", "Patient transaction"],
  ["explicit_consent", "Explicit consent"],
  ["not_applicable", "Not applicable"],
];

/** The P0 flows the backend readiness evaluator requires before rollout. */
export const flowOptions: { key: SmsFlowKey; label: string; hint: string }[] = [
  {
    key: "appointment_booked_patient",
    label: "Appointment booked",
    hint: "Sent to the patient when an appointment is confirmed.",
  },
  {
    key: "appointment_reminder_patient",
    label: "Appointment reminder",
    hint: "Sent ahead of the scheduled appointment slot.",
  },
  {
    key: "appointment_rescheduled_patient",
    label: "Appointment rescheduled",
    hint: "Sent when the appointment date or time changes.",
  },
  {
    key: "appointment_cancelled_patient",
    label: "Appointment cancelled",
    hint: "Sent when an appointment is cancelled.",
  },
  {
    key: "queue_token_alert_patient",
    label: "Queue token alert",
    hint: "Sent when the patient token is called or is next in line.",
  },
  {
    key: "payment_pending_patient",
    label: "Payment pending",
    hint: "Sent when an invoice is awaiting payment.",
  },
  {
    key: "lab_report_ready_patient",
    label: "Lab report ready",
    hint: "Sent when a lab report is released to the patient.",
  },
  {
    key: "follow_up_reminder_patient",
    label: "Follow-up reminder",
    hint: "Sent when a follow-up visit is due.",
  },
];

function generateTemplateId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `sms_tpl_${Date.now().toString(36)}${random}`;
}

export function newTemplateDraft(
  flowKey: SmsFlowKey,
  name = "",
): SmsTemplateDraft {
  return {
    id: generateTemplateId(),
    flowKey,
    name,
    enabled: false,
    classification: "service_implicit",
    consentBasis: "patient_transaction",
    dltTemplateId: "",
    registeredBody: "",
    variableKeys: [],
    approvedByProvider: false,
  };
}

/**
 * The blank placeholder shown for a workflow with no saved template yet.
 * Its id is derived from flowKey, not randomly generated, so the same
 * untouched card keeps the same React key across the initial pre-fetch
 * render and the post-fetch render - a random id here would remount the
 * card the instant the fetch resolves and strand any in-flight click on a
 * DOM node that's about to be replaced.
 */
export function defaultTemplateDraft(flowKey: SmsFlowKey): SmsTemplateDraft {
  return { ...newTemplateDraft(flowKey), id: `sms_tpl_default_${flowKey}` };
}

export const initialDraft: SmsSettingsDraft = {
  enabled: false,
  apiMode: "unknown",
  apiUrl: "",
  apiKey: "",
  apiToken: "",
  username: "",
  password: "",
  webhookSecret: "",
  defaultCountryCode: "+91",
  timeoutSeconds: 15,
  maxAttempts: 5,
  maxSegmentsPerMessage: 3,
  dailyMessageLimit: "",
  monthlySegmentLimit: "",
  patientNotificationsEnabled: true,
  staffNotificationsEnabled: false,
  dltEntityId: "",
  defaultSenderId: "",
  throughputLimitPerMinute: "",
  retentionDays: "",
  notes: "",
  accountConfirmed: false,
  dpaConfirmed: false,
  pricingConfirmed: false,
  deliveryReceiptsConfirmed: false,
  callbackContractConfirmed: false,
  staticIpAllowlistingConfirmed: false,
  // One blank, unsaved template per P0 event so every workflow has a visible
  // card to fill in before the tenant has saved anything. Each is a normal
  // template row from here on - deletable, and more can be added per event.
  flows: flowOptions.map((flow) => defaultTemplateDraft(flow.key)),
};
