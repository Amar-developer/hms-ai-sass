import { CheckboxGroupProps } from "../types";

export function CheckboxGroup({
  title,
  rows,
  value = [],
  onChange,
  empty,
  allLabel,
  required = false,
}: CheckboxGroupProps) {
  const selectedSet = new Set(value);

  const allSelected =
    rows.length > 0 && rows.every((row) => selectedSet.has(row.id));

  function toggle(rowId: string, checked: boolean) {
    const next = new Set(selectedSet);

    if (checked) {
      next.add(rowId);
    } else {
      next.delete(rowId);
    }

    onChange(Array.from(next));
  }

  function toggleAll(checked: boolean) {
    onChange(checked ? rows.map((row) => row.id) : []);
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-slate-500">
          {title}
          {required && <span className="ml-1 text-red-500">*</span>}
        </p>

        {allLabel && rows.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => toggleAll(e.target.checked)}
            />

            <span>{allLabel}</span>
          </label>
        )}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 md:grid-cols-3">
        {rows.length === 0 && <p className="text-sm text-slate-500">{empty}</p>}

        {rows.map((row) => (
          <label
            key={row.id}
            className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold"
          >
            <input
              type="checkbox"
              checked={selectedSet.has(row.id)}
              onChange={(e) => toggle(row.id, e.target.checked)}
            />

            <span className="text-xs">{row.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
