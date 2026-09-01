function Metric({ icon: Icon, label, value, trend, tone = "emerald" }: any) {
  const toneClasses: Record<string, string> = {
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
    rose: "bg-rose-50 text-rose-600 ring-rose-100",
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
  };
  const trendTone =
    trend?.tone === "up"
      ? "text-emerald-600"
      : trend?.tone === "down"
        ? "text-rose-600"
        : "text-slate-400";
  return (
    <div className="flex h-full min-h-[74px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-slate-300">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ${
          toneClasses[tone] || toneClasses.emerald
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-0.5 text-xl font-black tabular-nums text-slate-950">
          {value}
        </p>
        {trend && (
          <p className={`mt-0.5 text-[10px] font-bold ${trendTone}`}>
            {trend.text}
          </p>
        )}
      </div>
    </div>
  );
}

export default Metric;
