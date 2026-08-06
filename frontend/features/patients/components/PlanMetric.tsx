export function PlanMetric({ label, value }: any) {
  return (
    <div className="min-h-[58px] rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
      <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-950">
        {value}
      </p>
    </div>
  );
}
