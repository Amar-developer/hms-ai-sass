import { FormField } from "@/app/components/FormElements";
import { Button, Input, Select } from "@/app/components/common/ui";
import { Modal } from "@/app/components/common/Modal";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { WhatsAppCustomTemplate, WhatsAppFlowKey,
  WhatsAppLanguage,
  WhatsAppSettingsDraft,
  WhatsAppTestDraft, } from "../../types";
import { languageOptions } from "../../constants";

type FlowOption = { key: WhatsAppFlowKey; label: string };

export function WhatsAppTestMessageModal({
  open,
  onClose,
  testBusy,
  testDraft,
  setTestDraft,
  testMessage,
  draft,
  eligibleTestFlows,
  eligibleCustomTemplates,
  testTemplateIdentifier,
  testParameterLabels,
  recipientNameParamIndex,
  onSelectOption,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  testBusy: boolean;
  testDraft: WhatsAppTestDraft;
  setTestDraft: (
    updater: (current: WhatsAppTestDraft) => WhatsAppTestDraft,
  ) => void;
  testMessage: string;
  draft: WhatsAppSettingsDraft;
  eligibleTestFlows: FlowOption[];
  eligibleCustomTemplates: WhatsAppCustomTemplate[];
  testTemplateIdentifier: string;
  testParameterLabels: string[];
  recipientNameParamIndex: number;
  onSelectOption: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={() => !testBusy && onClose()}
      title="Send test template message"
      description="This sends a real message using the last saved tenant connection. The test number is not stored."
      maxWidth="lg"
      closeOnBackdrop={!testBusy}
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
                setTestDraft((current) => ({
                  ...current,
                  mobile: event.target.value,
                }))
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
                    index === recipientNameParamIndex
                      ? event.target.value
                      : value,
                  ),
                }))
              }
            />
          </FormField>
        </div>

        <FormField label="Notification flow">
          <Select
            value={
              testDraft.customTemplateId
                ? `custom:${testDraft.customTemplateId}`
                : testDraft.flowKey
            }
            onChange={(event: any) => onSelectOption(event.target.value)}
          >
            {eligibleTestFlows.map((flow) => (
              <option key={flow.key} value={flow.key}>
                {flow.label}
              </option>
            ))}
            {eligibleCustomTemplates.map((template) => (
              <option key={template.id} value={`custom:${template.id}`}>
                Custom: {template.name}
              </option>
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
          Saved template identifier:{" "}
          <span className="font-bold text-slate-800">
            {testTemplateIdentifier}
          </span>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Template values
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {testDraft.parameters.map((value, index) => (
              <FormField
                key={`${testDraft.customTemplateId || testDraft.flowKey}-${index}`}
                label={`{{${index + 1}}} ${testParameterLabels[index] || ""}`}
              >
                <Input
                  required
                  value={value}
                  disabled={index === recipientNameParamIndex}
                  onChange={(event: any) =>
                    setTestDraft((current) => ({
                      ...current,
                      parameters: current.parameters.map(
                        (item, parameterIndex) =>
                          parameterIndex === index ? event.target.value : item,
                      ),
                    }))
                  }
                />
              </FormField>
            ))}
          </div>
        </div>

        {(testDraft.flowKey === "invoice_paid_patient" ||
          testDraft.flowKey === "lab_report_ready_patient") && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField
                label={
                  testDraft.flowKey === "invoice_paid_patient"
                    ? "Public invoice PDF URL"
                    : "Public document URL"
                }
                hint={
                  testDraft.flowKey === "lab_report_ready_patient"
                    ? "Required if your approved template has a document/media header (check the template type on your WhatsApp provider's dashboard) — a Document-type template without an attachment is rejected."
                    : undefined
                }
              >
                <Input
                  required={testDraft.flowKey === "invoice_paid_patient"}
                  type="url"
                  placeholder="https://files.example.com/document.pdf"
                  value={testDraft.mediaUrl}
                  onChange={(event: any) =>
                    setTestDraft((current) => ({
                      ...current,
                      mediaUrl: event.target.value,
                    }))
                  }
                />
              </FormField>
            </div>
            <FormField label="Attachment filename">
              <Input
                value={testDraft.mediaFilename}
                disabled={!testDraft.mediaUrl.trim()}
                onChange={(event: any) =>
                  setTestDraft((current) => ({
                    ...current,
                    mediaFilename: event.target.value,
                  }))
                }
              />
            </FormField>
          </div>
        )}

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Sending this test may count toward your messaging account usage.
          Verify the recipient number before continuing.
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
            onClick={onClose}
          >
            Cancel
          </button>
          <Button type="submit" disabled={testBusy}>
            <ButtonLoader loading={testBusy}>
              {testBusy ? "Sending..." : "Send Test Message"}
            </ButtonLoader>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
