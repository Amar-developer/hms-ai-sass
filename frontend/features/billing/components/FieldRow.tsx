export function FieldRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex text-[13px] leading-4">
      <span className="w-28 shrink-0 font-semibold text-slate-700">
        {label}
      </span>
      <span className="mr-2 text-slate-500">:</span>
      <span className="w-64 flex flex-wrap text-slate-800">{value || ""}</span>
    </div>
  );
}
