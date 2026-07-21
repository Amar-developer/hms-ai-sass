import { Card } from "@/app/components/common/ui";

function Metric({ icon: Icon, label, value, hint, trend }: any) {
  const trendTone =
    trend?.tone === "up"
      ? "text-emerald-600"
      : trend?.tone === "down"
        ? "text-rose-600"
        : "text-slate-400";
  return (
    <Card>
      <div>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-slate-500" />
          <p className="text-xs lg:text-sm text-slate-500">{label}</p>
        </div>
        <p className="mt-2 text-xl lg:text-2xl font-bold">{value}</p>
        {hint && (
          <p className="mt-2 text-[10px] lg:text-xs font-semibold text-slate-500">
            {hint}
          </p>
        )}
        {trend && (
          <p className={`mt-1 text-[10px] lg:text-xs font-bold ${trendTone}`}>
            {trend.text}
          </p>
        )}
      </div>
    </Card>
  );
}

export default Metric;
