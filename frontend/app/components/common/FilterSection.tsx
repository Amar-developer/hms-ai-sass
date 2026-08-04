import { Input, SearchableSelect } from "./ui";
import { FormField } from "../FormElements";
import { Button } from "./ui";
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
  onReset?: () => void;
  children?: React.ReactNode;
  className?: string;
};

export function FilterSection({
  title,
  query,
  setQuery,
  filters,
  className = "lg:grid-cols-4 xl:grid-cols-5",
  showSearch = true,
  filterValues,
  onFilterChange,
  children,
  onReset,
}: FilterSectionProps) {
  function handleReset() {
    setQuery?.("");
    filters.forEach((filter) => {
      onFilterChange?.(filter.key, "all");
    });
    onReset?.();
  }

  return (
    <div className={`mt-4 grid gap-3 md:grid-cols-2 ${className}`}>
      {/* Search */}
      {showSearch && (
        <FormField label={title}>
          <Input
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setQuery?.(e.target.value)
            }
            placeholder={`Search ${title?.toLowerCase() ?? ""}`}
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

      <div className="flex  jusitfy-between items-end">
        {children}
        <Button
          type="button"
          onClick={handleReset}
          className="h-[50%] w-[45%] text-xs"
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
