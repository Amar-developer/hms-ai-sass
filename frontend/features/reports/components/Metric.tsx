import { useId } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

const toneStyles: Record<
  string,
  { color: string; icon: string; card: string }
> = {
  amber: {
    color: "#f59e0b",
    icon: "bg-amber-50 text-amber-500 ring-amber-100",
    card: "from-amber-50/65 via-white to-white",
  },
  blue: {
    color: "#2563eb",
    icon: "bg-blue-50 text-blue-600 ring-blue-100",
    card: "from-blue-50/65 via-white to-white",
  },
  emerald: {
    color: "#10b981",
    icon: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    card: "from-emerald-50/65 via-white to-white",
  },
  indigo: {
    color: "#4f46e5",
    icon: "bg-indigo-50 text-indigo-600 ring-indigo-100",
    card: "from-indigo-50/65 via-white to-white",
  },
  rose: {
    color: "#f43f5e",
    icon: "bg-rose-50 text-rose-500 ring-rose-100",
    card: "from-rose-50/65 via-white to-white",
  },
  sky: {
    color: "#0ea5e9",
    icon: "bg-sky-50 text-sky-500 ring-sky-100",
    card: "from-sky-50/65 via-white to-white",
  },
  slate: {
    color: "#64748b",
    icon: "bg-slate-100 text-slate-600 ring-slate-200",
    card: "from-slate-100/65 via-white to-white",
  },
  violet: {
    color: "#8b5cf6",
    icon: "bg-violet-50 text-violet-600 ring-violet-100",
    card: "from-violet-50/65 via-white to-white",
  },
};

function MetricSparkline({ data, dataKey, color, direction }: any) {
  const gradientId = `metric-spark-${useId().replaceAll(":", "")}`;
  const fallbackValues =
    direction === "up"
      ? [4, 8, 6, 12, 9, 15, 20]
      : direction === "down"
        ? [20, 15, 17, 11, 13, 7, 4]
        : [10, 10, 10, 10, 10, 10, 10];
  const source =
    Array.isArray(data) && data.length
      ? data
      : fallbackValues.map((metricValue) => ({ metricValue }));
  const chartData =
    source.length <= 8
      ? source
      : Array.from({ length: 8 }, (_, index) =>
          source[Math.round((index * (source.length - 1)) / 7)],
        );
  const key = Array.isArray(data) && data.length ? dataKey : "metricValue";

  return (
    <div className="h-12 w-32 max-w-[48%] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 4, right: 4, bottom: 2, left: 4 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={key}
            stroke={color}
            strokeWidth={2.25}
            fill={`url(#${gradientId})`}
            dot={{ r: 2.25, fill: color, strokeWidth: 0 }}
            activeDot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  percentage,
  trend,
  tone = "emerald",
  data = [],
  dataKey,
  comparisonLabel = "vs previous period",
}: any) {
  const style = toneStyles[tone] || toneStyles.emerald;
  const trendTone =
    trend?.tone === "up"
      ? "text-emerald-600"
      : trend?.tone === "down"
        ? "text-rose-600"
        : "text-slate-400";
  const TrendIcon =
    trend?.tone === "up"
      ? TrendingUp
      : trend?.tone === "down"
        ? TrendingDown
        : Minus;
  const trendText = String(trend?.text || "")
    .replace(/^[▲▼]\s*/, "")
    .replace(" vs previous period", "");
  const shortTrend = trendText.includes("No activity")
    ? "0%"
    : trendText || "0%";

  return (
    <article
      className={`h-36 min-w-0 rounded-2xl border border-slate-200 bg-gradient-to-br p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md ${style.card}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ${style.icon}`}
        >
          <Icon
            className="h-6 w-6"
            fill="currentColor"
            fillOpacity={0.12}
            strokeWidth={2.15}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-600">{label}</p>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
            <p className="truncate text-2xl font-black tabular-nums tracking-tight text-slate-950">
              {value}
            </p>
            {percentage && (
              <span className="shrink-0 rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-slate-600 ring-1 ring-slate-200/70">
                {percentage}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex min-w-0 items-end justify-between gap-2">
        <div className="min-w-0 pb-0.5">
          <span
            className={`flex min-w-0 items-center gap-1 text-xs font-black ${trendTone}`}
          >
            <TrendIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{shortTrend}</span>
          </span>
          <p className="mt-1 truncate text-[10px] font-medium text-slate-500">
            {comparisonLabel}
          </p>
        </div>
        <MetricSparkline
          data={data}
          dataKey={dataKey}
          color={style.color}
          direction={trend?.tone}
        />
      </div>
    </article>
  );
}

export default Metric;
