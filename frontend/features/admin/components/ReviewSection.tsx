export function ReviewSection({ title, rows, onEdit }: any) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="font-bold">{title}</h4>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border px-3 py-2 text-xs font-bold"
        >
          Edit
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(([label, value]: any) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="text-xs font-bold uppercase text-slate-500">
              {label}
            </p>
            <p className="mt-1 break-words font-semibold text-slate-900">
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
