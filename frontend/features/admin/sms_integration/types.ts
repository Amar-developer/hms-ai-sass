export type SmsCountryApiMode = "unknown" | "rest" | "http_legacy";

/** Must stay in step with SmsFlowKey in the backend's sms/schemas.py. */
export type SmsFlowKey =
  | "patient_registered_patient"
  | "appointment_booked_patient";

export type SmsLanguage =
  | "en"
  | "hi"
  | "mr"
  | "gu"
  | "ta"
  | "te"
  | "kn"
  | "ml"
  | "bn"
  | "pa"
  | "ur";

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
  language: SmsLanguage;
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

export type SmsUsage = {
  plan_name: string;
  monthly_segment_limit: number | null;
  daily_message_limit: number | null;
  plan_segment_limit: number;
  plan_segment_credits: number;
  messages_used: number;
  segments_used: number;
  messages_used_today: number;
  segments_remaining: number;
  limit_reached: boolean;
  cost_per_segment_paise: number;
  estimated_cost_paise: number | null;
  period_start: string;
  period_end: string;
};

export type SmsHealth = {
  status: "healthy" | "warning" | "critical";
  sent_24h: number;
  delivered_24h: number;
  failed_24h: number;
  failure_rate_24h: number;
  delivery_rate_24h: number;
  queued: number;
  retry_pending: number;
  stuck_processing: number;
  awaiting_receipt: number;
  oldest_queued_age_minutes: number | null;
  last_sent_at: string | null;
  alerts: string[];
};

export type SmsQueueItem = {
  id: string;
  flow_key: string;
  recipient_name: string;
  recipient_masked: string;
  status: "queued" | "processing" | "sent" | "failed" | "cancelled";
  delivery_status?: string | null;
  provider_status?: string | null;
  resource_type?: string | null;
  resource_reference?: string | null;
  sender_id?: string | null;
  segment_count?: number | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
  sent_at?: string | null;
  delivered_at?: string | null;
};

export type SmsQueueResponse = {
  items: SmsQueueItem[];
  total: number;
  limit: number;
  offset: number;
  counts: Record<
    "queued" | "processing" | "sent" | "failed" | "cancelled",
    number
  >;
};

export type SmsTestDraft = {
  mobile: string;
  templateId: string;
  flowKey: SmsFlowKey;
  language: SmsLanguage;
  variables: Record<string, string>;
};
