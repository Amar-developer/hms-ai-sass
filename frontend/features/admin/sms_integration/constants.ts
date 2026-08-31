import {
  SmsConsentBasis,
  SmsCountryApiMode,
  SmsFlowKey,
  SmsLanguage,
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

export const languageOptions: [SmsLanguage, string][] = [
  ["en", "English"],
  ["hi", "Hindi"],
  ["mr", "Marathi"],
  ["gu", "Gujarati"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["kn", "Kannada"],
  ["ml", "Malayalam"],
  ["bn", "Bengali"],
  ["pa", "Punjabi"],
  ["ur", "Urdu"],
];

/** Supported trigger events. Only configured templates are rendered as cards. */
export const flowOptions: { key: SmsFlowKey; label: string; hint: string }[] = [
  {
    key: "patient_registered_patient",
    label: "Patient registration",
    hint: "Sent after a patient registration is successfully completed.",
  },
  {
    key: "appointment_booked_patient",
    label: "Appointment booked",
    hint: "Sent to the patient when an appointment is confirmed.",
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
    language: "en",
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

export const starterTemplateDrafts: SmsTemplateDraft[] = [
  {
    ...defaultTemplateDraft("patient_registered_patient"),
    id: "sms_tpl_patient_registration",
    name: "Patient registration",
    registeredBody:
      "Dear {#var#}, your patient registration at MedizinHub has been successfully completed. Your Patient ID is {#var#}. Thank you.",
    variableKeys: ["patient_name", "patient_number"],
  },
  {
    ...defaultTemplateDraft("appointment_booked_patient"),
    id: "sms_tpl_appointment_booking",
    name: "Appointment booking",
    registeredBody:
      "Dear {#var#}, your appointment with Dr. {#var#} for {#var#} at MedizinHub on {#var#} at {#var#} has been successfully booked. Appointment ID: {#var#}. Thank you.",
    variableKeys: [
      "patient_name",
      "doctor_name",
      "consultation_type",
      "appointment_date",
      "appointment_time",
      "appointment_id",
    ],
  },
];

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
  flows: starterTemplateDrafts,
};
