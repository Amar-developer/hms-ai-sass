export function MultiCheckSelect({
  options,
  selected,
  onChange,
  allLabel,
}: any) {
  const selectedSet = new Set(selected || []);
  const allSelected = options.every((option: any) =>
    selectedSet.has(option.value),
  );
  const summary = allSelected
    ? allLabel
    : options
        .filter((option: any) => selectedSet.has(option.value))
        .map((option: any) => option.label)
        .join(", ") || "Select options";
  function toggle(value: string, checked: boolean) {
    if (value === "__all") {
      onChange(checked ? options.map((option: any) => option.value) : []);
      return;
    }
    const next = new Set(selectedSet);
    if (checked) next.add(value);
    else next.delete(value);
    onChange(Array.from(next));
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <p className="truncate text-sm font-bold text-slate-800">{summary}</p>
        <label className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event: any) => toggle("__all", event.target.checked)}
            className="h-4 w-4"
          />
          {allLabel}
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {options.map((option: any) => (
          <label
            key={option.value}
            className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
              selectedSet.has(option.value)
                ? "border-blue-200 bg-blue-50 text-slate-900"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <input
              type="checkbox"
              checked={selectedSet.has(option.value)}
              onChange={(event: any) =>
                toggle(option.value, event.target.checked)
              }
              className="h-4 w-4"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
