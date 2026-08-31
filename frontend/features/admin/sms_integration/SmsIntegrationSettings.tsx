import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  FileCheck2,
  KeyRound,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  Send,
} from "lucide-react";

import { Badge, Button, StatusToast } from "@/app/components/common/ui";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { OverlayLoader } from "@/app/components/common/loader/OverlayLoader";
import {
  fetchSmsHealth,
  fetchSmsSettings,
  fetchSmsUsage,
  sendSmsTest,
  updateSmsSettings,
} from "@/features/admin/api/sms.api";
import { initialDraft } from "./constants";
import {
  addTemplateToDraft,
  buildSmsSettingsPayload,
  enableTemplateExclusively,
  readDraft,
  removeTemplateFromDraft,
  setTemplateInDraft,
  setVariableKeysInDraft,
  validateDraft,
} from "./helpers";
import {
  SmsFlowKey,
  SmsHealth,
  SmsReadiness,
  SmsSettingsDraft,
  SmsTemplateDraft,
  SmsTestDraft,
  SmsUsage,
} from "./types";
import { SmsComplianceSection } from "./components/SmsComplianceSection";
import { SmsDeliveryControls } from "./components/SmsDeliveryControls";
import { SmsDeliveryQueue } from "./components/SmsDeliveryQueue";
import { SmsFlowsSection } from "./components/SmsFlowsSection";
import { SmsProviderSection } from "./components/SmsProviderSection";
import { SmsSwitch } from "./components/SmsSwitch";
import {
  SmsHealthPanel,
  SmsReadinessSummary,
  SmsUsagePanel,
} from "./components/SmsStatusPanels";
import { SmsTestMessageModal } from "./components/SmsTestMessageModal";

type WorkspaceTab =
  | "overview"
  | "connection"
  | "compliance"
  | "templates"
  | "delivery";

function readReadiness(value: any): SmsReadiness | null {
  if (!value || !Array.isArray(value.checks)) return null;
  return {
    status: value.status,
    passed: Number(value.passed || 0),
    warnings: Number(value.warnings || 0),
    blockers: Number(value.blockers || 0),
    checks: value.checks,
    updated_at: value.updated_at || null,
  };
}

function firstTestDraft(draft: SmsSettingsDraft): SmsTestDraft | null {
  const template = draft.flows.find(
    (item) => item.enabled && item.approvedByProvider,
  );
  if (!template) return null;
  return {
    mobile: "",
    templateId: template.id,
    flowKey: template.flowKey,
    language: template.language,
    variables: Object.fromEntries(
      template.variableKeys.map((key) => [key, ""]),
    ),
  };
}

export function SmsIntegrationSettings({
  apiSession,
  tenantId,
}: {
  apiSession?: any;
  tenantId?: string;
} = {}) {
  const [draft, setDraft] = useState<SmsSettingsDraft>(initialDraft);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [showSecrets, setShowSecrets] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [credentialLastFour, setCredentialLastFour] = useState("");
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);
  const [readiness, setReadiness] = useState<SmsReadiness | null>(null);
  const [usage, setUsage] = useState<SmsUsage | null>(null);
  const [health, setHealth] = useState<SmsHealth | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testDraft, setTestDraft] = useState<SmsTestDraft>({
    mobile: "",
    templateId: "",
    flowKey: "appointment_booked_patient",
    language: "en",
    variables: {},
  });
  const effectiveTenantId = tenantId || apiSession?.tenantId || "";

  const loadOperationalData = useCallback(async (scopedSession: any) => {
    const [usageResult, healthResult] = await Promise.allSettled([
      fetchSmsUsage(scopedSession),
      fetchSmsHealth(scopedSession),
    ]);
    if (
      usageResult.status === "fulfilled" &&
      typeof usageResult.value?.segments_used === "number"
    ) {
      setUsage(usageResult.value as SmsUsage);
    }
    if (
      healthResult.status === "fulfilled" &&
      Array.isArray(healthResult.value?.alerts)
    ) {
      setHealth(healthResult.value as SmsHealth);
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (!apiSession || !effectiveTenantId) {
      setDraft(initialDraft);
      setHasCredentials(false);
      setCredentialLastFour("");
      setHasWebhookSecret(false);
      setReadiness(null);
      setUsage(null);
      setHealth(null);
      setInitialLoading(false);
      return () => {
        active = false;
      };
    }
    const scopedSession = { ...apiSession, tenantId: effectiveTenantId };
    setInitialLoading(true);
    setMessage("");
    void fetchSmsSettings(scopedSession)
      .then(async (value: any) => {
        if (!active) return;
        setDraft(readDraft(value));
        setHasCredentials(Boolean(value?.has_credentials));
        setCredentialLastFour(String(value?.credential_last_four || ""));
        setHasWebhookSecret(Boolean(value?.has_webhook_secret));
        setReadiness(readReadiness(value));
        await loadOperationalData(scopedSession);
      })
      .catch((error: any) => {
        if (active) setMessage(error.message || "Could not load SMS settings.");
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    apiSession?.email,
    apiSession?.tenantId,
    apiSession?.token,
    effectiveTenantId,
    loadOperationalData,
  ]);

  const update = <K extends keyof SmsSettingsDraft>(
    key: K,
    value: SmsSettingsDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const setTemplate = (templateId: string, updates: Partial<SmsTemplateDraft>) =>
    setDraft((current) => setTemplateInDraft(current, templateId, updates));
  const setVariableKeys = (templateId: string, rawValue: string) =>
    setDraft((current) =>
      setVariableKeysInDraft(current, templateId, rawValue),
    );
  const enableTemplate = (templateId: string) =>
    setDraft((current) => enableTemplateExclusively(current, templateId));
  const addTemplate = (flowKey: SmsFlowKey) =>
    setDraft((current) => addTemplateToDraft(current, flowKey, ""));
  const removeTemplate = (templateId: string) =>
    setDraft((current) => removeTemplateFromDraft(current, templateId));

  async function saveSettings() {
    if (!apiSession || !effectiveTenantId) return;
    const validationErrors = validateDraft(draft);
    setErrors(validationErrors);
    if (validationErrors.length) {
      setMessage("Fix the highlighted problems before saving.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const scopedSession = { ...apiSession, tenantId: effectiveTenantId };
      const saved = await updateSmsSettings(
        scopedSession,
        buildSmsSettingsPayload(draft),
      );
      setDraft(readDraft(saved));
      setHasCredentials(Boolean(saved?.has_credentials));
      setCredentialLastFour(String(saved?.credential_last_four || ""));
      setHasWebhookSecret(Boolean(saved?.has_webhook_secret));
      setReadiness(readReadiness(saved));
      setShowSecrets(false);
      await loadOperationalData(scopedSession);
      setMessage("SMS settings saved securely.");
    } catch (error: any) {
      setMessage(error.message || "Could not save SMS settings.");
    } finally {
      setBusy(false);
    }
  }

  function openTestMessage() {
    const next = firstTestDraft(draft);
    if (!next) {
      setMessage("Enable and save an approved SMS template before testing.");
      return;
    }
    setTestDraft(next);
    setTestMessage("");
    setTestOpen(true);
  }

  async function submitTest(event: React.FormEvent) {
    event.preventDefault();
    if (!apiSession || !effectiveTenantId) return;
    setTestBusy(true);
    setTestMessage("");
    try {
      const scopedSession = { ...apiSession, tenantId: effectiveTenantId };
      const result = await sendSmsTest(scopedSession, {
        mobile: testDraft.mobile.trim(),
        flow_key: testDraft.flowKey,
        language: testDraft.language,
        variables: testDraft.variables,
      });
      if (!result?.success) {
        setTestMessage(result?.message || "The SMS provider rejected the test.");
        return;
      }
      setTestOpen(false);
      setMessage(
        `${result.message || "Test SMS accepted."}${
          result.segment_count ? ` ${result.segment_count} segment(s).` : ""
        }`,
      );
      await loadOperationalData(scopedSession);
    } catch (error: any) {
      setTestMessage(error.message || "Could not send the test SMS.");
    } finally {
      setTestBusy(false);
    }
  }

  const enabledTemplateCount = draft.flows.filter((flow) => flow.enabled).length;
  const tabs = [
    {
      id: "overview" as const,
      label: "Overview",
      icon: Activity,
      count: Number(readiness?.blockers || readiness?.warnings || 0),
    },
    { id: "connection" as const, label: "API Connection", icon: KeyRound },
    { id: "compliance" as const, label: "Compliance", icon: FileCheck2 },
    {
      id: "templates" as const,
      label: "Templates",
      icon: MessagesSquare,
      count: enabledTemplateCount,
    },
    {
      id: "delivery" as const,
      label: "Delivery Queue",
      icon: ListChecks,
      count: Number(health?.queued || 0),
    },
  ];

  return (
    <div className="space-y-3">
      <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {initialLoading && <OverlayLoader />}
        <StatusToast message={message} onClose={() => setMessage("")} />
        <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <MessageSquare className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-950">
                SMS Workspace
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Connection, DLT templates, compliance, usage, and delivery operations.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={draft.enabled ? "green" : "slate"} className="normal-label">
              {draft.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <SmsSwitch
              label="Enable SMS integration"
              checked={draft.enabled}
              onChange={(checked) => update("enabled", checked)}
            />
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <Button
              type="button"
              onClick={openTestMessage}
              disabled={!apiSession || !effectiveTenantId || !draft.enabled}
              className="flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-50"
            >
              <Send size={14} /> Test SMS
            </Button>
            <Button
              type="button"
              onClick={saveSettings}
              disabled={busy || !apiSession || !effectiveTenantId}
              className="save-button"
            >
              <ButtonLoader loading={busy}>
                {busy ? "Saving..." : "Save Settings"}
              </ButtonLoader>
            </Button>
          </div>
        </div>
        <div
          role="tablist"
          aria-label="SMS workspace sections"
          className="flex overflow-x-auto border-t border-slate-200 bg-slate-50 px-2"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-w-max items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-bold transition ${
                  activeTab === tab.id
                    ? "border-emerald-600 bg-white text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon size={14} /> {tab.label}
                {Boolean(tab.count) && (
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {draft.enabled && !hasCredentials && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          SMSCountry credentials for the selected API mode are required before
          the integration can be saved as enabled.
        </p>
      )}
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      {activeTab === "overview" && (
        <div className="space-y-3">
          <SmsReadinessSummary readiness={readiness} />
          <div className="grid gap-3 xl:grid-cols-2">
            <SmsUsagePanel usage={usage} />
            <SmsHealthPanel health={health} />
          </div>
        </div>
      )}
      {activeTab === "connection" && (
        <div className="space-y-3">
          <SmsProviderSection
            draft={draft}
            update={update}
            showSecrets={showSecrets}
            setShowSecrets={setShowSecrets}
            hasCredentials={hasCredentials}
            credentialLastFour={credentialLastFour}
            hasWebhookSecret={hasWebhookSecret}
          />
          <SmsDeliveryControls draft={draft} update={update} />
        </div>
      )}
      {activeTab === "compliance" && (
        <SmsComplianceSection draft={draft} update={update} />
      )}
      {activeTab === "templates" && (
        <SmsFlowsSection
          draft={draft}
          setTemplate={setTemplate}
          setVariableKeys={setVariableKeys}
          enableTemplate={enableTemplate}
          addTemplate={addTemplate}
          removeTemplate={removeTemplate}
        />
      )}
      {activeTab === "delivery" && (
        <SmsDeliveryQueue
          apiSession={apiSession}
          tenantId={effectiveTenantId}
          onMessage={setMessage}
        />
      )}

      <SmsTestMessageModal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        busy={testBusy}
        message={testMessage}
        draft={draft}
        testDraft={testDraft}
        setTestDraft={setTestDraft}
        onSubmit={submitTest}
      />
    </div>
  );
}
