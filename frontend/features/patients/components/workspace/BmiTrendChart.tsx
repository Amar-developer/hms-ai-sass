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

export type VitalReading = {
  date: string; // ISO yyyy-mm-dd
  heightCm: number;
  weightKg: number;
};

type BmiZone = {
  key: "underweight" | "normal" | "overweight" | "obese";
  label: string;
  max: number; // upper bound of the zone (Infinity for the last one)
  fill: string;
  dotClass: string;
  text: string;
};

// Standard adult BMI bands (kg/m^2). Ordered low → high; each zone's `max`
// is its upper bound so a reading is banded by the first zone it's <= .
const BMI_ZONES: BmiZone[] = [
  {
    key: "underweight",
    label: "Underweight",
    max: 18.5,
    fill: "rgba(244, 191, 14, 0.86)",
    dotClass: "bg-amber-300",
    text: "text-amber-700",
  },
  {
    key: "normal",
    label: "Normal",
    max: 25,
    fill: "rgba(4, 126, 78, 0.82)",
    dotClass: "bg-emerald-300",
    text: "text-emerald-700",
  },
  {
    key: "overweight",
    label: "Overweight",
    max: 30,
    fill: "rgba(232, 129, 19, 0.92)",
    dotClass: "bg-orange-300",
    text: "text-orange-700",
  },
  {
    key: "obese",
    label: "Obese",
    max: Infinity,
    fill: "rgb(224, 47, 47)",
    dotClass: "bg-red-300",
    text: "text-red-700",
  },
];

export function bmiOf(reading: VitalReading): number {
  const heightM = reading.heightCm / 100;
  if (!heightM) return 0;
  return reading.weightKg / (heightM * heightM);
}

export function zoneFor(bmi: number): BmiZone {
  return (
    BMI_ZONES.find((zone) => bmi <= zone.max) || BMI_ZONES[BMI_ZONES.length - 1]
  );
}

type TrendPoint = {
  date: string;
  label: string;
  weightKg: number;
  bmi: number;
};

const WEIGHT_COLOR = "#3b82f6"; // blue-500
const BMI_COLOR = "#22c55e"; // green-500

function formatMonthLabel(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  const month = date.toLocaleDateString("en-US", { month: "short" });
  return `${month} '${String(date.getFullYear()).slice(-2)}`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const weight = payload.find((row: any) => row.dataKey === "weightKg")?.value;
  const bmi = payload.find((row: any) => row.dataKey === "bmi")?.value;
  const zone = typeof bmi === "number" ? zoneFor(bmi) : null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-bold text-slate-900">{label}</p>
      {typeof weight === "number" && (
        <p className="mt-0.5 flex items-center gap-1.5 text-slate-600">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: WEIGHT_COLOR }}
          />
          Weight: <span className="font-bold text-slate-900">{weight} kg</span>
        </p>
      )}
      {typeof bmi === "number" && (
        <p className="mt-0.5 flex items-center gap-1.5 text-slate-600">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: BMI_COLOR }}
          />
          BMI: <span className="font-bold text-slate-900">{bmi}</span>
          {zone && (
            <span className={`font-semibold ${zone.text}`}>· {zone.label}</span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Weight & BMI trend for one patient — dual-line chart over a selectable
 * timespan of recorded vitals, mirroring the reference "Health Trends"
 * widget.
 */
export function BmiTrendChart({ readings }: { readings: VitalReading[] }) {
  const weightGradientId = useId();
  const bmiGradientId = useId();
  const [timespan, setTimespan] = useState<TimespanKey>("180d");

  const allPoints = useMemo<TrendPoint[]>(
    () =>
      [...readings]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((reading) => ({
          date: reading.date,
          label: formatMonthLabel(reading.date),
          weightKg: Math.round(reading.weightKg * 10) / 10,
          bmi: Math.round(bmiOf(reading) * 10) / 10,
        })),
    [readings],
  );

  const recentPoints = useMemo(
    () => filterByTimespan(allPoints, timespan),
    [allPoints, timespan],
  );

  // A single reading has nothing to draw a line between — it just renders as
  // a lone dot, which doesn't read as a trend graph. Anchor it at today's
  // date too (same real value, no invented data) so a flat line renders
  // until a second reading is recorded.
  const points = useMemo(() => {
    if (recentPoints.length !== 1) return recentPoints;
    const only = recentPoints[0];
    const todayIso = new Date().toISOString().slice(0, 10);
    if (todayIso === only.date) return recentPoints;
    return [only, { ...only, date: todayIso, label: formatMonthLabel(todayIso) }];
  }, [recentPoints]);

  if (allPoints.length === 0) {
    return (
      <div className="grid h-48 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-400">
        No vitals recorded yet
      </div>
    );
  }

  const latest = recentPoints[recentPoints.length - 1];
  const latestZone = zoneFor(latest.bmi);
  const weightValues = points.map((p) => p.weightKg);
  const weightMin = Math.floor(Math.min(...weightValues) - 10);
  const weightMax = Math.ceil(Math.max(...weightValues) + 10);
  const bmiValues = points.map((p) => p.bmi);
  const bmiMin = Math.min(15, Math.floor(Math.min(...bmiValues) - 5));
  const bmiMax = Math.max(35, Math.ceil(Math.max(...bmiValues) + 5));

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500">
          Weight &amp; BMI Trends
        </p>
        <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-right">
          <p className="text-[11px] font-bold text-slate-500">
            {formatMonthLabel(latest.date)}
          </p>
          <p className="text-xs font-semibold text-slate-700">
            Weight: {latest.weightKg} kg
          </p>
          <p className="text-xs font-semibold text-slate-700">
            <span className={latestZone.text}>&bull;</span> BMI: {latest.bmi}
          </p>
        </div>
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

      <div className="rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50 to-white p-2 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart
            data={points}
            margin={{ top: 8, right: 12, left: -6, bottom: 4 }}
          >
            <defs>
              <linearGradient id={weightGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={WEIGHT_COLOR} stopOpacity={0.25} />
                <stop offset="100%" stopColor={WEIGHT_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={bmiGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BMI_COLOR} stopOpacity={0.25} />
                <stop offset="100%" stopColor={BMI_COLOR} stopOpacity={0} />
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
              yAxisId="weight"
              domain={[weightMin, weightMax]}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              width={34}
            />
            <YAxis
              yAxisId="bmi"
              orientation="right"
              domain={[bmiMin, bmiMax]}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "#cbd5e1", strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={28}
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span className="text-[11px] font-semibold text-slate-600">
                  {value}
                </span>
              )}
            />
            <Area
              yAxisId="weight"
              type="monotone"
              dataKey="weightKg"
              stroke="none"
              fill={`url(#${weightGradientId})`}
              isAnimationActive={false}
              legendType="none"
            />
            <Area
              yAxisId="bmi"
              type="monotone"
              dataKey="bmi"
              stroke="none"
              fill={`url(#${bmiGradientId})`}
              isAnimationActive={false}
              legendType="none"
            />
            <Line
              yAxisId="weight"
              type="monotone"
              dataKey="weightKg"
              name="Weight (kg)"
              stroke={WEIGHT_COLOR}
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "white", stroke: WEIGHT_COLOR, strokeWidth: 2 }}
              activeDot={{ r: 5.5, stroke: "white", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="bmi"
              type="monotone"
              dataKey="bmi"
              name="BMI"
              stroke={BMI_COLOR}
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "white", stroke: BMI_COLOR, strokeWidth: 2 }}
              activeDot={{ r: 5.5, stroke: "white", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {recentPoints.length === 1 && (
        <p className="mt-2 text-[11px] font-medium text-slate-400">
          Only one reading recorded — add another to see the trend over time.
        </p>
      )}
    </div>
  );
}
