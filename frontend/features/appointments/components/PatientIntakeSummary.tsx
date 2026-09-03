// components/PatientIntakeSummary.tsx

import { Info } from "@/app/components/common/Info";

type PatientIntakeSummaryProps = {
  bp?: string;
  pulse?: string;
  spo2?: string;
  temp?: string;
  height?: string;
  weight?: string;
  complaints?: string;
};

export function PatientIntakeSummary({
  bp,
  pulse,
  spo2,
  temp,
  height,
  weight,
  complaints,
}: PatientIntakeSummaryProps) {
  const hasAny =
    bp || pulse || spo2 || temp || height || weight || complaints;

  if (!hasAny) return null;

  // BMI calculation
  const heightNum = parseFloat(String(height || "").replace(/[^\d.]/g, ""));
  const weightNum = parseFloat(String(weight || "").replace(/[^\d.]/g, ""));
  const heightM =
    heightNum > 3 ? heightNum / 100 : heightNum > 0 ? heightNum : 0;

  let bmi: number | null = null;
  let category = "";
  let color = "#22c55e";
  let percent = 0;

  if (heightM && weightNum > 0) {
    const value = weightNum / (heightM * heightM);
    if (Number.isFinite(value) && value > 0) {
      bmi = value;

      if (bmi < 18.5) {
        category = "Underweight";
        color = "#3b82f6";
      } else if (bmi < 25) {
        category = "Normal";
        color = "#22c55e";
      } else if (bmi < 30) {
        category = "Overweight";
        color = "#f59e0b";
      } else {
        category = "Obese";
        color = "#ef4444";
      }

      percent = Math.min((bmi / 40) * 100, 100);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-xs font-bold uppercase text-slate-500">
        Patient Intake
      </p>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
        {bp && <Info title="BP (mmHg)" value={bp} />}
        {pulse && <Info title="Pulse / PR (bpm)" value={pulse} />}
        {spo2 && <Info title="SpO2 (%)" value={spo2} />}
        {temp && <Info title="Temp (°F)" value={temp} />}
        {height && <Info title="Height (cm)" value={height} />}
        {weight && <Info title="Weight (kg)" value={weight} />}
        {complaints && (
          <div className="md:col-span-2 lg:col-span-2">
            <Info title="Complaints" value={complaints} />
          </div>
        )}
      </div>

      {/* BMI Donut */}
      {bmi !== null && (
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <div
            className="relative h-28 w-28 shrink-0 rounded-full"
            style={{
              background: `conic-gradient(${color} 0% ${percent}%, #e2e8f0 ${percent}% 100%)`,
            }}
          >
            <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white">
              <span className="text-lg font-bold text-slate-800">
                {bmi.toFixed(1)}
              </span>
              <span className="text-[10px] font-medium text-slate-500">
                BMI
              </span>
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-800">{category}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {bmi < 18.5
                ? "Below healthy range"
                : bmi < 25
                  ? "Healthy range"
                  : bmi < 30
                    ? "Above healthy range"
                    : "Significantly above healthy range"}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Height: {height} · Weight: {weight}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
