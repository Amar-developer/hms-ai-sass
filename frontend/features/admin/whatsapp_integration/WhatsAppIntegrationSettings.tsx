import { useEffect, useState } from "react";
import { MessageCircleMore } from "lucide-react";

import { Badge, Button, Card, StatusToast } from "@/app/components/common/ui";
import {
  fetchWhatsAppSettings,
  sendWhatsAppTest,
  updateWhatsAppSettings,
} from "@/features/admin/api/whatsapp.api";
import { OverlayLoader } from "@/app/components/common/loader/OverlayLoader";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";

import {
  WhatsAppCustomTemplate,
  WhatsAppFlowKey,
  WhatsAppLanguage,
  WhatsAppSettingsDraft,
  WhatsAppTestDraft,
} from "../types";
import {
  flowOptions,
  initialDraft,
  MAX_TEMPLATE_PARAMETERS,
  newTemplateInitialState,
} from "../constants";
import {
  addCustomTemplateFieldInDraft,
  addNotificationTemplateToDraft,
  addTemplateFieldInDraft,
  buildWhatsAppSettingsPayload,
  changeDefaultLanguageInDraft,
  confirmTemplateDelete,
  createCustomTemplateTestDraft,
  createTestDraft,
  deleteBuiltInTemplateFromDraft,
  getActiveTemplates,
  getEligibleCustomTemplates,
  getEligibleTestFlows,
  getMissingLocalizedCount,
  getTestTemplateContext,
  isDeletedBuiltInTemplate,
  moveCustomTemplateFieldInDraft,
  moveTemplateFieldInDraft,
  readDraft,
  removeCustomTemplateFieldInDraft,
  removeCustomTemplateFromDraft,
  removeTemplateFieldInDraft,
  setFlowInDraft,
  setTemplateInDraft,
  updateCustomTemplateInDraft,
} from "../helpers";
import { NewTemplateState, WhatsAppAddTemplateModal } from "./components/WhatsAppAddTemplateModal";
import { WhatsAppSwitch } from "./components/WhatsAppSwitch";
import { WhatsAppHealthPanel, WhatsAppReadinessPanel, WhatsAppUsagePanel } from "./components/WhatsAppStatusPanels";
import { WhatsAppApiConnectionSection } from "./components/WhatsAppApiConnectionSection";
import { WhatsAppRecipientControls } from "./components/WhatsAppRecipientControls";
import { WhatsAppTemplatesSection } from "./components/WhatsAppTemplatesSection";
import { WhatsAppDeliveryQueue } from "./components/WhatsAppDeliveryQueue";
import { WhatsAppTestMessageModal } from "./components/WhatsAppTestMessageModal";

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
  const [addTemplateOpen, setAddTemplateOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState<NewTemplateState>(
    newTemplateInitialState,
  );
  const [activeTemplateLanguage, setActiveTemplateLanguage] =
    useState<WhatsAppLanguage>("en");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState("");
  const [usage, setUsage] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [testBusy, setTestBusy] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testDraft, setTestDraft] = useState<WhatsAppTestDraft>(
    createTestDraft("appointment_booked_patient", {}, {}),
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
      setInitialLoading(false);
      return () => {
        active = false;
      };
    }
    const scopedSession = { ...apiSession, tenantId: effectiveTenantId };
    setBusy(true);
    setMessage("");
    void fetchWhatsAppSettings(scopedSession)
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
        if (active) {
          setBusy(false);
          setInitialLoading(false);
        }
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
    setDraft((current) => setTemplateInDraft(current, activeTemplateLanguage, key, value));

  const addTemplateField = (flowKey: WhatsAppFlowKey, fieldKey: string) =>
    setDraft((current) => addTemplateFieldInDraft(current, flowKey, fieldKey, MAX_TEMPLATE_PARAMETERS));

  const removeTemplateField = (flowKey: WhatsAppFlowKey, index: number) =>
    setDraft((current) => removeTemplateFieldInDraft(current, flowKey, index));

  const moveTemplateField = (
    flowKey: WhatsAppFlowKey,
    index: number,
    direction: -1 | 1,
  ) => setDraft((current) => moveTemplateFieldInDraft(current, flowKey, index, direction));

  const setFlow = (key: WhatsAppFlowKey, value: boolean) =>
    setDraft((current) => setFlowInDraft(current, key, value));

  function changeDefaultLanguage(language: WhatsAppLanguage) {
    setDraft((current) => changeDefaultLanguageInDraft(current, language));
    setActiveTemplateLanguage(language);
  }

  async function saveSettings(
    overrideDraft?: WhatsAppSettingsDraft,
    successMessage = "WhatsApp settings saved securely.",
  ) {
    if (!apiSession || !effectiveTenantId) return;
    const payloadDraft =
      overrideDraft && "templates" in overrideDraft ? overrideDraft : draft;
    setBusy(true);
    setMessage("");
    try {
      const scopedSession = { ...apiSession, tenantId: effectiveTenantId };
      const saved = await updateWhatsAppSettings(
        scopedSession,
        buildWhatsAppSettingsPayload(payloadDraft),
      );
      setDraft(readDraft(saved));
      setHasApiKey(Boolean(saved?.has_api_key));
      setMaskedApiKey(String(saved?.api_key_masked || ""));
      setUsage(saved?.usage || null);
      setHealth(saved?.health || null);
      setReadiness(saved?.readiness || null);
      setShowApiKey(false);
      setMessage(successMessage);
    } catch (error: any) {
      setMessage(error.message || "Could not save WhatsApp settings.");
    } finally {
      setBusy(false);
    }
  }

  const eligibleTestFlows = getEligibleTestFlows(draft, flowOptions);
  const eligibleCustomTemplates = getEligibleCustomTemplates(draft);
  const visibleFlowOptions = flowOptions.filter(
    (flow) => !isDeletedBuiltInTemplate(draft, flow.key),
  );
  const visibleFlowOptionsByStatus = [...visibleFlowOptions].sort(
    (left, right) => {
      const leftEnabled = Boolean(draft.flows[left.key]);
      const rightEnabled = Boolean(draft.flows[right.key]);
      if (leftEnabled === rightEnabled) return 0;
      return leftEnabled ? -1 : 1;
    },
  );
  const visibleCustomTemplatesByStatus = [...draft.customTemplates].sort(
    (left, right) => {
      if (left.enabled === right.enabled) return 0;
      return left.enabled ? -1 : 1;
    },
  );

  function openAddTemplate() {
    setNewTemplate(newTemplateInitialState);
    setAddTemplateOpen(true);
  }

  function addNewTemplateField(fieldKey: string) {
    setNewTemplate((current) => ({
      ...current,
      parameters:
        current.parameters.length >= MAX_TEMPLATE_PARAMETERS
          ? current.parameters
          : [...current.parameters, fieldKey],
    }));
  }

  function removeNewTemplateField(index: number) {
    setNewTemplate((current) => ({
      ...current,
      parameters: current.parameters.filter(
        (_field, fieldIndex) => fieldIndex !== index,
      ),
    }));
  }

  function moveNewTemplateField(index: number, direction: -1 | 1) {
    setNewTemplate((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.parameters.length) return current;
      const parameters = [...current.parameters];
      [parameters[index], parameters[target]] = [
        parameters[target],
        parameters[index],
      ];
      return { ...current, parameters };
    });
  }

  function addNotificationTemplate(event: React.FormEvent) {
    event.preventDefault();
    const name = newTemplate.name.trim();
    const englishIdentifier = newTemplate.englishIdentifier.trim();
    if (!name || !englishIdentifier || newTemplate.parameters.length === 0)
      return;
    setDraft((current) =>
      addNotificationTemplateToDraft(current, newTemplate, flowOptions),
    );
    setAddTemplateOpen(false);
  }

  function updateCustomTemplate(
    templateId: string,
    updates: Partial<WhatsAppCustomTemplate>,
  ) {
    setDraft((current) => updateCustomTemplateInDraft(current, templateId, updates));
  }

  async function removeCustomTemplate(templateId: string) {
    const template = draft.customTemplates.find(
      (item) => item.id === templateId,
    );
    const confirmed = confirmTemplateDelete(
      template?.name || "this WhatsApp template",
    );
    if (!confirmed) return;
    const nextDraft = removeCustomTemplateFromDraft(draft, templateId);
    setDraft(nextDraft);
    await saveSettings(nextDraft, "Template deleted.");
  }

  async function deleteBuiltInTemplate(flowKey: WhatsAppFlowKey) {
    const flow = flowOptions.find((item) => item.key === flowKey);
    const confirmed = confirmTemplateDelete(
      flow?.label || "this WhatsApp template",
    );
    if (!confirmed) return;
    const nextDraft = deleteBuiltInTemplateFromDraft(draft, flowKey);
    setDraft(nextDraft);
    await saveSettings(nextDraft, "Template deleted.");
  }

  const addCustomTemplateField = (templateId: string, fieldKey: string) =>
    setDraft((current) =>
      addCustomTemplateFieldInDraft(current, templateId, fieldKey, MAX_TEMPLATE_PARAMETERS),
    );

  const removeCustomTemplateField = (templateId: string, index: number) =>
    setDraft((current) => removeCustomTemplateFieldInDraft(current, templateId, index));

  const moveCustomTemplateField = (
    templateId: string,
    index: number,
    direction: -1 | 1,
  ) =>
    setDraft((current) =>
      moveCustomTemplateFieldInDraft(current, templateId, index, direction),
    );

  const activeTemplates = getActiveTemplates(draft, activeTemplateLanguage);
  const missingLocalizedCount = getMissingLocalizedCount(
    draft,
    activeTemplateLanguage,
    activeTemplates,
    flowOptions,
  );
  const {
    testTemplateIdentifier,
    testParameterLabels,
    recipientNameParamIndex,
  } = getTestTemplateContext(draft, testDraft);

  function openTestMessage() {
    const firstCustomTemplate = eligibleCustomTemplates[0];
    const firstFlow = eligibleTestFlows[0]?.key;
    if (firstCustomTemplate) {
      setTestDraft(
        createCustomTemplateTestDraft(firstCustomTemplate, draft.defaultLanguage),
      );
    } else if (firstFlow) {
      setTestDraft(
        createTestDraft(
          firstFlow,
          draft.fieldCatalog,
          draft.templateFieldMappings,
          draft.defaultLanguage,
          draft.appointmentViewUrl,
        ),
      );
    } else {
      setMessage(
        "Enable and save at least one notification template before testing.",
      );
      return;
    }
    setTestMessage("");
    setTestOpen(true);
  }

  function selectTestFlow(flowKey: WhatsAppFlowKey) {
    setTestDraft((current) => ({
      ...createTestDraft(
        flowKey,
        draft.fieldCatalog,
        draft.templateFieldMappings,
        current.language,
        draft.appointmentViewUrl,
      ),
      mobile: current.mobile,
    }));
  }

  function selectTestCustomTemplate(templateId: string) {
    const template = draft.customTemplates.find(
      (item) => item.id === templateId,
    );
    if (!template) return;
    setTestDraft((current) => ({
      ...createCustomTemplateTestDraft(template, current.language),
      mobile: current.mobile,
    }));
  }

  function selectTestOption(value: string) {
    if (value.startsWith("custom:")) {
      selectTestCustomTemplate(value.slice("custom:".length));
    } else {
      selectTestFlow(value as WhatsAppFlowKey);
    }
  }

  async function sendTestMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!apiSession || !effectiveTenantId) return;
    setTestBusy(true);
    setTestMessage("");
    try {
      const scopedSession = { ...apiSession, tenantId: effectiveTenantId };
      const result = await sendWhatsAppTest(scopedSession, {
        mobile: testDraft.mobile.trim(),
        recipient_name: testDraft.recipientName.trim(),
        flow_key: testDraft.customTemplateId ? null : testDraft.flowKey,
        custom_template_id: testDraft.customTemplateId || null,
        language: testDraft.language,
        template_parameters: testDraft.parameters.map((value) => value.trim()),
        media_url: testDraft.mediaUrl.trim() || null,
        media_filename: testDraft.mediaUrl.trim()
          ? testDraft.mediaFilename.trim() || "invoice.pdf"
          : null,
      });
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
      <Card className="relative px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm">
        {initialLoading && <OverlayLoader />}
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
            <Badge
              tone={draft.enabled ? "green" : "slate"}
              className="normal-badge"
            >
              {draft.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <WhatsAppSwitch
              label="Enable WhatsApp integration"
              checked={draft.enabled}
              onChange={(checked) => update("enabled", checked)}
            />
          </div>
        </div>

        <WhatsAppReadinessPanel readiness={readiness} />
        <WhatsAppUsagePanel usage={usage} />
        <WhatsAppHealthPanel health={health} />

        <WhatsAppApiConnectionSection
          draft={draft}
          update={update}
          showApiKey={showApiKey}
          setShowApiKey={setShowApiKey}
          hasApiKey={hasApiKey}
          maskedApiKey={maskedApiKey}
        />

        <WhatsAppRecipientControls draft={draft} update={update} />

        <WhatsAppTemplatesSection
          draft={draft}
          activeTemplateLanguage={activeTemplateLanguage}
          setActiveTemplateLanguage={setActiveTemplateLanguage}
          showAllTemplates={showAllTemplates}
          setShowAllTemplates={setShowAllTemplates}
          openAddTemplate={openAddTemplate}
          setTemplate={setTemplate}
          addTemplateField={addTemplateField}
          removeTemplateField={removeTemplateField}
          moveTemplateField={moveTemplateField}
          setFlow={setFlow}
          update={update}
          changeDefaultLanguage={changeDefaultLanguage}
          updateCustomTemplate={updateCustomTemplate}
          removeCustomTemplate={removeCustomTemplate}
          deleteBuiltInTemplate={deleteBuiltInTemplate}
          addCustomTemplateField={addCustomTemplateField}
          removeCustomTemplateField={removeCustomTemplateField}
          moveCustomTemplateField={moveCustomTemplateField}
          activeTemplates={activeTemplates}
          missingLocalizedCount={missingLocalizedCount}
          visibleFlowOptions={visibleFlowOptions}
          visibleFlowOptionsByStatus={visibleFlowOptionsByStatus}
          visibleCustomTemplatesByStatus={visibleCustomTemplatesByStatus}
        />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Test messages use the last saved tenant configuration and are sent
            to the number entered in the test window.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openTestMessage}
              disabled={
                busy ||
                testBusy ||
                !apiSession ||
                !effectiveTenantId ||
                !draft.enabled ||
                !hasApiKey
              }
              title={
                !draft.enabled || !hasApiKey
                  ? "Enable and save the connection first"
                  : undefined
              }
              className="close-button font-bold disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Send Test Message
            </button>
            <Button
              type="button"
              onClick={saveSettings}
              disabled={busy || !apiSession || !effectiveTenantId}
              className="save-button"
            >
              <ButtonLoader loading={busy}>
                {busy ? "Saving..." : "Save WhatsApp Settings"}
              </ButtonLoader>
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
      <WhatsAppAddTemplateModal
        open={addTemplateOpen}
        onClose={() => setAddTemplateOpen(false)}
        newTemplate={newTemplate}
        setNewTemplate={setNewTemplate}
        fieldCatalog={draft.fieldCatalog}
        onSubmit={addNotificationTemplate}
        onAddField={addNewTemplateField}
        onRemoveField={removeNewTemplateField}
        onMoveField={moveNewTemplateField}
      />
      <WhatsAppTestMessageModal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        testBusy={testBusy}
        testDraft={testDraft}
        setTestDraft={setTestDraft}
        testMessage={testMessage}
        draft={draft}
        eligibleTestFlows={eligibleTestFlows}
        eligibleCustomTemplates={eligibleCustomTemplates}
        testTemplateIdentifier={testTemplateIdentifier}
        testParameterLabels={testParameterLabels}
        recipientNameParamIndex={recipientNameParamIndex}
        onSelectOption={selectTestOption}
        onSubmit={sendTestMessage}
      />
    </>
  );
}
