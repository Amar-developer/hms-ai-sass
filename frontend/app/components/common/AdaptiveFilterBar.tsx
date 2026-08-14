"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Input, SearchableSelect, Button } from "./ui";
import { FormField } from "../FormElements";
import type { SortState } from "@/utils/types";
import React from "react";

export type FilterFieldOption = {
  value: string;
  label: string;
};

export type FilterFieldSchema = {
  key: string;
  label: string;
  options: FilterFieldOption[];
};

export type SortFieldSchema = {
  key: string;
  label: string;
};

// Describes what a single table can be filtered/sorted by. A page (or a tab
// within a page) hands this to AdaptiveFilterBar instead of hand-building a
// filter UI — swap the schema and the same bar renders different fields, which
// is what lets tab-switched modules reuse one instance across their tables.
export type TableSchema = {
  id: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  filters: FilterFieldSchema[];
  sortFields: SortFieldSchema[];
};

type AdaptiveFilterBarProps = {
  schema: TableSchema;
  query?: string;
  setQuery?: (value: string) => void;
  showSearch?: boolean;
  filterValues: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  // Set false when the caller renders sort as its own separate control
  // (e.g. AdaptiveSortTrigger) instead of inline here.
  showSort?: boolean;
  onReset?: () => void;
  className?: string;
  children?: React.ReactNode;
};

export function AdaptiveFilterBar({
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
  className = "lg:grid-cols-4 xl:grid-cols-5",
  children,
}: AdaptiveFilterBarProps) {
  function handleReset() {
    setQuery?.("");
    schema.filters.forEach((filter) => onFilterChange?.(filter.key, "all"));
    onSortChange?.(null);
    onReset?.();
  }

  function handleSortField(key: string) {
    if (!onSortChange) return;
    if (!key) {
      onSortChange(null);
      return;
    }
    onSortChange({ key, dir: sort?.key === key ? sort.dir : "asc" });
  }

  function toggleSortDir() {
    if (!onSortChange || !sort) return;
    onSortChange({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" });
  }

  return (
    <div key={schema.id} className={`grid gap-3 md:grid-cols-2 ${className}`}>
      {showSearch && (
        <FormField label={schema.searchLabel ?? "Search"}>
          <Input
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setQuery?.(e.target.value)
            }
            placeholder={schema.searchPlaceholder ?? "Search"}
          />
        </FormField>
      )}

      {schema.filters.map((filter) => (
        <FormField key={filter.key} label={filter.label}>
          <SearchableSelect
            name={filter.key}
            value={filterValues[filter.key] ?? "all"}
            onChange={(value: string) => onFilterChange?.(filter.key, value)}
            options={filter.options}
            searchable={false}
            placeholder={`Select ${filter.label}`}
            className="w-full"
          />
        </FormField>
      ))}

      {children}

      {showSort && schema.sortFields.length > 0 && (
        <FormField label="Sort by">
          <div className="flex items-stretch gap-2">
            <SearchableSelect
              name="sort-field"
              value={sort?.key ?? ""}
              onChange={handleSortField}
              options={[
                { value: "", label: "None" },
                ...schema.sortFields.map((field) => ({
                  value: field.key,
                  label: field.label,
                })),
              ]}
              searchable={false}
              placeholder="None"
              className="w-full"
            />
            <button
              type="button"
              onClick={toggleSortDir}
              disabled={!sort}
              title={sort?.dir === "desc" ? "Sorted descending" : "Sorted ascending"}
              className="flex shrink-0 items-center justify-center rounded-lg border border-slate-200 px-3 text-slate-500 hover:text-slate-900 disabled:opacity-40"
            >
              {sort?.dir === "desc" ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
            </button>
          </div>
        </FormField>
      )}

      <FormField label="">
        <Button
          type="button"
          onClick={handleReset}
          className="px-4 py-2 mt-4 text-xs"
        >
          Reset
        </Button>
      </FormField>
    </div>
  );
}
