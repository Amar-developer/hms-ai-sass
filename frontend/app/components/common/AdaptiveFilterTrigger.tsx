"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal,X } from "lucide-react";
import {
  AdaptiveFilterBar,
  type TableSchema,
} from "./AdaptiveFilterBar";
import { AdaptiveQueryFilterPanel } from "./AdaptiveQueryFilterPanel";
import type { QueryFieldSchema, QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";

type AdaptiveFilterTriggerProps = {
  schema: TableSchema;
  query?: string;
  setQuery?: (value: string) => void;
  showSearch?: boolean;
  filterValues: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  // Set false when sort is rendered separately (AdaptiveSortTrigger) so it
  // doesn't take up space in this panel or double-count in the badge.
  showSort?: boolean;
  onReset?: () => void;
  children?: React.ReactNode;
  // Ad-hoc "+ Add a Filter" query builder — a second, independent layer on
  // top of the schema's fixed dropdowns. Omit queryFields to leave it out.
  queryFields?: QueryFieldSchema[];
  queryFilters?: QueryFilterRow[];
  onQueryFiltersChange?: (rows: QueryFilterRow[]) => void;
};

// The breadcrumb row has no room for AdaptiveFilterBar's full grid, so this
// wraps it behind a "Filters" button — same schema-driven bar, opened as a
// panel anchored to the trigger instead of rendered inline.
export function AdaptiveFilterTrigger({
  schema,
  query,
  setQuery,
  showSearch = true,
  filterValues,
  onFilterChange,
  sort,
  onSortChange,
  showSort = true,
  onReset,
  children,
  queryFields,
  queryFilters,
  onQueryFiltersChange,
}: AdaptiveFilterTriggerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (wrapRef.current?.contains(target)) return;
      // SearchableSelect (and similar) render their option list through a
      // portal straight into document.body, so a click there is technically
      // outside wrapRef even though it's part of this panel — closing on it
      // would eat the click before the option's onClick ever fires.
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

  const activeCount =
    (query ? 1 : 0) +
    schema.filters.filter(
      (filter) =>
        filterValues[filter.key] &&
        filterValues[filter.key] !== "all" &&
        filterValues[filter.key] !== "",
    ).length +
    (showSort && sort ? 1 : 0) +
    (queryFilters?.length ?? 0);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-bold transition ${
          activeCount > 0
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        <SlidersHorizontal size={13} />
        Filters
        {activeCount > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute right-0 z-40 mt-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg ${
            queryFields?.length ? "w-[28rem]" : "w-80"
          }`}
        >
          <AdaptiveFilterBar
            schema={schema}
            query={query}
            setQuery={setQuery}
            showSearch={showSearch}
            filterValues={filterValues}
            onFilterChange={onFilterChange}
            sort={sort}
            onSortChange={onSortChange}
            showSort={showSort}
            onReset={() => {
              onQueryFiltersChange?.([]);
              onReset?.();
            }}
            className="grid-cols-1"
            onClose={()=>setOpen(false)}
          >
            {children}
          </AdaptiveFilterBar>
          {queryFields && queryFields.length > 0 && (
            <div className="my-3 border-t border-slate-100 pt-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Custom filters
              </p>
              <AdaptiveQueryFilterPanel
                fields={queryFields}
                appliedFilters={queryFilters ?? []}
                onApply={(rows) => onQueryFiltersChange?.(rows)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
