export type SmsCountryApiMode = "unknown" | "rest" | "http_legacy";

export type SmsFlowKey =
  | "appointment_booked_patient"
  | "appointment_reminder_patient"
  | "appointment_rescheduled_patient"
  | "appointment_cancelled_patient"
  | "queue_token_alert_patient"
  | "payment_pending_patient"
  | "lab_report_ready_patient"
  | "follow_up_reminder_patient";

export type SmsMessageClassification =
  | "transactional"
  | "service_implicit"
  | "service_explicit"
  | "promotional";

export type SmsConsentBasis =
  | "patient_transaction"
  | "explicit_consent"
  | "not_applicable";

export type SmsReadinessCheck = {
  key: string;
  label: string;
  status: "pass" | "warning" | "block";
  message: string;
};

export type SmsReadiness = {
  status: "ready" | "attention" | "not_ready";
  passed: number;
  warnings: number;
  blockers: number;
  checks: SmsReadinessCheck[];
  updated_at?: string | null;
};

/**
 * One DLT-approved template registered against a trigger event. A tenant may
 * keep several of these for the same flowKey (a reworded resubmission, a
 * retired wording) and add or delete them freely - only `id` need be
 * unique, and only one entry per flowKey may be enabled at a time.
 */
export type SmsTemplateDraft = {
  id: string;
  flowKey: SmsFlowKey;
  name: string;
  enabled: boolean;
  classification: SmsMessageClassification;
  consentBasis: SmsConsentBasis;
  dltTemplateId: string;
  registeredBody: string;
  variableKeys: string[];
  approvedByProvider: boolean;
};

export type SmsSettingsDraft = {
  enabled: boolean;
  apiMode: SmsCountryApiMode;
  apiUrl: string;
  apiKey: string;
  apiToken: string;
  username: string;
  password: string;
  webhookSecret: string;
  defaultCountryCode: string;
  timeoutSeconds: number;
  maxAttempts: number;
  maxSegmentsPerMessage: number;
  dailyMessageLimit: string;
  monthlySegmentLimit: string;
  patientNotificationsEnabled: boolean;
  staffNotificationsEnabled: boolean;
  dltEntityId: string;
  defaultSenderId: string;
  throughputLimitPerMinute: string;
  retentionDays: string;
  notes: string;
  accountConfirmed: boolean;
  dpaConfirmed: boolean;
  pricingConfirmed: boolean;
  deliveryReceiptsConfirmed: boolean;
  callbackContractConfirmed: boolean;
  staticIpAllowlistingConfirmed: boolean;
  flows: SmsTemplateDraft[];
};
