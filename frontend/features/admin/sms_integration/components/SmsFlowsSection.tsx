import { MessageSquareText, Plus, Trash2 } from "lucide-react";
import { FormField } from "@/app/components/FormElements";
import { Badge, Input, Select } from "@/app/components/common/ui";

import {
  classificationOptions,
  consentBasisOptions,
  flowOptions,
} from "../constants";
import { SmsFlowKey, SmsSettingsDraft, SmsTemplateDraft } from "../types";
import { SmsCheckbox } from "./SmsCheckbox";
import { SmsSwitch } from "./SmsSwitch";

/** Counts the {#var#} style placeholders a DLT-registered body declares. */
export function countTemplateVariables(body: string): number {
  return (body.match(/\{#var#\}/g) || []).length;
}

function confirmTemplateDelete(label: string): boolean {
  const message = `Delete "${label}"?\n\nThis will remove this SMS template configuration immediately. Existing sent messages will not be affected.`;
  try {
    return window.confirm(message) !== false;
  } catch {
    return true;
  }
}

function TemplateCard({
  template,
  eventLabel,
  setTemplate,
  setVariableKeys,
  onEnable,
  onDelete,
}: {
  template: SmsTemplateDraft;
  eventLabel: string;
  setTemplate: (templateId: string, updates: Partial<SmsTemplateDraft>) => void;
  setVariableKeys: (templateId: string, rawValue: string) => void;
  onEnable: (templateId: string) => void;
  onDelete: (templateId: string) => void;
}) {
  const declaredVariables = countTemplateVariables(template.registeredBody);
  const variableMismatch =
    template.registeredBody.trim().length > 0 &&
    declaredVariables !== template.variableKeys.length;

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {template.enabled && template.approvedByProvider && (
              <Badge tone="green" className="normal-badge">
                Approved
              </Badge>
            )}
          </div>
          <div className="mt-1 max-w-xs">
            <Input
              value={template.name}
              onChange={(event: any) =>
                setTemplate(template.id, { name: event.target.value })
              }
              placeholder={`${eventLabel} template name`}
              className="text-xs font-bold"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SmsSwitch
            label={`Enable ${eventLabel} template${
              template.name ? `: ${template.name}` : ""
            }`}
            checked={template.enabled}
            onChange={(checked) =>
              checked
                ? onEnable(template.id)
                : setTemplate(template.id, { enabled: false })
            }
          />
          <button
            type="button"
            onClick={() =>
              confirmTemplateDelete(template.name || eventLabel) &&
              onDelete(template.id)
            }
            aria-label={`Delete ${template.name || eventLabel} template`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FormField label="DLT Template ID">
          <Input
            value={template.dltTemplateId}
            onChange={(event: any) =>
              setTemplate(template.id, { dltTemplateId: event.target.value })
            }
            placeholder="Registered content template ID"
          />
        </FormField>
        <FormField label="Classification">
          <Select
            value={template.classification}
            onChange={(event: any) =>
              setTemplate(template.id, { classification: event.target.value })
            }
          >
            {classificationOptions.map(([value, optionLabel]) => (
              <option key={value} value={value}>
                {optionLabel}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Consent Basis">
          <Select
            value={template.consentBasis}
            onChange={(event: any) =>
              setTemplate(template.id, { consentBasis: event.target.value })
            }
          >
            {consentBasisOptions.map(([value, optionLabel]) => (
              <option key={value} value={value}>
                {optionLabel}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Variable Keys (comma separated)">
          <Input
            value={template.variableKeys.join(", ")}
            onChange={(event: any) =>
              setVariableKeys(template.id, event.target.value)
            }
            placeholder="patient_name, token_number"
          />
        </FormField>
        <div className="md:col-span-2">
          <FormField label="Registered Template Body">
            <textarea
              value={template.registeredBody}
              onChange={(event) =>
                setTemplate(template.id, { registeredBody: event.target.value })
              }
              rows={3}
              maxLength={1000}
              placeholder="Paste the exact body approved on the DLT portal, e.g. Dear {#var#}, your token is {#var#}."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500"
            />
          </FormField>
          <p className="mt-1 text-[11px] text-slate-500">
            {declaredVariables} placeholder(s) in the body ·{" "}
            {template.variableKeys.length} variable key(s) mapped.
          </p>
          {variableMismatch && (
            <p className="mt-1 text-[11px] font-bold text-amber-700">
              The number of variable keys does not match the placeholders in the
              registered body.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3">
        <SmsCheckbox
          label="Approved by provider"
          hint="SMSCountry has confirmed this template is live against the DLT entity."
          checked={template.approvedByProvider}
          onChange={(checked) =>
            setTemplate(template.id, { approvedByProvider: checked })
          }
        />
      </div>
    </div>
  );
}

export function SmsFlowsSection({
  draft,
  setTemplate,
  setVariableKeys,
  enableTemplate,
  addTemplate,
  removeTemplate,
}: {
  draft: SmsSettingsDraft;
  setTemplate: (templateId: string, updates: Partial<SmsTemplateDraft>) => void;
  setVariableKeys: (templateId: string, rawValue: string) => void;
  enableTemplate: (templateId: string) => void;
  addTemplate: (flowKey: SmsFlowKey) => void;
  removeTemplate: (templateId: string) => void;
}) {
  const enabledEventCount = new Set(
    draft.flows.filter((flow) => flow.enabled).map((flow) => flow.flowKey),
  ).size;

  return (
    <div className="mt-5 rounded-xl border border-slate-200 p-4">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-slate-500" />
          <div>
            <h4 className="card-title font-bold text-slate-800">
              P0 SMS workflows
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Register one or more DLT-approved templates per workflow. Only
              one template per workflow may be enabled at a time.
            </p>
          </div>
        </div>
        <Badge
          tone={enabledEventCount ? "green" : "slate"}
          className="normal-badge"
        >
          {enabledEventCount} / {flowOptions.length} enabled
        </Badge>
      </div>
      <div className="grid gap-5">
        {flowOptions.map((event) => {
          const templates = draft.flows.filter(
            (flow) => flow.flowKey === event.key,
          );
          return (
            <div key={event.key}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h5 className="text-xs font-bold text-slate-800">
                    {event.label}
                  </h5>
                  <p className="text-[11px] text-slate-500">{event.hint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => addTemplate(event.key)}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
                >
                  <Plus className="h-3 w-3" />
                  Add Template
                </button>
              </div>
              <div className="grid gap-3">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    eventLabel={event.label}
                    setTemplate={setTemplate}
                    setVariableKeys={setVariableKeys}
                    onEnable={enableTemplate}
                    onDelete={removeTemplate}
                  />
                ))}
                {templates.length === 0 && (
                  <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500">
                    No template registered yet for this workflow.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
