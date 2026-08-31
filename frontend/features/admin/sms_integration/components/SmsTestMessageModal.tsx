import { FormField } from "@/app/components/FormElements";
import { Modal } from "@/app/components/common/Modal";
import { Button, Input, Select } from "@/app/components/common/ui";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { flowOptions } from "../constants";
import { SmsSettingsDraft, SmsTestDraft } from "../types";

export function SmsTestMessageModal({
  open,
  onClose,
  busy,
  message,
  draft,
  testDraft,
  setTestDraft,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  message: string;
  draft: SmsSettingsDraft;
  testDraft: SmsTestDraft;
  setTestDraft: (updater: (current: SmsTestDraft) => SmsTestDraft) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const enabledTemplates = draft.flows.filter(
    (template) => template.enabled && template.approvedByProvider,
  );
  const selectedTemplate = draft.flows.find(
    (template) => template.id === testDraft.templateId && template.enabled,
  );
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="Send test SMS"
      description="Sends the selected saved DLT template through the tenant SMSCountry connection."
      maxWidth="lg"
      closeOnBackdrop={!busy}
    >
      <form onSubmit={onSubmit} className="space-y-4">
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
          <FormField label="Notification flow">
            <Select
              value={testDraft.templateId}
              onChange={(event: any) => {
                const template = enabledTemplates.find(
                  (item) => item.id === event.target.value,
                );
                if (!template) return;
                setTestDraft((current) => ({
                  ...current,
                  templateId: template.id,
                  flowKey: template.flowKey,
                  language: template.language,
                  variables: Object.fromEntries(
                    template.variableKeys.map((key) => [key, ""]),
                  ),
                }));
              }}
            >
              {enabledTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {flowOptions.find((flow) => flow.key === template.flowKey)?.label ||
                    template.flowKey} · {template.language.toUpperCase()}
                  {template.name ? ` · ${template.name}` : ""}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(selectedTemplate?.variableKeys || []).map((key) => (
            <FormField key={key} label={key.replaceAll("_", " ")}>
              <Input
                required
                value={testDraft.variables[key] || ""}
                onChange={(event: any) =>
                  setTestDraft((current) => ({
                    ...current,
                    variables: { ...current.variables, [key]: event.target.value },
                  }))
                }
              />
            </FormField>
          ))}
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          This sends a real SMS and counts toward segment usage. Verify the number before continuing.
        </div>
        {message && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{message}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="close-button" onClick={onClose} disabled={busy}>Cancel</button>
          <Button type="submit" disabled={busy || enabledTemplates.length === 0}>
            <ButtonLoader loading={busy}>{busy ? "Sending..." : "Send test SMS"}</ButtonLoader>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
