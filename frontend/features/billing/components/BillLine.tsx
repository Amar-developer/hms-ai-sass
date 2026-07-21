export function BillLine({
  label,
  value,
  note,
  muted = false,
  savings = false,
  strong = false,
  danger = false,
  action = null,
}: any) {
  const valueClass = danger
    ? "text-rose-700"
    : savings
      ? "text-emerald-700"
      : "text-slate-950";
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <div>
        <p
          className={
            muted
              ? "font-semibold text-slate-400"
              : "font-semibold text-slate-700"
          }
        >
          {label}
        </p>
        {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <p
          className={`${strong ? "text-base font-black" : "font-bold"} ${muted ? "text-slate-400" : valueClass} tabular-nums`}
        >
          {value}
        </p>
        {action}
      </div>
    </div>
  );
}
