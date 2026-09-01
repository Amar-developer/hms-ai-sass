import { FormField } from "@/app/components/FormElements";
import { Input, Select,Card, Button } from "@/app/components/common/ui";
import { modalities } from "../constants";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";

export function EquipmentPage({ equipment, onSubmit, busy }: any) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <Card>
        <h4 className="text-lg font-bold">Add Equipment</h4>
        <form onSubmit={onSubmit} className="mt-4 grid gap-3">
          <FormField label="Name">
            <Input name="name" placeholder="HMS Indotherm 500W" required />
          </FormField>
          <FormField label="Modality" required>
            <Select name="modality_type" required>
              {modalities.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Manufacturer">
              <Input name="manufacturer" placeholder="HMS" />
            </FormField>
            <FormField label="Model">
              <Input name="model_number" placeholder="DIGISTIM 202" />
            </FormField>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Serial Number">
              <Input name="serial_number" />
            </FormField>
            <FormField label="Portable">
              <Select name="is_portable">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Scope">
            <Select name="branch_scope">
              <option value="branch">Current Branch</option>
              <option value="tenant">All Branches</option>
            </Select>
          </FormField>
          <Button disabled={busy}>
            <ButtonLoader loading={busy}>
              {busy ? "Saving..." : "Save Equipment"}
            </ButtonLoader>
          </Button>
        </form>
      </Card>
      <Card>
        <h4 className="text-lg font-bold">Equipment Catalog</h4>
        <div className="mt-4 grid gap-3">
          {equipment.length === 0 && (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              No equipment saved yet.
            </p>
          )}
          {equipment.map((row: any) => (
            <div key={row.id} className="rounded-2xl bg-slate-50 p-4">
              <b>{row.name}</b>
              <p className="text-sm text-slate-500">
                {row.modality_type} · {row.is_portable ? "Portable" : "Fixed"} ·{" "}
                {row.model_number || "No model"}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
