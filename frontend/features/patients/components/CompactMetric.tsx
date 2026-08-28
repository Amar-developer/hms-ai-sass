export function CompactMetric({ label, value }: any) {
  return (
    <div className="rounded-lg bg-slate-100 px-3 py-2 ring-1 ring-slate-100">
      <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-black text-slate-950">{value}</p>
    </div>
  );
}
