"use client";

import { Input } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";

export type VitalsValue = {
  bp: string;
  pulse: string;
  spo2: string;
  temp: string;
  height: string;
  weight: string;
};

export const EMPTY_VITALS_VALUE: VitalsValue = {
  bp: "",
  pulse: "",
  spo2: "",
  temp: "",
  height: "",
  weight: "",
};

function bmiOf(heightCm: string, weightKg: string): number | null {
  const height = Number(heightCm);
  const weight = Number(weightKg);
  if (!(height > 0) || !(weight > 0)) return null;
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  return Number.isFinite(bmi) && bmi > 0 ? bmi : null;
}

function SuggestionChip({
  value,
  currentValue,
  onApply,
}: {
  value?: string;
  currentValue: string;
  onApply: () => void;
}) {
  if (!value || value === currentValue) return null;
  return (
    <button
      type="button"
      onClick={onApply}
      className="mt-1 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
    >
      Use previous: {value}
    </button>
  );
}

const FIELDS: {
  key: keyof VitalsValue;
  label: string;
  placeholder: string;
  type: "text" | "number";
  step?: string;
}[] = [
  { key: "bp", label: "BP (mmHg)", placeholder: "120/80", type: "text" },
  { key: "pulse", label: "Pulse / PR (bpm)", placeholder: "78", type: "number" },
  { key: "spo2", label: "SpO2 (%)", placeholder: "98", type: "number" },
  { key: "temp", label: "Temp (°F)", placeholder: "98.6", type: "number", step: "0.1" },
  { key: "height", label: "Height (cm)", placeholder: "170", type: "number" },
  { key: "weight", label: "Weight (kg)", placeholder: "65", type: "number", step: "0.1" },
];

/**
 * Shared vital-signs fields (BP, pulse, SpO2, temp, height, weight) with
 * proper units per field — used by both the appointment intake form and the
 * patient Overview "no vitals yet" prompt, so a vitals reading is always
 * captured the same way regardless of where it's entered.
 */
export function VitalsFields({
  value,
  onChange,
  previous,
  showBmi = true,
}: {
  value: VitalsValue;
  onChange: (next: VitalsValue) => void;
  previous?: Partial<VitalsValue> | null;
  showBmi?: boolean;
}) {
  function setField(key: keyof VitalsValue, next: string) {
    onChange({ ...value, [key]: next });
  }

  const bmi = bmiOf(value.height, value.weight);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {FIELDS.map((field) => (
        <FormField key={field.key} label={field.label}>
          <Input
            type={field.type}
            step={field.step}
            value={value[field.key]}
            onChange={(event: any) => setField(field.key, event.target.value)}
            placeholder={field.placeholder}
          />
          <SuggestionChip
            value={previous?.[field.key]}
            currentValue={value[field.key]}
            onApply={() => setField(field.key, previous![field.key]!)}
          />
        </FormField>
      ))}
      {showBmi && bmi !== null && (
        <FormField label="BMI (kg/m²)">
          <Input value={bmi.toFixed(1)} readOnly disabled />
        </FormField>
      )}
    </div>
  );
}
