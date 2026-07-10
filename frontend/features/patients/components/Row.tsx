export function Row({ label, value }: any) {
  return (
    <div className="mt-2 ">
      <span className="text-xs font-semibold text-slate-500">{label}: </span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}
