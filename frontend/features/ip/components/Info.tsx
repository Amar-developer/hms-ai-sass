export function Info({ title, value }: any) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs font-bold uppercase text-slate-500">{title}</div>
      <div className="mt-1 break-words text-lg font-bold">{value}</div>
    </div>
  );
}
