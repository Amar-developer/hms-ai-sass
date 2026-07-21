"use client";

export function SortButton({ label, field, sort, onSort }: any) {
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="text-left font-bold uppercase text-slate-500 hover:text-slate-900"
    >
      {label}
      {sort.key === field ? (
        <span className="ml-1">{sort.dir === "asc" ? "↑" : "↓"}</span>
      ) : null}
    </button>
  );
}
