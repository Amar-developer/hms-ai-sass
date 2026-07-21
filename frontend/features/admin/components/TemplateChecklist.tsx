export function TemplateChecklist({
  title,
  name,
  items,
  defaultSelected,
  empty,
}: any) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="text-sm font-black text-slate-950">{title}</h4>
      <div className="mt-3 grid gap-2">
        {items.length === 0 && (
          <p className="text-xs  text-slate-500">{empty}</p>
        )}
        {items.map((item: any) => (
          <label
            key={item.id}
            className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
          >
            <input
              type="checkbox"
              name={name}
              value={item.id}
              defaultChecked={defaultSelected(item)}
              className="mt-1 h-3 w-3"
            />
            <span>
              <span className="text-xs font-semibold">{item.name}</span>
              <span className="block break-all text-xs text-slate-500">
                {item.key || item.code}
              </span>
              {item.is_global_template && (
                <span className="mt-1 inline-block rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                  Global
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
