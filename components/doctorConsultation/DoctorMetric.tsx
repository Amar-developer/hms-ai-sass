export function DoctorMetric({
  icon: Icon,
  title,
  value,
  caption,
  tone = "slate",
  active = false,
  onClick,
}: any) {
  const toneClass: any = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-700",
    green: "bg-emerald-100 text-emerald-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[118px] rounded-3xl border bg-white p-5 text-left shadow-sm transition ${active ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200 hover:border-slate-400"}`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${toneClass[tone] || toneClass.slate}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-600">{title}</p>
          <p className="mt-1 text-3xl font-black text-slate-950">{value}</p>
          <p className="truncate text-xs font-semibold text-slate-500">
            {caption}
          </p>
        </div>
      </div>
    </button>
  );
}