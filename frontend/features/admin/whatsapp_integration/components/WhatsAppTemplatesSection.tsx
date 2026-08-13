import { Plus, Trash2 } from "lucide-react";
import { FormField } from "@/app/components/FormElements";
import { Input, Select } from "@/app/components/common/ui";
import { TenantPicker } from "@/features/superAdmin/components/shared/TenantPicker";
import { WhatsAppSwitch } from "./WhatsAppSwitch";
import { flowOptions, languageOptions, MAX_TEMPLATE_PARAMETERS } from "../../constants";
import { WhatsAppCustomTemplate, WhatsAppFlowKey, WhatsAppLanguage, WhatsAppSettingsDraft } from "../../types";
import { TemplateFieldPicker } from "../../components/TemplateFieldPicker";

type FlowOption = {
  key: WhatsAppFlowKey;
  label: string;
  description: string;
  audience: "patient" | "doctor";
};

export function WhatsAppTemplatesSection({
  draft,
  activeTemplateLanguage,
  setActiveTemplateLanguage,
  showAllTemplates,
  setShowAllTemplates,
  openAddTemplate,
  setTemplate,
  addTemplateField,
  removeTemplateField,
  moveTemplateField,
  setFlow,
  update,
  changeDefaultLanguage,
  updateCustomTemplate,
  removeCustomTemplate,
  deleteBuiltInTemplate,
  addCustomTemplateField,
  removeCustomTemplateField,
  moveCustomTemplateField,
  activeTemplates,
  missingLocalizedCount,
  visibleFlowOptions,
  visibleFlowOptionsByStatus,
  visibleCustomTemplatesByStatus,
}: {
  draft: WhatsAppSettingsDraft;
  activeTemplateLanguage: WhatsAppLanguage;
  setActiveTemplateLanguage: (language: WhatsAppLanguage) => void;
  showAllTemplates: boolean;
  setShowAllTemplates: (updater: (current: boolean) => boolean) => void;
  openAddTemplate: () => void;
  setTemplate: (flowKey: WhatsAppFlowKey, value: string) => void;
  addTemplateField: (flowKey: WhatsAppFlowKey, fieldKey: string) => void;
  removeTemplateField: (flowKey: WhatsAppFlowKey, index: number) => void;
  moveTemplateField: (
    flowKey: WhatsAppFlowKey,
    index: number,
    direction: -1 | 1,
  ) => void;
  setFlow: (flowKey: WhatsAppFlowKey, value: boolean) => void;
  update: <K extends keyof WhatsAppSettingsDraft>(
    key: K,
    value: WhatsAppSettingsDraft[K],
  ) => void;
  changeDefaultLanguage: (language: WhatsAppLanguage) => void;
  updateCustomTemplate: (
    templateId: string,
    updates: Partial<WhatsAppCustomTemplate>,
  ) => void;
  removeCustomTemplate: (templateId: string) => void;
  deleteBuiltInTemplate: (flowKey: WhatsAppFlowKey) => void;
  addCustomTemplateField: (templateId: string, fieldKey: string) => void;
  removeCustomTemplateField: (templateId: string, index: number) => void;
  moveCustomTemplateField: (
    templateId: string,
    index: number,
    direction: -1 | 1,
  ) => void;
  activeTemplates: Record<WhatsAppFlowKey, string>;
  missingLocalizedCount: number;
  visibleFlowOptions: FlowOption[];
  visibleFlowOptionsByStatus: FlowOption[];
  visibleCustomTemplatesByStatus: WhatsAppCustomTemplate[];
}) {
  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h4 className="card-title font-bold text-slate-800">
            Notification templates
          </h4>
          <p className="mt-1 card-desc text-slate-500">
            Configure separate approved identifiers for English and Tamil.
            Patient messages use the language selected in the patient record;
            a missing Tamil identifier falls back to the tenant default.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddTemplate}
          disabled={!draft.enabled}
          className="close-button inline-flex shrink-0 items-center gap-2 font-bold disabled:cursor-not-allowed disabled:text-slate-400"
        >
          <Plus size={15} />
          Add Notification Template
        </button>
      </div>
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
              setActiveTemplateLanguage(event.target.value as WhatsAppLanguage)
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
        {(showAllTemplates
          ? visibleFlowOptionsByStatus
          : visibleFlowOptionsByStatus.slice(0, 4)
        ).map((flow) => {
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => deleteBuiltInTemplate(flow.key)}
                    disabled={!draft.enabled}
                    aria-label={`Delete ${flow.label}`}
                    title="Delete template configuration"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                  </button>
                  <WhatsAppSwitch
                    label={flow.label}
                    checked={draft.flows[flow.key]}
                    onChange={(checked) => setFlow(flow.key, checked)}
                    disabled={disabled}
                  />
                </div>
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
              {activeTemplateLanguage === draft.defaultLanguage && (
                <div className="mt-3">
                  <TemplateFieldPicker
                    fields={draft.fieldCatalog[flow.key] || []}
                    selected={
                      draft.templateFieldMappings[flow.key] ||
                      (draft.fieldCatalog[flow.key] || []).map((f) => f.key)
                    }
                    onToggle={(fieldKey) => addTemplateField(flow.key, fieldKey)}
                    onRemove={(index) => removeTemplateField(flow.key, index)}
                    onMove={(index, direction) =>
                      moveTemplateField(flow.key, index, direction)
                    }
                    disabled={disabled || !draft.flows[flow.key]}
                    max={MAX_TEMPLATE_PARAMETERS}
                  />
                </div>
              )}
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
                      <WhatsAppSwitch
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
      {visibleFlowOptions.length > 4 && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            className="close-button font-bold text-emerald-700"
            aria-expanded={showAllTemplates}
            onClick={() => setShowAllTemplates((current) => !current)}
          >
            {showAllTemplates
              ? "Show fewer automatic templates"
              : `Show ${visibleFlowOptions.length - 4} more automatic templates`}
          </button>
        </div>
      )}
      {visibleCustomTemplatesByStatus.length > 0 && (
        <div className="mt-5 border-t border-slate-200 pt-5">
          <h5 className="text-sm font-bold text-slate-800">
            Custom notification templates
          </h5>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {visibleCustomTemplatesByStatus.map((template) => {
              const audienceEnabled =
                template.audience === "doctor"
                  ? draft.doctorNotificationsEnabled
                  : template.audience === "patient"
                    ? draft.patientNotificationsEnabled
                    : true;
              const disabled = !draft.enabled || !audienceEnabled;
              return (
                <div
                  key={template.id}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {template.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {template.description ||
                          `Custom ${template.audience} template`}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        Sends on:{" "}
                        {flowOptions.find(
                          (flow) => flow.key === template.trigger_key,
                        )?.label || template.trigger_key}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {template.parameters.length === 0 && (
                          <span className="text-[11px] font-semibold text-amber-600">
                            No fields selected yet
                          </span>
                        )}
                        {template.parameters.map((fieldKey, index) => {
                          const field = (
                            draft.fieldCatalog[template.trigger_key] || []
                          ).find((option) => option.key === fieldKey);
                          return (
                            <span
                              key={`${fieldKey}-${index}`}
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                            >
                              {`{{${index + 1}}} ${field?.label || fieldKey}`}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => removeCustomTemplate(template.id)}
                        aria-label={`Remove ${template.name}`}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                      <WhatsAppSwitch
                        label={template.name}
                        checked={template.enabled}
                        onChange={(enabled) =>
                          updateCustomTemplate(template.id, { enabled })
                        }
                        disabled={disabled}
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <FormField label="Template / Campaign Identifier">
                      <Input
                        value={template.identifiers[activeTemplateLanguage] || ""}
                        onChange={(event: any) =>
                          updateCustomTemplate(template.id, {
                            identifiers: {
                              ...template.identifiers,
                              [activeTemplateLanguage]: event.target.value,
                            },
                          })
                        }
                        placeholder={
                          activeTemplateLanguage === draft.defaultLanguage
                            ? "Enter approved identifier"
                            : "Optional — falls back to tenant default"
                        }
                        disabled={disabled || !template.enabled}
                      />
                    </FormField>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <FormField label="Template name">
                      <Input
                        value={template.name}
                        onChange={(event: any) =>
                          updateCustomTemplate(template.id, {
                            name: event.target.value,
                          })
                        }
                        disabled={disabled}
                      />
                    </FormField>
                    <FormField label="Description">
                      <Input
                        value={template.description}
                        onChange={(event: any) =>
                          updateCustomTemplate(template.id, {
                            description: event.target.value,
                          })
                        }
                        placeholder="When or why this template is used"
                        disabled={disabled}
                      />
                    </FormField>
                  </div>
                  {activeTemplateLanguage === draft.defaultLanguage && (
                    <div className="mt-3">
                      <TemplateFieldPicker
                        fields={draft.fieldCatalog[template.trigger_key] || []}
                        selected={template.parameters}
                        onToggle={(fieldKey) =>
                          addCustomTemplateField(template.id, fieldKey)
                        }
                        onRemove={(index) =>
                          removeCustomTemplateField(template.id, index)
                        }
                        onMove={(index, direction) =>
                          moveCustomTemplateField(template.id, index, direction)
                        }
                        disabled={disabled}
                        max={MAX_TEMPLATE_PARAMETERS}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
