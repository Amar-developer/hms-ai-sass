"use client";

import { useId, useState } from "react";

export type VitalReading = {
  date: string; // ISO yyyy-mm-dd
  heightCm: number;
  weightKg: number;
};

type BmiZone = {
  key: "underweight" | "normal" | "overweight" | "obese";
  label: string;
  max: number; // upper bound of the zone (Infinity for the last one)
  // Tailwind classes only — no raw hex — so the chart always tracks the
  // app's existing status tones instead of drifting from them.
  fill: string;
  text: string;
};

// Standard adult BMI bands (kg/m^2). Ordered low → high; each zone's `max`
// is its upper bound so a reading is banded by the first zone it's <= .
const BMI_ZONES: BmiZone[] = [
  { key: "underweight", label: "Underweight", max: 18.5, fill: "fill-amber-200/60", text: "text-amber-700" },
  { key: "normal", label: "Normal", max: 25, fill: "fill-emerald-200/50", text: "text-emerald-700" },
  { key: "overweight", label: "Overweight", max: 30, fill: "fill-orange-200/60", text: "text-orange-700" },
  { key: "obese", label: "Obese", max: Infinity, fill: "fill-red-200/60", text: "text-red-700" },
];

export function bmiOf(reading: VitalReading): number {
  const heightM = reading.heightCm / 100;
  if (!heightM) return 0;
  return reading.weightKg / (heightM * heightM);
}

function zoneFor(bmi: number): BmiZone {
  return BMI_ZONES.find((zone) => bmi <= zone.max) || BMI_ZONES[BMI_ZONES.length - 1];
}

/**
 * BMI-over-time trend for one patient. Inline SVG (no charting dependency
 * in this codebase yet) — a single line series against fixed BMI-category
 * bands, so the reading's health context is visible without a legend lookup.
 */
export function BmiTrendChart({ readings }: { readings: VitalReading[] }) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  const points = sorted.map((reading) => ({
    ...reading,
    bmi: Math.round(bmiOf(reading) * 10) / 10,
  }));

  if (points.length === 0) {
    return (
      <div className="grid h-48 place-items-center rounded-lg border border-dashed border-slate-200 text-xs font-medium text-slate-400">
        No vitals recorded yet
      </div>
    );
  }

  const width = 640;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 34 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const bmiValues = points.map((p) => p.bmi);
  const yMin = Math.min(15, Math.floor(Math.min(...bmiValues) - 2));
  const yMax = Math.max(35, Math.ceil(Math.max(...bmiValues) + 2));

  const x = (i: number) =>
    padding.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (bmi: number) =>
    padding.top + plotH - ((bmi - yMin) / (yMax - yMin)) * plotH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.bmi).toFixed(1)}`)
    .join(" ");

  const latest = points[points.length - 1];
  const latestZone = zoneFor(latest.bmi);
  const active = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-2xl font-black tabular-nums text-slate-900">
            {latest.bmi}
          </span>
          <span className="ml-1 text-xs font-semibold text-slate-400">kg/m²</span>
          <span className={`ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold ${latestZone.text}`}>
            {latestZone.label}
          </span>
        </div>
        <span className="text-[11px] font-medium text-slate-400">
          Updated {latest.date}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`BMI trend from ${points[0].date} to ${latest.date}, currently ${latest.bmi} (${latestZone.label})`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* BMI category bands */}
        {BMI_ZONES.map((zone, i) => {
          const zoneMin = i === 0 ? yMin : BMI_ZONES[i - 1].max;
          const bandTop = Math.min(zone.max, yMax);
          const bandBottom = Math.max(zoneMin, yMin);
          if (bandBottom >= yMax || bandTop <= yMin) return null;
          return (
            <rect
              key={zone.key}
              x={padding.left}
              y={y(Math.min(bandTop, yMax))}
              width={plotW}
              height={Math.max(0, y(bandBottom) - y(Math.min(bandTop, yMax)))}
              className={zone.fill}
            />
          );
        })}

        {/* gridlines */}
        {[yMin, (yMin + yMax) / 2, yMax].map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-slate-200"
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-slate-400 text-[9px]"
            >
              {Math.round(tick)}
            </text>
          </g>
        ))}

        {/* area fill under the line */}
        <path
          d={`${linePath} L ${x(points.length - 1)} ${y(yMin)} L ${x(0)} ${y(yMin)} Z`}
          fill={`url(#${gradientId})`}
        />

        {/* trend line */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* points + hover targets */}
        {points.map((p, i) => (
          <g key={p.date}>
            <circle
              cx={x(i)}
              cy={y(p.bmi)}
              r={hoverIndex === i ? 5 : 3.5}
              fill="white"
              stroke="var(--brand)"
              strokeWidth={2}
            />
            <rect
              x={x(i) - plotW / points.length / 2}
              y={padding.top}
              width={plotW / points.length}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex((cur) => (cur === i ? null : cur))}
              onFocus={() => setHoverIndex(i)}
              onBlur={() => setHoverIndex((cur) => (cur === i ? null : cur))}
              tabIndex={0}
              role="button"
              aria-label={`${p.date}: BMI ${p.bmi}`}
            />
          </g>
        ))}

        {/* x-axis labels: first, last, and hovered */}
        {[0, points.length - 1].map((i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 8}
            textAnchor={i === 0 ? "start" : "end"}
            className="fill-slate-400 text-[9px]"
          >
            {points[i].date}
          </text>
        ))}
      </svg>

      {active && (
        <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-slate-600">
          <span>{active.date}</span>
          <span className="text-slate-300">•</span>
          <span>BMI {active.bmi}</span>
          <span className="text-slate-300">•</span>
          <span className={zoneFor(active.bmi).text}>{zoneFor(active.bmi).label}</span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        {BMI_ZONES.map((zone) => (
          <span key={zone.key} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
            <span className={`h-2.5 w-2.5 rounded-full ${zone.fill.replace("/60", "").replace("/50", "")}`} />
            {zone.label}
          </span>
        ))}
      </div>
    </div>
  );
}
