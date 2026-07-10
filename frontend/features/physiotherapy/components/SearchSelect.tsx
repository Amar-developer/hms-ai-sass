import { Input } from "@/app/components/common/ui";
import { useState } from "react";

export function SearchSelect({
  name,
  value,
  onChange,
  options,
  placeholder,
  required,
  getLabel,
  getSearchText,
}: any) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((row: any) => row.value === value);
  const search = query.trim().toLowerCase();
  const rows = options.filter((row: any) => {
    if (!search) return true;
    const text = getSearchText ? getSearchText(row.item) : row.label;
    return String(text || row.label).toLowerCase().includes(search);
  });

  return (
    <div className="relative">
      {name && <input type="hidden" name={name} value={value || ""} />}
      <Input
        value={open ? query : selected?.label || ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event: any) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event: any) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        required={required && !value}
      />
      {open && (
        <div className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
          {rows.length === 0 && (
            <div className="px-3 py-3 text-sm text-slate-500">
              No matching records.
            </div>
          )}
          {rows.map((row: any) => (
            <button
              key={row.value || "empty"}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(row.value, row.item);
                setQuery("");
                setOpen(false);
              }}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                row.value === value
                  ? "bg-slate-900 text-white hover:bg-slate-900"
                  : ""
              }`}
            >
              {getLabel ? getLabel(row.item, row.value === value) : row.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
