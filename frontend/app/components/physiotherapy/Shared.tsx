import { modalities } from "@/utils/physiotherapy/constants";
import { FormField } from "../FormElements";
import { Input,Card,Select,Button } from "../common/ui";
import { useState } from "react";
import { today } from "@/utils/physiotherapy/helpers";

export function CaseFields() {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <FormField label="Body Region">
          <Input
            name="body_region"
            placeholder="Knee, shoulder, lumbar spine"
          />
        </FormField>
        <FormField label="Pain Score">
          <Input name="pain_score" type="number" min="0" max="10" />
        </FormField>
        <FormField label="Assessment Date">
          <Input name="assessment_date" type="date" defaultValue={today()} />
        </FormField>
      </div>
      <FormField label="Condition">
        <Input
          name="condition"
          placeholder="Chronic pain, post-surgery, sports injury, arthritis"
        />
      </FormField>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Range Of Motion">
          <Input name="range_of_motion" />
        </FormField>
        <FormField label="Muscle Strength">
          <Input name="muscle_strength" />
        </FormField>
      </div>
      <FormField label="Treatment Goal">
        <Input
          name="treatment_goal"
          placeholder="Pain relief, mobility, strengthening, joint rehabilitation"
        />
      </FormField>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Planned Sessions">
          <Input
            name="planned_sessions"
            type="number"
            min="1"
            defaultValue="6"
          />
        </FormField>
        <FormField label="Frequency">
          <Input name="frequency" placeholder="Daily / 3 days per week" />
        </FormField>
      </div>
    </>
  );
}

export function EquipmentPage({ equipment, onSubmit, busy }: any) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <Card>
        <h4 className="text-lg font-bold">Add Equipment</h4>
        <form onSubmit={onSubmit} className="mt-4 grid gap-3">
          <FormField label="Name">
            <Input name="name" placeholder="HMS Indotherm 500W" required />
          </FormField>
          <FormField label="Modality">
            <Select name="modality_type">
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
          <Button disabled={busy}>Save Equipment</Button>
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

export function SearchSelect({
  name,
  value,
  onChange,
  options,
  placeholder,
  required,
  getLabel,
  getSearchText,
}: any) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((row: any) => row.value === value);
  const search = query.trim().toLowerCase();
  const rows = options.filter((row: any) => {
    if (!search) return true;
    const text = getSearchText ? getSearchText(row.item) : row.label;
    return String(text || row.label).toLowerCase().includes(search);
  });

  return (
    <div className="relative">
      {name && <input type="hidden" name={name} value={value || ""} />}
      <Input
        value={open ? query : selected?.label || ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event: any) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event: any) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        required={required && !value}
      />
      {open && (
        <div className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
          {rows.length === 0 && (
            <div className="px-3 py-3 text-sm text-slate-500">
              No matching records.
            </div>
          )}
          {rows.map((row: any) => (
            <button
              key={row.value || "empty"}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(row.value, row.item);
                setQuery("");
                setOpen(false);
              }}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                row.value === value
                  ? "bg-slate-900 text-white hover:bg-slate-900"
                  : ""
              }`}
            >
              {getLabel ? getLabel(row.item, row.value === value) : row.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header({ view, setView }: any) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h3 className="text-xl lg:text-2xl font-bold">Physiotherapy</h3>
        <p className="table-data text-slate-500">
          OP/IP assessment, electrotherapy, rehab sessions, equipment usage,
          progress, and billing.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Tab
          active={view === "list" || view === "detail"}
          onClick={() => setView("list")}
        >
          Cases
        </Tab>
        <Tab active={view === "op"} onClick={() => setView("op")}>
          OP Case
        </Tab>
        <Tab active={view === "ip"} onClick={() => setView("ip")}>
          IP Case
        </Tab>
      </div>
    </div>
  );
}

export function Tab({ active, onClick, children }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2 py-2 lg:px-4 lg:py-3 table-data font-bold ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
    >
      {children}
    </button>
  );
}

export function Info({ title, value }: any) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
      <p className="mt-1 break-words text-lg font-bold">{value}</p>
    </div>
  );
}
