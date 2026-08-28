"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { SearchableSelect } from "./ui";
import type { SortFieldSchema } from "./AdaptiveFilterBar";
import type { SortState } from "@/utils/types";

type AdaptiveSortTriggerProps = {
  fields: SortFieldSchema[];
  sort?: SortState | null;
  onSortChange: (sort: SortState | null) => void;
};

// Sort as its own button, matching the Filters trigger's size/shape, rather
// than living inside the filter popover — the two are independent controls.
export function AdaptiveSortTrigger({
  fields,
  sort,
  onSortChange,
}: AdaptiveSortTriggerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (wrapRef.current?.contains(target)) return;
      if (target?.closest?.("[data-select-menu]")) return;
      setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  function handleField(key: string) {
    if (!key) {
      onSortChange(null);
      return;
    }
    onSortChange({ key, dir: sort?.key === key ? sort.dir : "asc" });
  }

  function toggleDir() {
    if (!sort) return;
    onSortChange({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" });
  }

  if (fields.length === 0) return null;

  const activeLabel = sort
    ? fields.find((f) => f.key === sort.key)?.label
    : undefined;

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={`inline-flex items-stretch overflow-hidden rounded-md border text-[12px] font-bold transition ${
          sort
            ? "border-emerald-200 bg-emerald-700 text-white"
            : "border-slate-200 bg-white text-slate-600"
        }`}
      >
        <button
          type="button"
          onClick={toggleDir}
          disabled={!sort}
          title={
            sort?.dir === "desc" ? "Sorted descending" : "Sorted ascending"
          }
          className={`flex shrink-0 items-center justify-center px-2.5 py-2 disabled:cursor-not-allowed disabled:opacity-40 ${
            sort ? "hover:bg-white hover:text-emerald-600" : "hover:bg-slate-50"
          }`}
        >
          {sort?.dir === "desc" ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-list-sort-descending-icon lucide-list-sort-descending"
            >
              <path d="M15 12H3" />
              <path d="M3 5h18" />
              <path d="M9 19H3" />
            </svg>
          ) : sort?.dir === "asc" ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-list-sort-ascending-icon lucide-list-sort-ascending"
            >
              <path d="M3 19h18" />
              <path d="M15 12H3" />
              <path d="M9 5H3" />
            </svg>
          ) : (
            <ArrowUpDown size={13} />
          )}
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-1.5 border-l px-2.5 py-2 ${
            sort
              ? "border-emerald-200 hover:bg-emerald-100 hover:bg-white hover:text-emerald-600"
              : "border-slate-200 hover:bg-slate-50"
          }`}
        >
          {activeLabel ?? "Sort"}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <SearchableSelect
            name="sort-field"
            value={sort?.key ?? ""}
            onChange={handleField}
            options={[
              { value: "", label: "None" },
              ...fields.map((field) => ({
                value: field.key,
                label: field.label,
              })),
            ]}
            searchable={false}
            placeholder="None"
            className="w-full"
            text="text-xs"
            autoOpen
          />
        </div>
      )}
    </div>
  );
}
