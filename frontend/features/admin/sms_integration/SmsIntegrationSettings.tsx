import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";

import { Badge, Button, Card, StatusToast } from "@/app/components/common/ui";
import { fetchSmsSettings, updateSmsSettings } from "@/features/admin/api/sms.api";
import { OverlayLoader } from "@/app/components/common/loader/OverlayLoader";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";

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
import { SmsFlowKey, SmsReadiness, SmsSettingsDraft, SmsTemplateDraft } from "./types";
import { SmsReadinessPanel } from "./components/SmsReadinessPanel";
import { SmsProviderSection } from "./components/SmsProviderSection";
import { SmsComplianceSection } from "./components/SmsComplianceSection";
import { SmsDeliveryControls } from "./components/SmsDeliveryControls";
import { SmsFlowsSection } from "./components/SmsFlowsSection";

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

export function SmsIntegrationSettings({
  apiSession,
  tenantId,
}: {
  apiSession?: any;
  tenantId?: string;
} = {}) {
  const [draft, setDraft] = useState<SmsSettingsDraft>(initialDraft);
  const [showSecrets, setShowSecrets] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [credentialLastFour, setCredentialLastFour] = useState("");
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);
  const [readiness, setReadiness] = useState<SmsReadiness | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [message, setMessage] = useState("");
  const effectiveTenantId = tenantId || apiSession?.tenantId || "";

  useEffect(() => {
    let active = true;
    if (!apiSession || !effectiveTenantId) {
      setDraft(initialDraft);
      setHasCredentials(false);
      setCredentialLastFour("");
      setHasWebhookSecret(false);
      setReadiness(null);
      setInitialLoading(false);
      return () => {
        active = false;
      };
    }
    const scopedSession = { ...apiSession, tenantId: effectiveTenantId };
    setBusy(true);
    setMessage("");
    void fetchSmsSettings(scopedSession)
      .then((value: any) => {
        if (!active) return;
        setDraft(readDraft(value));
        setHasCredentials(Boolean(value?.has_credentials));
        setCredentialLastFour(String(value?.credential_last_four || ""));
        setHasWebhookSecret(Boolean(value?.has_webhook_secret));
        setReadiness(readReadiness(value));
      })
      .catch((error: any) => {
        if (active) setMessage(error.message || "Could not load SMS settings.");
      })
      .finally(() => {
        if (active) {
          setBusy(false);
          setInitialLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [apiSession, effectiveTenantId]);

  const update = <K extends keyof SmsSettingsDraft>(
    key: K,
    value: SmsSettingsDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const setTemplate = (templateId: string, updates: Partial<SmsTemplateDraft>) =>
    setDraft((current) => setTemplateInDraft(current, templateId, updates));

  const setVariableKeys = (templateId: string, rawValue: string) =>
    setDraft((current) => setVariableKeysInDraft(current, templateId, rawValue));

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
      setMessage("SMS settings saved securely.");
    } catch (error: any) {
      setMessage(error.message || "Could not save SMS settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="relative px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm">
      {initialLoading && <OverlayLoader />}
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div className="flex gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <MessageSquare className="h-5 w-5" />
          </span>
          <div>
            <h3 className="card-title font-bold">SMS Integration</h3>
            <p className="card-desc max-w-3xl text-slate-500">
              Configure the SMSCountry connection, DLT registration details, and
              the approved templates each SMS workflow is allowed to send.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            tone={draft.enabled ? "green" : "slate"}
            className="normal-badge"
          >
            {draft.enabled ? "Enabled" : "Disabled"}
          </Badge>
          <label className="sr-only" htmlFor="sms-enabled-toggle">
            Enable SMS integration
          </label>
          <button
            id="sms-enabled-toggle"
            type="button"
            role="switch"
            aria-checked={draft.enabled}
            aria-label="Enable SMS integration"
            onClick={() => update("enabled", !draft.enabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              draft.enabled ? "bg-emerald-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                draft.enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {draft.enabled && !hasCredentials && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          SMSCountry credentials for the selected API mode are required before
          the integration can be saved as enabled.
        </p>
      )}

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <SmsReadinessPanel readiness={readiness} />

      <SmsProviderSection
        draft={draft}
        update={update}
        showSecrets={showSecrets}
        setShowSecrets={setShowSecrets}
        hasCredentials={hasCredentials}
        credentialLastFour={credentialLastFour}
        hasWebhookSecret={hasWebhookSecret}
      />

      <SmsComplianceSection draft={draft} update={update} />

      <SmsDeliveryControls draft={draft} update={update} />

      <SmsFlowsSection
        draft={draft}
        setTemplate={setTemplate}
        setVariableKeys={setVariableKeys}
        enableTemplate={enableTemplate}
        addTemplate={addTemplate}
        removeTemplate={removeTemplate}
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Saving records the readiness checklist and re-evaluates the rollout
          status. Sending is not enabled until the SMS worker is live.
        </p>
        <Button
          type="button"
          onClick={saveSettings}
          disabled={busy || !apiSession || !effectiveTenantId}
          className="save-button"
        >
          <ButtonLoader loading={busy}>
            {busy ? "Saving..." : "Save SMS Settings"}
          </ButtonLoader>
        </Button>
      </div>
    </Card>
  );
}
