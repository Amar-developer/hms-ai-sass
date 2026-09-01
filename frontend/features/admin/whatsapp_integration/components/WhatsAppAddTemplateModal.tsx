import { FormField } from "@/app/components/FormElements";
import { Button, Input, Select } from "@/app/components/common/ui";
import { Modal } from "@/app/components/common/Modal";
import { TemplateFieldPicker } from "../../components/TemplateFieldPicker";
import { WhatsAppFlowKey, WhatsAppSettingsDraft } from "../../types";
import { flowOptions, MAX_TEMPLATE_PARAMETERS } from "../../constants";

export type NewTemplateState = {
  name: string;
  description: string;
  triggerKey: WhatsAppFlowKey;
  parameters: string[];
  englishIdentifier: string;
  tamilIdentifier: string;
};

export function WhatsAppAddTemplateModal({
  open,
  onClose,
  newTemplate,
  setNewTemplate,
  fieldCatalog,
  onSubmit,
  onAddField,
  onRemoveField,
  onMoveField,
}: {
  open: boolean;
  onClose: () => void;
  newTemplate: NewTemplateState;
  setNewTemplate: (
    updater: (current: NewTemplateState) => NewTemplateState,
  ) => void;
  fieldCatalog: WhatsAppSettingsDraft["fieldCatalog"];
  onSubmit: (event: React.FormEvent) => void;
  onAddField: (fieldKey: string) => void;
  onRemoveField: (index: number) => void;
  onMoveField: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Notification Template"
      description="Create a custom WhatsApp template manually. Enter the approved provider identifiers used for each language."
      maxWidth="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Template name" required>
          <Input
            value={newTemplate.name}
            onChange={(event: any) =>
              setNewTemplate((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder="Enter notification template name"
            required
          />
        </FormField>
        <FormField label="Description">
          <Input
            value={newTemplate.description}
            onChange={(event: any) =>
              setNewTemplate((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            placeholder="When or why this template is used"
          />
        </FormField>
        <FormField
          label="Trigger event"
          hint="The real event determines the recipient. If another enabled custom template already uses this trigger, this one will replace it once enabled."
        >
          <Select
            value={newTemplate.triggerKey}
            onChange={(event: any) =>
              setNewTemplate((current) => ({
                ...current,
                triggerKey: event.target.value as WhatsAppFlowKey,
                parameters: [],
              }))
            }
          >
            {flowOptions.map((flow) => (
              <option key={flow.key} value={flow.key}>
                {flow.label}
              </option>
            ))}
          </Select>
        </FormField>
        <div>
          <TemplateFieldPicker
            fields={fieldCatalog[newTemplate.triggerKey] || []}
            selected={newTemplate.parameters}
            onToggle={onAddField}
            onRemove={onRemoveField}
            onMove={onMoveField}
            max={MAX_TEMPLATE_PARAMETERS}
            // Picking fields is the point of this dialog, so skip the collapse.
            defaultOpen
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="English identifier" required>
            <Input
              value={newTemplate.englishIdentifier}
              onChange={(event: any) =>
                setNewTemplate((current) => ({
                  ...current,
                  englishIdentifier: event.target.value,
                }))
              }
              placeholder="Enter approved English identifier"
              required
            />
          </FormField>
          <FormField label="Tamil identifier">
            <Input
              value={newTemplate.tamilIdentifier}
              onChange={(event: any) =>
                setNewTemplate((current) => ({
                  ...current,
                  tamilIdentifier: event.target.value,
                }))
              }
              placeholder="Optional Tamil identifier"
            />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="close-button font-bold"
          >
            Cancel
          </button>
          <Button
            type="submit"
            disabled={
              !newTemplate.name.trim() ||
              !newTemplate.englishIdentifier.trim() ||
              newTemplate.parameters.length === 0
            }
          >
            Add Template
          </Button>
        </div>
      </form>
    </Modal>
  );
}
