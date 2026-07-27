import { useEffect, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Eye,
  EyeOff,
  Link2,
  MessageCircleMore,
  ShieldCheck,
} from "lucide-react";

import { FormField } from "@/app/components/FormElements";
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { Modal } from "@/app/components/common/Modal";
import { apiFetch } from "@/lib/api";
import { WhatsAppDeliveryQueue } from "./WhatsAppDeliveryQueue";

type WhatsAppFlowKey =
  | "appointment_booked_patient"
  | "appointment_booked_doctor"
  | "invoice_paid_patient"
  | "payment_pending_patient"
  | "appointment_cancelled_patient"
  | "appointment_cancelled_doctor"
  | "invoice_refunded_patient"
  | "lab_report_ready_patient"
  | "prescription_ready_patient"
  | "follow_up_advice_patient"
  | "appointment_reminder_patient";

type WhatsAppLanguage =
  | "en"
  | "ta";

const languageOptions: Array<{ value: WhatsAppLanguage; label: string }> = [
  { value: "en", label: "English" },
  { value: "ta", label: "Tamil" },
];

type WhatsAppSettingsDraft = {
  enabled: boolean;
  apiUrl: string;
  publicMediaBaseUrl: string;
  appointmentViewUrl: string;
  apiKey: string;
  defaultCountryCode: string;
  timeoutSeconds: number;
  maxAttempts: number;
  patientNotificationsEnabled: boolean;
  doctorNotificationsEnabled: boolean;
  appointmentReminder24hEnabled: boolean;
  appointmentReminder2hEnabled: boolean;
  defaultLanguage: WhatsAppLanguage;
  templates: Record<WhatsAppFlowKey, string>;
  localizedTemplates: Partial<
    Record<WhatsAppLanguage, Record<WhatsAppFlowKey, string>>
  >;
  flows: Record<WhatsAppFlowKey, boolean>;
};

type WhatsAppTestDraft = {
  mobile: string;
  recipientName: string;
  flowKey: WhatsAppFlowKey;
  language: WhatsAppLanguage;
  parameters: string[];
  mediaUrl: string;
  mediaFilename: string;
};

const flowOptions: Array<{
  key: WhatsAppFlowKey;
  label: string;
  description: string;
  audience: "patient" | "doctor";
}> = [
  {
    key: "appointment_booked_patient",
    label: "Patient appointment confirmation",
    description: "Trigger after an appointment is booked successfully.",
    audience: "patient",
  },
  {
    key: "appointment_booked_doctor",
    label: "Doctor appointment alert",
    description: "Notify the assigned doctor about a new booking.",
    audience: "doctor",
  },
  {
    key: "invoice_paid_patient",
    label: "Paid invoice receipt",
    description: "Trigger when an invoice becomes fully paid.",
    audience: "patient",
  },
  {
    key: "payment_pending_patient",
    label: "Pending payment update",
    description: "Trigger after a partial payment leaves a balance.",
    audience: "patient",
  },
  {
    key: "appointment_cancelled_patient",
    label: "Patient appointment cancellation",
    description: "Trigger when a booked appointment is cancelled.",
    audience: "patient",
  },
  {
    key: "appointment_cancelled_doctor",
    label: "Doctor appointment cancellation",
    description: "Notify the assigned doctor when an appointment is cancelled.",
    audience: "doctor",
  },
  {
    key: "invoice_refunded_patient",
    label: "Invoice refund confirmation",
    description: "Trigger after a full or partial payment refund.",
    audience: "patient",
  },
  {
    key: "lab_report_ready_patient",
    label: "Lab report ready",
    description: "Trigger when a lab result is released.",
    audience: "patient",
  },
  {
    key: "prescription_ready_patient",
    label: "Prescription ready",
    description: "Trigger when a consultation with a prescription is signed.",
    audience: "patient",
  },
  {
    key: "follow_up_advice_patient",
    label: "Follow-up advice",
    description: "Trigger when a signed consultation includes follow-up advice.",
    audience: "patient",
  },
  {
    key: "appointment_reminder_patient",
    label: "Patient appointment reminder",
    description: "Send an automatic reminder before an upcoming appointment.",
    audience: "patient",
  },
];

const initialDraft: WhatsAppSettingsDraft = {
  enabled: false,
  apiUrl: "",
  publicMediaBaseUrl: "",
  appointmentViewUrl: "",
  apiKey: "",
  defaultCountryCode: "+91",
  timeoutSeconds: 15,
  maxAttempts: 5,
  patientNotificationsEnabled: true,
  doctorNotificationsEnabled: true,
  appointmentReminder24hEnabled: false,
  appointmentReminder2hEnabled: false,
  defaultLanguage: "en",
  templates: {
    appointment_booked_patient: "",
    appointment_booked_doctor: "",
    invoice_paid_patient: "",
    payment_pending_patient: "",
    appointment_cancelled_patient: "",
    appointment_cancelled_doctor: "",
    invoice_refunded_patient: "",
    lab_report_ready_patient: "",
    prescription_ready_patient: "",
    follow_up_advice_patient: "",
    appointment_reminder_patient: "",
  },
  localizedTemplates: {},
  flows: {
    appointment_booked_patient: true,
    appointment_booked_doctor: true,
    invoice_paid_patient: true,
    payment_pending_patient: false,
    appointment_cancelled_patient: false,
    appointment_cancelled_doctor: false,
    invoice_refunded_patient: false,
    lab_report_ready_patient: false,
    prescription_ready_patient: false,
    follow_up_advice_patient: false,
    appointment_reminder_patient: false,
  },
};

const testSamples: Record<WhatsAppFlowKey, string[]> = {
  appointment_booked_patient: ["Test Patient", "25 July 2026", "10:30 AM"],
  appointment_booked_doctor: [
    "Test Doctor",
    "booked",
    "appointment_test_001",
    "25 July 2026",
    "10:30 AM",
    "https://app.example.com/appointments",
  ],
  invoice_paid_patient: [
    "Test Patient",
    "TEST-INV-001",
    "Consultation",
    "1000",
  ],
  payment_pending_patient: [
    "Test Patient",
    "TEST-INV-001",
    "500",
    "500",
  ],
  appointment_cancelled_patient: ["Test Patient", "25 July 2026", "10:30 AM", "Schedule change"],
  appointment_cancelled_doctor: ["Test Doctor", "25 July 2026", "10:30 AM", "Schedule change"],
  invoice_refunded_patient: ["Test Patient", "TEST-INV-001", "500"],
  lab_report_ready_patient: ["Test Patient", "LAB-001", "Blood test"],
  prescription_ready_patient: ["Test Patient", "25 July 2026", "Test Doctor"],
  follow_up_advice_patient: ["Test Patient", "Return after seven days"],
  appointment_reminder_patient: ["Test Patient", "25 July 2026", "10:30 AM"],
};

const parameterLabels: Record<WhatsAppFlowKey, string[]> = {
  appointment_booked_patient: ["Recipient name", "Appointment date", "Appointment time"],
  appointment_booked_doctor: [
    "Doctor name",
    "Appointment status",
    "Appointment ID",
    "Appointment date",
    "Appointment time",
    "Appointment view URL",
  ],
  invoice_paid_patient: ["Recipient name", "Invoice number", "Service", "Total amount"],
  payment_pending_patient: ["Recipient name", "Invoice number", "Amount paid", "Balance amount"],
  appointment_cancelled_patient: ["Recipient name", "Appointment date", "Appointment time", "Reason"],
  appointment_cancelled_doctor: ["Doctor name", "Appointment date", "Appointment time", "Reason"],
  invoice_refunded_patient: ["Recipient name", "Invoice number", "Refund amount"],
  lab_report_ready_patient: ["Recipient name", "Lab order number", "Tests"],
  prescription_ready_patient: ["Recipient name", "Consultation date", "Doctor name"],
  follow_up_advice_patient: ["Recipient name", "Follow-up advice"],
  appointment_reminder_patient: ["Recipient name", "Appointment date", "Appointment time"],
};

function createTestDraft(
  flowKey: WhatsAppFlowKey,
  language: WhatsAppLanguage = "en",
  appointmentViewUrl: string = "",
): WhatsAppTestDraft {
  const parameters = [...testSamples[flowKey]];
  if (flowKey === "appointment_booked_doctor" && appointmentViewUrl.trim()) {
    parameters[5] = appointmentViewUrl.trim();
  }
  return {
    mobile: "",
    recipientName: parameters[0],
    flowKey,
    language,
    parameters,
    mediaUrl: "",
    mediaFilename: "invoice.pdf",
  };
}

function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-emerald-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function readDraft(value: any): WhatsAppSettingsDraft {
  return {
    enabled: Boolean(value?.enabled),
    apiUrl: String(value?.api_url || ""),
    publicMediaBaseUrl: String(value?.public_media_base_url || ""),
    appointmentViewUrl: String(value?.appointment_view_url || ""),
    apiKey: "",
    defaultCountryCode: String(value?.default_country_code || "+91"),
    timeoutSeconds: Number(value?.timeout_seconds || 15),
    maxAttempts: Number(value?.max_attempts || 5),
    patientNotificationsEnabled: Boolean(
      value?.patient_notifications_enabled ?? true,
    ),
    doctorNotificationsEnabled: Boolean(
      value?.doctor_notifications_enabled ?? true,
    ),
    appointmentReminder24hEnabled: Boolean(
      value?.appointment_reminder_24h_enabled ?? false,
    ),
    appointmentReminder2hEnabled: Boolean(
      value?.appointment_reminder_2h_enabled ?? false,
    ),
    defaultLanguage: (value?.default_language || "en") as WhatsAppLanguage,
    templates: {
      ...initialDraft.templates,
      ...(value?.templates || {}),
    },
    localizedTemplates: Object.fromEntries(
      Object.entries(value?.localized_templates || {}).map(([language, templates]) => [
        language,
        { ...initialDraft.templates, ...(templates as object) },
      ]),
    ),
    flows: {
      ...initialDraft.flows,
      ...(value?.flows || {}),
    },
  };
}

export function WhatsAppIntegrationSettings({
  apiSession,
  tenantId,
}: {
  apiSession?: any;
  tenantId?: string;
} = {}) {
  const [draft, setDraft] = useState<WhatsAppSettingsDraft>(initialDraft);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [activeTemplateLanguage, setActiveTemplateLanguage] =
    useState<WhatsAppLanguage>("en");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState("");
  const [usage, setUsage] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testDraft, setTestDraft] = useState<WhatsAppTestDraft>(
    createTestDraft("appointment_booked_patient"),
  );
  const [message, setMessage] = useState("");
  const effectiveTenantId = tenantId || apiSession?.tenantId || "";

  useEffect(() => {
    let active = true;
    if (!apiSession || !effectiveTenantId) {
      setDraft(initialDraft);
      setHasApiKey(false);
      setMaskedApiKey("");
      setUsage(null);
      setHealth(null);
      setReadiness(null);
      return () => {
        active = false;
      };
    }
    const scopedSession = { ...apiSession, tenantId: effectiveTenantId };
    setBusy(true);
    setMessage("");
    void apiFetch("/communications/whatsapp/settings", scopedSession)
      .then((value) => {
        if (!active) return;
        const loadedDraft = readDraft(value);
        setDraft(loadedDraft);
        setActiveTemplateLanguage(loadedDraft.defaultLanguage);
        setHasApiKey(Boolean(value?.has_api_key));
        setMaskedApiKey(String(value?.api_key_masked || ""));
        setUsage(value?.usage || null);
        setHealth(value?.health || null);
        setReadiness(value?.readiness || null);
      })
      .catch((error: any) => {
        if (active)
          setMessage(error.message || "Could not load WhatsApp settings.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [apiSession, effectiveTenantId]);

  const update = <K extends keyof WhatsAppSettingsDraft>(
    key: K,
    value: WhatsAppSettingsDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const setTemplate = (key: WhatsAppFlowKey, value: string) =>
    setDraft((current) => {
      if (activeTemplateLanguage === current.defaultLanguage) {
        return {
          ...current,
          templates: { ...current.templates, [key]: value },
        };
      }
      return {
        ...current,
        localizedTemplates: {
          ...current.localizedTemplates,
          [activeTemplateLanguage]: {
            ...initialDraft.templates,
            ...(current.localizedTemplates[activeTemplateLanguage] || {}),
            [key]: value,
          },
        },
      };
    });

  const setFlow = (key: WhatsAppFlowKey, value: boolean) =>
    setDraft((current) => ({
      ...current,
      flows: { ...current.flows, [key]: value },
      ...(key === "appointment_reminder_patient" && !value
        ? {
            appointmentReminder24hEnabled: false,
            appointmentReminder2hEnabled: false,
          }
        : {}),
    }));

  function changeDefaultLanguage(language: WhatsAppLanguage) {
    setDraft((current) => {
      if (language === current.defaultLanguage) return current;
      const nextDefault = {
        ...initialDraft.templates,
        ...(current.localizedTemplates[language] || {}),
      };
      const localizedTemplates = {
        ...current.localizedTemplates,
        [current.defaultLanguage]: current.templates,
      };
      delete localizedTemplates[language];
      return {
        ...current,
        defaultLanguage: language,
        templates: nextDefault,
        localizedTemplates,
      };
    });
    setActiveTemplateLanguage(language);
  }

  async function saveSettings() {
    if (!apiSession || !effectiveTenantId) return;
    setBusy(true);
    setMessage("");
    try {
      const scopedSession = { ...apiSession, tenantId: effectiveTenantId };
      const saved = await apiFetch(
        "/communications/whatsapp/settings",
        scopedSession,
        {
          method: "PUT",
          body: JSON.stringify({
            enabled: draft.enabled,
            api_url: draft.apiUrl.trim() || null,
            public_media_base_url: draft.publicMediaBaseUrl.trim() || null,
            appointment_view_url: draft.appointmentViewUrl.trim() || null,
            api_key: draft.apiKey.trim() || undefined,
            default_country_code: draft.defaultCountryCode.trim(),
            timeout_seconds: draft.timeoutSeconds,
            max_attempts: draft.maxAttempts,
            patient_notifications_enabled:
              draft.patientNotificationsEnabled,
            doctor_notifications_enabled: draft.doctorNotificationsEnabled,
            appointment_reminder_24h_enabled:
              draft.appointmentReminder24hEnabled,
            appointment_reminder_2h_enabled:
              draft.appointmentReminder2hEnabled,
            default_language: draft.defaultLanguage,
            templates: draft.templates,
            localized_templates: draft.localizedTemplates,
            flows: draft.flows,
          }),
        },
      );
      setDraft(readDraft(saved));
      setHasApiKey(Boolean(saved?.has_api_key));
      setMaskedApiKey(String(saved?.api_key_masked || ""));
      setUsage(saved?.usage || null);
      setHealth(saved?.health || null);
      setReadiness(saved?.readiness || null);
      setShowApiKey(false);
      setMessage("WhatsApp settings saved securely.");
    } catch (error: any) {
      setMessage(error.message || "Could not save WhatsApp settings.");
    } finally {
      setBusy(false);
    }
  }

  const eligibleTestFlows = flowOptions.filter((flow) => {
    const audienceEnabled =
      flow.audience === "doctor"
        ? draft.doctorNotificationsEnabled
        : draft.patientNotificationsEnabled;
    return audienceEnabled && draft.flows[flow.key] && draft.templates[flow.key].trim();
  });
  const activeTemplates =
    activeTemplateLanguage === draft.defaultLanguage
      ? draft.templates
      : {
          ...initialDraft.templates,
          ...(draft.localizedTemplates[activeTemplateLanguage] || {}),
        };
  const missingLocalizedCount =
    activeTemplateLanguage === draft.defaultLanguage
      ? 0
      : flowOptions.filter((flow) => {
          const audienceEnabled =
            flow.audience === "doctor"
              ? draft.doctorNotificationsEnabled
              : draft.patientNotificationsEnabled;
          return (
            audienceEnabled &&
            draft.flows[flow.key] &&
            !activeTemplates[flow.key].trim()
          );
        }).length;
  const testTemplateIdentifier =
    testDraft.language === draft.defaultLanguage
      ? draft.templates[testDraft.flowKey]
      : draft.localizedTemplates[testDraft.language]?.[testDraft.flowKey] ||
        draft.templates[testDraft.flowKey];

  function openTestMessage() {
    const firstFlow = eligibleTestFlows[0]?.key;
    if (!firstFlow) {
      setMessage("Enable and save at least one notification template before testing.");
      return;
    }
    setTestDraft(
      createTestDraft(firstFlow, draft.defaultLanguage, draft.appointmentViewUrl),
    );
    setTestMessage("");
    setTestOpen(true);
  }

  function selectTestFlow(flowKey: WhatsAppFlowKey) {
    setTestDraft((current) => ({
      ...createTestDraft(flowKey, current.language, draft.appointmentViewUrl),
      mobile: current.mobile,
    }));
  }

  async function sendTestMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!apiSession || !effectiveTenantId) return;
    setTestBusy(true);
    setTestMessage("");
    try {
      const scopedSession = { ...apiSession, tenantId: effectiveTenantId };
      const result = await apiFetch(
        "/communications/whatsapp/test",
        scopedSession,
        {
          method: "POST",
          body: JSON.stringify({
            mobile: testDraft.mobile.trim(),
            recipient_name: testDraft.recipientName.trim(),
            flow_key: testDraft.flowKey,
            language: testDraft.language,
            template_parameters: testDraft.parameters.map((value) => value.trim()),
            media_url: testDraft.mediaUrl.trim() || null,
            media_filename: testDraft.mediaUrl.trim()
              ? testDraft.mediaFilename.trim() || "invoice.pdf"
              : null,
          }),
        },
      );
      const resultMessage =
        result?.message ||
        (result?.success
          ? "Test message sent successfully."
          : "Test message failed.");
      if (result?.success) {
        setMessage(resultMessage);
        setTestOpen(false);
        setReadiness((current: any) => {
          if (!current) return current;
          const deliveryCheck = current.checks.find(
            (check: any) => check.key === "successful_delivery",
          );
          if (!deliveryCheck || deliveryCheck.status === "pass") return current;
          const warnings = Math.max(Number(current.warnings || 0) - 1, 0);
          const blockers = Number(current.blockers || 0);
          return {
            ...current,
            passed: Number(current.passed || 0) + 1,
            warnings,
            status: blockers ? "not_ready" : warnings ? "attention" : "ready",
            checks: current.checks.map((check: any) =>
              check.key === "successful_delivery"
                ? {
                    ...check,
                    status: "pass",
                    message:
                      "A successful test or automatic delivery has been recorded.",
                  }
                : check,
            ),
          };
        });
      } else setTestMessage(resultMessage);
    } catch (error: any) {
      setTestMessage(error.message || "Could not send the test message.");
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <>
    <Card>
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div className="flex gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <MessageCircleMore className="h-5 w-5" />
          </span>
          <div>
            <h3 className="card-title font-bold">WhatsApp Integration</h3>
            <p className="card-desc max-w-3xl text-slate-500">
              Configure the external API connection, approved template
              identifiers, and the notifications each tenant wants to use.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={draft.enabled ? "green" : "slate"} className="normal-badge">
            {draft.enabled ? "Enabled" : "Disabled"}
          </Badge>
          <Switch
            label="Enable WhatsApp integration"
            checked={draft.enabled}
            onChange={(checked) => update("enabled", checked)}
          />
        </div>
      </div>

      {readiness && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h4 className="text-sm font-bold text-slate-800">
                Final rollout readiness
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                Application checks required before enabling notifications for all recipients.
              </p>
            </div>
            <Badge
              tone={
                readiness.status === "ready"
                  ? "green"
                  : readiness.status === "attention"
                    ? "amber"
                    : "red"
              }
              className="normal-badge"
            >
              {readiness.status === "ready"
                ? "Ready"
                : readiness.status === "attention"
                  ? "Needs attention"
                  : "Not ready"}
            </Badge>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {readiness.checks.map((check: any) => {
              const Icon =
                check.status === "pass"
                  ? CircleCheck
                  : check.status === "warning"
                    ? CircleAlert
                    : CircleX;
              const color =
                check.status === "pass"
                  ? "text-emerald-600"
                  : check.status === "warning"
                    ? "text-amber-600"
                    : "text-red-600";
              return (
                <div
                  key={check.key}
                  className="flex items-start gap-3 rounded-lg bg-slate-50 p-3"
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      {check.label}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {check.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {readiness.passed} passed · {readiness.warnings} warning(s) ·{" "}
            {readiness.blockers} blocker(s)
          </p>
        </div>
      )}

      {usage && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h4 className="card-title font-bold text-slate-800">
                Monthly notification usage
              </h4>
              <p className="mt-1 card-desc text-slate-500">
                {usage.plan_name} plan · resets at the start of each calendar
                month.
              </p>
            </div>
            <Badge tone={usage.limit_reached ? "red" : "blue"} className="normal-badge">
              {usage.used} / {usage.monthly_limit}
            </Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${
                usage.limit_reached ? "bg-red-500" : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(Number(usage.usage_percentage || 0), 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {usage.limit_reached
              ? "Monthly limit reached. New automatic notifications will not be queued."
              : `${usage.remaining} automatic notifications remaining this month.`}
          </p>
        </div>
      )}

      {health && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h1 className="card-title font-bold text-slate-800">
                Delivery health
              </h1>
              <p className="mt-1 card-desc text-slate-500">
                Application queue and delivery activity during the last 24 hours.
              </p>
            </div>
            <Badge
              tone={
                health.status === "critical"
                  ? "red"
                  : health.status === "warning"
                    ? "amber"
                    : "green"
              }
              className="normal-badge"
            >
              {String(health.status).replace(/^./, (value) => value.toUpperCase())}
            </Badge>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Sent (24h)", health.sent_24h],
              ["Failed (24h)", health.failed_24h],
              ["Failure rate", `${health.failure_rate_24h}%`],
              ["Queued", health.queued],
              ["Retries", health.retry_pending],
              ["Stuck", health.stuck_processing],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
              </div>
            ))}
          </div>
          {health.alerts?.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {health.alerts.map((alert: string) => (
                <p key={alert}>{alert}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 rounded-xl border border-slate-200 p-4">
        <div className="mb-4 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-slate-500" />
          <h4 className="card-title font-bold text-slate-800">API connection</h4>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2 xl:col-span-3">
            <FormField label="API URL">
              <Input
                type="url"
                value={draft.apiUrl}
                onChange={(event: any) => update("apiUrl", event.target.value)}
                placeholder="https://api.example.com/messages"
                autoComplete="url"
              />
            </FormField>
          </div>
          <FormField label="Default Country Code">
            <Input
              value={draft.defaultCountryCode}
              onChange={(event: any) =>
                update("defaultCountryCode", event.target.value)
              }
              placeholder="+91"
              inputMode="tel"
            />
          </FormField>
          <div className="md:col-span-2 xl:col-span-4">
            <FormField label="Public Receipt Base URL">
              <Input
                type="url"
                value={draft.publicMediaBaseUrl}
                onChange={(event: any) =>
                  update("publicMediaBaseUrl", event.target.value)
                }
                placeholder="https://api.yourdomain.com"
                autoComplete="url"
              />
            </FormField>
            <p className="mt-1 text-xs text-slate-500">
              Public HTTPS origin used for short-lived signed invoice receipt links. Required when paid invoice delivery is enabled.
            </p>
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <FormField label="Doctor Application URL (Optional)">
              <Input
                type="url"
                value={draft.appointmentViewUrl}
                onChange={(event: any) =>
                  update("appointmentViewUrl", event.target.value)
                }
                placeholder="https://app.yourdomain.com"
                autoComplete="url"
              />
            </FormField>
            <p className="mt-1 text-xs text-slate-500">
              Public SPA root or login page sent as value {"{{6}}"}. The doctor can sign in and open Appointments from the application menu.
            </p>
          </div>
          <div className="md:col-span-2">
            <FormField label="API Key">
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={draft.apiKey}
                  onChange={(event: any) =>
                    update("apiKey", event.target.value)
                  }
                  placeholder={
                    hasApiKey ? `${maskedApiKey} (leave blank to keep)` : "Enter the API key"
                  }
                  autoComplete="new-password"
                  className="rounded-lg px-2 py-2 pr-11 text-xs placeholder:text-xs lg:py-2.5 lg:pr-11 lg:text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((visible) => !visible)}
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-700"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </FormField>
          </div>
          <FormField label="Request Timeout (seconds)">
            <Input
              type="number"
              min="5"
              max="60"
              value={draft.timeoutSeconds}
              onChange={(event: any) =>
                update("timeoutSeconds", Number(event.target.value || 15))
              }
            />
          </FormField>
          <FormField label="Maximum Attempts">
            <Input
              type="number"
              min="1"
              max="10"
              value={draft.maxAttempts}
              onChange={(event: any) =>
                update("maxAttempts", Number(event.target.value || 5))
              }
            />
          </FormField>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          <span>
            {hasApiKey
              ? `${maskedApiKey} is saved. Leave this field blank to keep the existing key, or enter a new key to replace it.`
              : "The API key will be encrypted and masked after saving. It will never appear in notification logs or browser responses."}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 p-4">
        <h4 className="card-title font-bold text-slate-800">
          Recipient controls
        </h4>
        <p className="mt-1 card-desc text-slate-500">
          A recipient switch disables every notification for that audience.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            {
              key: "patientNotificationsEnabled" as const,
              label: "Patient notifications",
              description: "Appointments, payments, and invoice receipts.",
            },
            {
              key: "doctorNotificationsEnabled" as const,
              label: "Doctor notifications",
              description: "New appointment alerts for assigned doctors.",
            },
          ].map((option) => (
            <div
              key={option.key}
              className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 p-4"
            >
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {option.label}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {option.description}
                </p>
              </div>
              <Switch
                label={option.label}
                checked={draft[option.key]}
                onChange={(checked) => update(option.key, checked)}
                disabled={!draft.enabled}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 p-4">
        <h4 className="card-title font-bold text-slate-800">
          Notification templates
        </h4>
        <p className="mt-1 card-desc text-slate-500">
          Configure separate approved identifiers for English and Tamil. Patient
          messages use the language selected in the patient record; a missing
          Tamil identifier falls back to the tenant default.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <FormField label="Tenant default language">
            <Select
              value={draft.defaultLanguage}
              disabled={!draft.enabled}
              onChange={(event: any) =>
                changeDefaultLanguage(event.target.value as WhatsAppLanguage)
              }
            >
              {languageOptions.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Identifiers being edited">
            <Select
              value={activeTemplateLanguage}
              disabled={!draft.enabled}
              onChange={(event: any) =>
                setActiveTemplateLanguage(
                  event.target.value as WhatsAppLanguage,
                )
              }
            >
              {languageOptions.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                  {language.value === draft.defaultLanguage
                    ? " (tenant default)"
                    : ""}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {missingLocalizedCount > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {missingLocalizedCount} enabled template
            {missingLocalizedCount === 1 ? " is" : "s are"} missing for this
            language. Those messages will use the tenant-default identifier.
          </div>
        )}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {(showAllTemplates ? flowOptions : flowOptions.slice(0, 4)).map((flow) => {
            const audienceEnabled =
              flow.audience === "patient"
                ? draft.patientNotificationsEnabled
                : draft.doctorNotificationsEnabled;
            const disabled = !draft.enabled || !audienceEnabled;
            return (
              <div
                key={flow.key}
                className={`rounded-lg border p-4 transition-colors ${
                  disabled
                    ? "border-slate-100 bg-slate-50/70"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {flow.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {flow.description}
                    </p>
                  </div>
                  <Switch
                    label={flow.label}
                    checked={draft.flows[flow.key]}
                    onChange={(checked) => setFlow(flow.key, checked)}
                    disabled={disabled}
                  />
                </div>
                <div className="mt-3">
                  <FormField label="Template / Campaign Identifier">
                    <Input
                      value={activeTemplates[flow.key]}
                      onChange={(event: any) =>
                        setTemplate(flow.key, event.target.value)
                      }
                      placeholder={
                        activeTemplateLanguage === draft.defaultLanguage
                          ? "Enter approved identifier"
                          : "Optional — falls back to tenant default"
                      }
                      disabled={disabled || !draft.flows[flow.key]}
                    />
                  </FormField>
                </div>
                {flow.key === "appointment_reminder_patient" && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      {
                        key: "appointmentReminder24hEnabled" as const,
                        label: "24 hours before",
                      },
                      {
                        key: "appointmentReminder2hEnabled" as const,
                        label: "2 hours before",
                      },
                    ].map((schedule) => (
                      <div
                        key={schedule.key}
                        className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"
                      >
                        <span className="text-xs font-bold text-slate-700">
                          {schedule.label}
                        </span>
                        <Switch
                          label={schedule.label}
                          checked={draft[schedule.key]}
                          onChange={(checked) => update(schedule.key, checked)}
                          disabled={disabled || !draft.flows[flow.key]}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {flowOptions.length > 4 && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              className="close-button font-bold text-emerald-700"
              aria-expanded={showAllTemplates}
              onClick={() => setShowAllTemplates((current) => !current)}
            >
              {showAllTemplates
                ? "Show fewer templates"
                : `Show ${flowOptions.length - 4} more templates`}
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Test messages use the last saved tenant configuration and are sent to
          the number entered in the test window.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openTestMessage}
            disabled={busy || testBusy || !apiSession || !effectiveTenantId || !draft.enabled || !hasApiKey}
            title={!draft.enabled || !hasApiKey ? "Enable and save the connection first" : undefined}
            className="close-button font-bold disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Send Test Message
          </button>
          <Button
            type="button"
            onClick={saveSettings}
            disabled={busy || !apiSession || !effectiveTenantId}
          >
            {busy ? "Saving..." : "Save WhatsApp Settings"}
          </Button>
        </div>
      </div>
    </Card>
    {apiSession && effectiveTenantId && (
      <WhatsAppDeliveryQueue
        apiSession={apiSession}
        tenantId={effectiveTenantId}
        onMessage={setMessage}
      />
    )}
    <Modal
      open={testOpen}
      onClose={() => !testBusy && setTestOpen(false)}
      title="Send test template message"
      description="This sends a real message using the last saved tenant connection. The test number is not stored."
      maxWidth="lg"
      closeOnBackdrop={!testBusy}
    >
      <form onSubmit={sendTestMessage} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Recipient mobile number">
            <Input
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder={`${draft.defaultCountryCode} 98765 43210`}
              value={testDraft.mobile}
              onChange={(event: any) =>
                setTestDraft((current) => ({ ...current, mobile: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Recipient name">
            <Input
              required
              value={testDraft.recipientName}
              onChange={(event: any) =>
                setTestDraft((current) => ({
                  ...current,
                  recipientName: event.target.value,
                  parameters: current.parameters.map((value, index) =>
                    index === 0 ? event.target.value : value,
                  ),
                }))
              }
            />
          </FormField>
        </div>

        <FormField label="Notification flow">
          <Select
            value={testDraft.flowKey}
            onChange={(event: any) => selectTestFlow(event.target.value as WhatsAppFlowKey)}
          >
            {eligibleTestFlows.map((flow) => (
              <option key={flow.key} value={flow.key}>{flow.label}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Template language">
          <Select
            value={testDraft.language}
            onChange={(event: any) =>
              setTestDraft((current) => ({
                ...current,
                language: event.target.value as WhatsAppLanguage,
              }))
            }
          >
            {languageOptions.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Saved template identifier: <span className="font-bold text-slate-800">{testTemplateIdentifier}</span>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Template values</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {testDraft.parameters.map((value, index) => (
              <FormField
                key={`${testDraft.flowKey}-${index}`}
                label={`{{${index + 1}}} ${parameterLabels[testDraft.flowKey][index]}`}
              >
                <Input
                  required
                  value={value}
                  disabled={index === 0}
                  onChange={(event: any) =>
                    setTestDraft((current) => ({
                      ...current,
                      parameters: current.parameters.map((item, parameterIndex) =>
                        parameterIndex === index ? event.target.value : item,
                      ),
                    }))
                  }
                />
              </FormField>
            ))}
          </div>
        </div>

        {testDraft.flowKey === "invoice_paid_patient" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField label="Public invoice PDF URL">
                <Input
                  required
                  type="url"
                  placeholder="https://files.example.com/invoice.pdf"
                  value={testDraft.mediaUrl}
                  onChange={(event: any) =>
                    setTestDraft((current) => ({ ...current, mediaUrl: event.target.value }))
                  }
                />
              </FormField>
            </div>
            <FormField label="Attachment filename">
              <Input
                value={testDraft.mediaFilename}
                disabled={!testDraft.mediaUrl.trim()}
                onChange={(event: any) =>
                  setTestDraft((current) => ({ ...current, mediaFilename: event.target.value }))
                }
              />
            </FormField>
          </div>
        )}

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Sending this test may count toward your messaging account usage. Verify the recipient number before continuing.
        </div>
        {testMessage && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800"
          >
            {testMessage}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            className="close-button font-bold"
            disabled={testBusy}
            onClick={() => setTestOpen(false)}
          >
            Cancel
          </button>
          <Button type="submit" disabled={testBusy}>
            {testBusy ? "Sending..." : "Send Test Message"}
          </Button>
        </div>
      </form>
    </Modal>
    </>
  );
}
