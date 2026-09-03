"use client";

import { useState } from "react";
import { Button } from "@/app/components/common/ui";
import { EMPTY_VITALS_VALUE, VitalsFields, type VitalsValue } from "./VitalsFields";

type VitalsSubmitPayload = {
  heightCm: number;
  weightKg: number;
  bp?: string;
  pulseBpm?: number;
  spo2Percent?: number;
  temperatureF?: number;
};

/**
 * Shown in place of the BMI chart the first time a patient has no recorded
 * vitals — captures one reading (via the shared VitalsFields form, the same
 * one used at appointment intake) so the chart has data to plot.
 */
export function PatientVitalsIntakeForm({
  onSubmit,
  saving,
}: {
  onSubmit: (payload: VitalsSubmitPayload) => void;
  saving?: boolean;
}) {
  const [vitals, setVitals] = useState<VitalsValue>(EMPTY_VITALS_VALUE);

  const height = Number(vitals.height);
  const weight = Number(vitals.weight);
  const canSubmit = height > 0 && height <= 300 && weight > 0 && weight <= 500;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      heightCm: height,
      weightKg: weight,
      bp: vitals.bp.trim() || undefined,
      pulseBpm: vitals.pulse ? Number(vitals.pulse) : undefined,
      spo2Percent: vitals.spo2 ? Number(vitals.spo2) : undefined,
      temperatureF: vitals.temp ? Number(vitals.temp) : undefined,
    });
    setVitals(EMPTY_VITALS_VALUE);
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-4">
      <p className="text-sm font-black text-slate-900">No vitals recorded yet</p>
      <p className="mt-1 text-xs text-slate-500">
        Record the patient&apos;s vitals to start tracking BMI over time.
      </p>
      <div className="mt-3">
        <VitalsFields value={vitals} onChange={setVitals} showBmi />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          className="save-button"
          disabled={!canSubmit || saving}
          onClick={handleSubmit}
        >
          Save Vitals
        </Button>
      </div>
    </div>
  );
}
