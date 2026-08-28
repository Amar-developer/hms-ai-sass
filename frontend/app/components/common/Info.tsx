export function Info({ title, value }: any) {
  return (
    <div className="rounded-lg bg-slate-100 p-4">
      <p className="text-sm font-semibold uppercase text-slate-500">{title}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}
