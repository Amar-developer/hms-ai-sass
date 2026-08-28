import { useEffect, useState } from "react";
import {
  Activity,
  KeyRound,
  ListChecks,
  MessageCircleMore,
  MessagesSquare,
  Send,
  UsersRound,
} from "lucide-react";

import { Badge, Button, StatusToast } from "@/app/components/common/ui";
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
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<
    "overview" | "connection" | "recipients" | "templates" | "delivery"
  >("overview");
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
    // Not setBusy(true) here: `busy` also drives the Save Settings button's
    // loading state, and this effect re-runs on every visit to the page —
    // sharing the flag made Save show its "Saving..." spinner on load even
    // though nothing was being saved. initialLoading (the overlay) already
    // covers this fetch.
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

  const enabledTemplateCount = Object.values(draft.flows).filter(Boolean).length;
  const workspaceTabs = [
    {
      id: "overview" as const,
      label: "Overview",
      icon: Activity,
      count: Number(readiness?.blockers || readiness?.warnings || 0),
    },
    { id: "connection" as const, label: "API Connection", icon: KeyRound },
    {
      id: "recipients" as const,
      label: "Recipients",
      icon: UsersRound,
      count: draft.adminRecipientUserIds.length,
    },
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
          <div className="flex items-center gap-2 w-1/2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-brand">
              <MessageCircleMore className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-950">
                WhatsApp Workspace
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Connection, recipients, templates and delivery operations in one workspace
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-center w-1/2">
            <Badge
              tone={draft.enabled ? "green" : "slate"}
              className="normal-label"
            >
              {draft.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <WhatsAppSwitch
              label="Enable WhatsApp integration"
              checked={draft.enabled}
              onChange={(checked) => update("enabled", checked)}
            />
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <button
              type="button"
              onClick={openTestMessage}
              disabled={
                busy ||
                testBusy ||
                initialLoading ||
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
              className="close-button inline-flex h-9 items-center gap-2 px-2 text-xs font-bold disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <Send className="h-4 w-4" />
              Test Message
            </button>
            <Button
              type="button"
              onClick={saveSettings}
              disabled={busy || initialLoading || !apiSession || !effectiveTenantId}
              className="save-button w-44 h-9 px-4 text-xs"
            >
              <ButtonLoader loading={busy}>
                {busy ? "Saving Settings..." : "Save Settings"}
              </ButtonLoader>
            </Button>
          </div>
        </div>

        <nav
          className="scrollbar-hidden flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
          aria-label="WhatsApp workspace sections"
          role="tablist"
        >
          {workspaceTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeWorkspaceTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveWorkspaceTab(tab.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition-colors ${
                  active
                    ? "bg-brand text-brand-fg"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {Boolean(tab.count) && (
                  <span
                    className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] ${
                      active
                        ? "bg-white/20 text-brand-fg"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </section>

      <section
        className={activeWorkspaceTab === "overview" ? "space-y-3" : "hidden"}
      >
        <WhatsAppReadinessPanel readiness={readiness} />
        <div className="grid gap-3 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
          <WhatsAppUsagePanel usage={usage} />
          <WhatsAppHealthPanel health={health} />
        </div>
      </section>

      <section className={activeWorkspaceTab === "connection" ? "block" : "hidden"}>
        <WhatsAppApiConnectionSection
          draft={draft}
          update={update}
          showApiKey={showApiKey}
          setShowApiKey={setShowApiKey}
          hasApiKey={hasApiKey}
          maskedApiKey={maskedApiKey}
        />
      </section>

      <section className={activeWorkspaceTab === "recipients" ? "block" : "hidden"}>
        <WhatsAppRecipientControls draft={draft} update={update} />
      </section>

      <section className={activeWorkspaceTab === "templates" ? "block" : "hidden"}>
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
      </section>

      {activeWorkspaceTab === "delivery" && apiSession && effectiveTenantId && (
        <WhatsAppDeliveryQueue
          apiSession={apiSession}
          tenantId={effectiveTenantId}
          onMessage={setMessage}
          workspaceMode
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
    </div>
  );
}
