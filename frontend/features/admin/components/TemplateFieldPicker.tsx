import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Trash2 } from "lucide-react";

export type TemplateFieldOption = { key: string; label: string };

type Props = {
  fields: TemplateFieldOption[];
  selected: string[];
  onToggle: (fieldKey: string) => void;
  onRemove?: (index: number) => void;
  onMove?: (index: number, direction: -1 | 1) => void;
  disabled?: boolean;
  max: number;
  /** Open the field list immediately — used where picking is the whole point
   * (the create dialog), rather than where the template is mostly being read. */
  defaultOpen?: boolean;
};

const COMMON_GROUP = "Common";

/** Split "Patient · Date of birth" into its module and short label.
 * Curated fields have no separator and fall under a "Common" group, which is
 * rendered first so the handful of fields most templates need stay one click
 * away even though the full catalog now runs to dozens of entries. */
function splitLabel(label: string): { group: string; short: string } {
  const separator = label.indexOf("·");
  if (separator === -1) return { group: COMMON_GROUP, short: label };
  return {
    group: label.slice(0, separator).trim(),
    short: label.slice(separator + 1).trim(),
  };
}

export function TemplateFieldPicker({
  fields,
  selected,
  onToggle,
  onRemove,
  onMove,
  disabled = false,
  max,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const search = query.trim().toLowerCase();
    const byGroup = new Map<string, Array<TemplateFieldOption & { short: string }>>();
    for (const field of fields) {
      if (search && !field.label.toLowerCase().includes(search)) continue;
      const { group, short } = splitLabel(field.label);
      const bucket = byGroup.get(group) || [];
      bucket.push({ ...field, short });
      byGroup.set(group, bucket);
    }
    return [...byGroup.entries()].sort(([a], [b]) =>
      a === COMMON_GROUP ? -1 : b === COMMON_GROUP ? 1 : a.localeCompare(b),
    );
  }, [fields, query]);

  const atLimit = selected.length >= max;
  const labelFor = (fieldKey: string) =>
    fields.find((field) => field.key === fieldKey)?.label || fieldKey;
  const selectedCount = (fieldKey: string) =>
    selected.filter((key) => key === fieldKey).length;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Template values
        </p>
        <span
          className={`text-[11px] font-semibold ${
            atLimit ? "text-amber-600" : "text-slate-400"
          }`}
        >
          {selected.length} of {max}
        </span>
      </div>

      {selected.length === 0 ? (
        <p className="mt-1.5 rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
          No fields selected yet — add them in the order your approved template
          expects {"{{1}}"}, {"{{2}}"}, ...
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {selected.map((fieldKey, index, all) => (
            <li
              key={`${fieldKey}-${index}`}
              className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
            >
              <span className="min-w-0 truncate">
                <span className="font-bold text-slate-700">{`{{${index + 1}}}`}</span>{" "}
                {labelFor(fieldKey)}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {onMove && (
                  <>
                    <button
                      type="button"
                      disabled={disabled || index === 0}
                      onClick={() => onMove(index, -1)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={disabled || index === all.length - 1}
                      onClick={() => onMove(index, 1)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => (onRemove ? onRemove(index) : onToggle(fieldKey))}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  aria-label="Remove"
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Add field
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-slate-200 bg-white p-2.5">
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search fields"
              aria-label="Search fields"
              disabled={disabled}
              className="w-full rounded-md border border-slate-300 py-1 pl-7 pr-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {atLimit && (
            <p className="mt-2 text-xs font-semibold text-amber-600">
              {`Maximum ${max} values reached. Remove one to add another.`}
            </p>
          )}

          {groups.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              No fields match “{query}”.
            </p>
          ) : (
            groups.map(([group, groupFields]) => (
              <div key={group} className="mt-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {group}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {groupFields.map((field) => {
                    const count = selectedCount(field.key);
                    const isSelected = count > 0;
                    return (
                      <button
                        type="button"
                        key={field.key}
                        // The full label stays the accessible name so a field
                        // is identifiable outside its group heading.
                        aria-label={field.label}
                        title={field.label}
                        disabled={disabled || atLimit}
                        onClick={() => onToggle(field.key)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                            : "border-slate-300 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {field.short}
                        {count > 0 ? ` ×${count}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
