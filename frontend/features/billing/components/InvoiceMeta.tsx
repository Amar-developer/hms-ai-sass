export function InvoiceMeta({ label, value }: any) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words font-bold capitalize text-slate-950">
        {value}
      </p>
    </div>
  );
}
