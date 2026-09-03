"use client";

import { useId, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { filterByTimespan, TIMESPAN_OPTIONS, type TimespanKey } from "./timespan";

type VitalRow = {
  recorded_at: string;
  bp?: string | null;
  pulse_bpm?: number | null;
  spo2_percent?: number | null;
  temperature_f?: number | null;
};

type MetricKey = "bp" | "pulse" | "spo2" | "temp";

const METRICS: {
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
}[] = [
  { key: "bp", label: "BP", unit: "mmHg", color: "#f97316" },
  { key: "pulse", label: "Pulse", unit: "bpm", color: "#ef4444" },
  { key: "spo2", label: "SpO2", unit: "%", color: "#0ea5e9" },
  { key: "temp", label: "Temp", unit: "°F", color: "#a855f7" },
];

function formatMonthLabel(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = String(date.getDate()).padStart(2, "0");
  return `${month} ${day}`;
}

function parseBp(bp: string): { systolic: number; diastolic: number } | null {
  const match = bp.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  return { systolic: Number(match[1]), diastolic: Number(match[2]) };
}

function latestValue(rows: VitalRow[], key: MetricKey): string | null {
  const sorted = [...rows].sort((a, b) =>
    a.recorded_at.localeCompare(b.recorded_at),
  );
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const row = sorted[i];
    if (key === "bp" && row.bp) return row.bp;
    if (key === "pulse" && row.pulse_bpm) return `${row.pulse_bpm}`;
    if (key === "spo2" && row.spo2_percent) return `${row.spo2_percent}`;
    if (key === "temp" && row.temperature_f) return `${row.temperature_f}`;
  }
  return null;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  // The gradient Area under the line shares its dataKey ("value") with the
  // Line itself, so Recharts hands the tooltip two payload rows for the same
  // point (Recharts falls back to the dataKey for `name` when a series
  // doesn't set one, so both rows end up with a truthy but colliding key).
  // The Area renders first in the JSX and doesn't set `name`, the Line
  // renders after it and does — keep the *last* row per dataKey so the
  // Line's properly-labeled entry wins over the Area's.
  const rows = [
    ...new Map(payload.map((row: any) => [row.dataKey, row])).values(),
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-bold text-slate-900">{label}</p>
      {rows.map((row: any) => (
        <p key={row.dataKey} className="mt-0.5 flex items-center gap-1.5 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
          {row.name}: <span className="font-bold text-slate-900">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * BP/Pulse/SpO2/Temp trend — the four vitals besides height & weight. A
 * clickable tile per metric switches which one's trend line renders below
 * (BP renders both systolic and diastolic lines).
 */
export function VitalsMetricsChart({ vitals }: { vitals: VitalRow[] }) {
  const gradientId = useId();
  const metricsWithData = METRICS.filter((metric) =>
    vitals.some((row) =>
      metric.key === "bp"
        ? row.bp
        : metric.key === "pulse"
          ? row.pulse_bpm
          : metric.key === "spo2"
            ? row.spo2_percent
            : row.temperature_f,
    ),
  );
  const [selected, setSelected] = useState<MetricKey>(
    metricsWithData[0]?.key || "pulse",
  );
  const [timespan, setTimespan] = useState<TimespanKey>("180d");
  const activeMetric =
    METRICS.find((metric) => metric.key === selected) || METRICS[1];

  const allPoints = useMemo<any[]>(() => {
    const sorted = [...vitals].sort((a, b) =>
      a.recorded_at.localeCompare(b.recorded_at),
    );
    if (activeMetric.key === "bp") {
      return sorted
        .filter((row) => row.bp)
        .map((row) => {
          const parsed = parseBp(row.bp!);
          return {
            date: String(row.recorded_at).slice(0, 10),
            label: formatMonthLabel(String(row.recorded_at).slice(0, 10)),
            systolic: parsed?.systolic ?? null,
            diastolic: parsed?.diastolic ?? null,
          };
        })
        .filter((point) => point.systolic !== null);
    }
    const field =
      activeMetric.key === "pulse"
        ? "pulse_bpm"
        : activeMetric.key === "spo2"
          ? "spo2_percent"
          : "temperature_f";
    return sorted
      .filter((row) => row[field as keyof VitalRow] != null)
      .map((row) => ({
        date: String(row.recorded_at).slice(0, 10),
        label: formatMonthLabel(String(row.recorded_at).slice(0, 10)),
        value: Number(row[field as keyof VitalRow]),
      }));
  }, [vitals, activeMetric.key]);

  const points = useMemo(
    () => filterByTimespan(allPoints, timespan),
    [allPoints, timespan],
  );

  if (metricsWithData.length === 0) {
    return (
      <div className="grid h-40 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-400">
        No BP, pulse, SpO2, or temperature readings recorded yet.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {METRICS.map((metric) => {
          const value = latestValue(vitals, metric.key);
          const hasData = metricsWithData.some((m) => m.key === metric.key);
          const isActive = metric.key === selected;
          return (
            <button
              key={metric.key}
              type="button"
              disabled={!hasData}
              onClick={() => setSelected(metric.key)}
              className={`rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                isActive
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-400"
              }`}
            >
              <p
                className={`text-[10px] font-bold uppercase tracking-wide ${
                  isActive ? "text-white/70" : "text-slate-400"
                }`}
              >
                {metric.label}
              </p>
              <p className="mt-0.5 text-sm font-black">
                {value || "-"}
                {value && (
                  <span className="ml-1 text-[10px] font-semibold opacity-70">
                    {metric.unit}
                  </span>
                )}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {TIMESPAN_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTimespan(option.key)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
              timespan === option.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {points.length === 0 ? (
        <div className="grid h-40 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-400">
          No {activeMetric.label.toLowerCase()} readings recorded yet.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50 to-white p-2 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={points} margin={{ top: 8, right: 12, left: -6, bottom: 4 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={activeMetric.color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={activeMetric.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                minTickGap={16}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={32}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<CustomTooltip />} />
              {activeMetric.key === "bp" ? (
                <>
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={24}
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span className="text-[11px] font-semibold text-slate-600">{value}</span>
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="systolic"
                    name="Systolic"
                    stroke="#f97316"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "white", stroke: "#f97316", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="diastolic"
                    name="Diastolic"
                    stroke="#fb923c"
                    strokeWidth={2.5}
                    strokeDasharray="4 3"
                    dot={{ r: 3.5, fill: "white", stroke: "#fb923c", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </>
              ) : (
                <>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="none"
                    fill={`url(#${gradientId})`}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={`${activeMetric.label} (${activeMetric.unit})`}
                    stroke={activeMetric.color}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "white", stroke: activeMetric.color, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
