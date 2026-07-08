import { Input, SearchableSelect } from "./ui";
import { FormField } from "../FormElements";


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
  title: string;
  query: string;
  setQuery: (value: string) => void;
  filters: FilterConfig[];
  filterValues: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
};

export function FilterSection({
  title,
  query,
  setQuery,
  filters,
  filterValues,
  onFilterChange,
}: FilterSectionProps) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {/* Search */}
      <FormField label={title}>
        <Input
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setQuery(e.target.value)
          }
          placeholder={`Search ${title.toLowerCase()}`}
          className="search-filter"
        />
      </FormField>

      {/* Dynamic Filters */}
      {filters.map((filter) => (
        <FormField key={filter.key} label={filter.label}>
          <SearchableSelect
            name={filter.key}
            value={filterValues[filter.key] ?? "all"}
            onChange={(value) =>
              onFilterChange?.(filter.key, value)
            }
            options={filter.options}
            searchable={false}
            placeholder={`Select ${filter.label}`}
            className="w-full"
          />
        </FormField>
      ))}
    </div>
  );
}
