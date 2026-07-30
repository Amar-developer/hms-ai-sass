import { Input, SearchableSelect } from "./ui";
import { FormField } from "../FormElements";
import React from "react";

type FilterOption = {
  value: string;
  label: string;
};

type FilterConfig = {
  key: string;
  label: string;
  options: FilterOption[];
};

type FilterSectionProps = {
  title?: string;
  query?: string;
  setQuery?: (value: string) => void;
  showSearch?: boolean;
  filters: FilterConfig[];
  filterValues: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  children?: React.ReactNode;
};

export function FilterSection({
  title,
  query,
  setQuery,
  filters,
  showSearch = true,
  filterValues,
  onFilterChange,
  children,
}: FilterSectionProps) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {/* Search */}
      {showSearch && (
        <FormField label={title}>
          <Input
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setQuery(e.target.value)
            }
            placeholder={`Search ${title.toLowerCase()}`}
          />
        </FormField>
      )}

      {/* Dynamic Filters */}
      {filters.map((filter) => (
        <FormField key={filter.key} label={filter.label}>
          <SearchableSelect
            name={filter.key}
            value={filterValues[filter.key] ?? "all"}
            onChange={(value) => onFilterChange?.(filter.key, value)}
            options={filter.options}
            searchable={false}
            placeholder={`Select ${filter.label}`}
            className="w-full"
          />
        </FormField>
      ))}
      {children}
    </div>
  );
}
