export function Insight({ label, value }: any) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-black leading-none text-slate-950">
        {value}
      </p>
    </div>
  );
}
