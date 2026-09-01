"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input, SearchableSelect, Button } from "./ui";
import {
  OPERATORS_BY_TYPE,
  TIMESPAN_OPTIONS,
  fiscalYearOptions,
  type QueryFieldSchema,
  type QueryFilterRow,
  type QueryOperator,
} from "@/utils/queryFilter";

let rowIdSeq = 0;
function nextRowId() {
  rowIdSeq += 1;
  return `qf-${rowIdSeq}-${Date.now()}`;
}

type AdaptiveQueryFilterPanelProps = {
  fields: QueryFieldSchema[];
  appliedFilters: QueryFilterRow[];
  onApply: (rows: QueryFilterRow[]) => void;
};

// The "+ Add a Filter" builder: pick a field, pick an operator (the set
// narrows to what that field's type supports), type a value — one row per
// condition, all rows AND-ed. Nothing is applied until "Apply Filters", so
// building a multi-row query doesn't refilter the table after every click.
export function AdaptiveQueryFilterPanel({
  fields,
  appliedFilters,
  onApply,
}: AdaptiveQueryFilterPanelProps) {
  const [draftRows, setDraftRows] = useState<QueryFilterRow[]>(appliedFilters);

  function fieldSchema(key: string) {
    return fields.find((f) => f.key === key);
  }

  function addRow() {
    const first = fields[0];
    if (!first) return;
    setDraftRows((rows) => [
      ...rows,
      {
        id: nextRowId(),
        field: first.key,
        operator: OPERATORS_BY_TYPE[first.type][0].value,
        value: "",
      },
    ]);
  }

  function updateRow(id: string, patch: Partial<QueryFilterRow>) {
    setDraftRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(id: string) {
    setDraftRows((rows) => rows.filter((row) => row.id !== id));
  }

  function handleFieldChange(id: string, key: string) {
    const field = fieldSchema(key);
    if (!field) return;
    updateRow(id, {
      field: key,
      operator: OPERATORS_BY_TYPE[field.type][0].value,
      value: "",
      value2: undefined,
    });
  }

  function apply() {
    onApply(
      draftRows.filter(
        (row) =>
          row.operator === "is_set" ||
          row.operator === "is_not_set" ||
          row.value.trim(),
      ),
    );
  }

  function clearAll() {
    setDraftRows([]);
    onApply([]);
  }

  return (
    <div className="w-[26rem] max-w-full ">
      {draftRows.length === 0 && (
        <p className="mb-2 text-xs text-slate-500">No filters applied.</p>
      )}
      <div className="flex flex-col gap-2 max-h-[30vh] overflow-y-auto">
        {draftRows.map((row) => {
          const field = fieldSchema(row.field);
          const operators = field ? OPERATORS_BY_TYPE[field.type] : [];
          const needsValue =
            row.operator !== "is_set" && row.operator !== "is_not_set";
          const needsSecondValue = row.operator === "between";
          const isSelectEquality =
            field?.type === "select" &&
            (row.operator === "equals" || row.operator === "not_equals");
          const isTimespan = field?.type === "date" && row.operator === "timespan";
          const isFiscalYear =
            field?.type === "date" && row.operator === "fiscal_year";
          const isPlainInput = !isSelectEquality && !isTimespan && !isFiscalYear;

          return (
            <div key={row.id} className="flex items-center gap-1.5">
              <SearchableSelect
                name={`field-${row.id}`}
                value={row.field}
                onChange={(value: string) => handleFieldChange(row.id, value)}
                options={fields.map((f) => ({ value: f.key, label: f.label }))}
                searchable={false}
                text="text-xs"
                className="w-32 shrink-0"
              />
              <SearchableSelect
                name={`op-${row.id}`}
                value={row.operator}
                onChange={(value: string) =>
                  updateRow(row.id, {
                    operator: value as QueryOperator,
                    value: "",
                    value2: undefined,
                  })
                }
                options={operators}
                searchable={false}
                text="text-xs"
                className="w-28 shrink-0"
              />
              {!needsValue && <div className="flex-1" />}
              {needsValue && isSelectEquality && (
                <SearchableSelect
                  name={`val-${row.id}`}
                  value={row.value}
                  onChange={(value: string) => updateRow(row.id, { value })}
                  options={field?.options || []}
                  searchable
                  allowCustom
                  searchPlaceholder="Search or type a value"
                  className="min-w-0 flex-1"
                  text="text-xs"
                />
              )}
              {needsValue && isTimespan && (
                <SearchableSelect
                  name={`val-${row.id}`}
                  value={row.value}
                  onChange={(value: string) => updateRow(row.id, { value })}
                  options={TIMESPAN_OPTIONS}
                  searchable={false}
                  placeholder="Select timespan"
                  className="min-w-0 flex-1"
                />
              )}
              {needsValue && isFiscalYear && (
                <SearchableSelect
                  name={`val-${row.id}`}
                  value={row.value}
                  onChange={(value: string) => updateRow(row.id, { value })}
                  options={fiscalYearOptions()}
                  searchable={false}
                  placeholder="Select fiscal year"
                  className="min-w-0 flex-1"
                />
              )}
              {needsValue && isPlainInput && (
                <Input
                  type={
                    field?.type === "number"
                      ? "number"
                      : field?.type === "date"
                        ? "date"
                        : "text"
                  }
                  value={row.value}
                  onChange={(e: any) =>
                    updateRow(row.id, { value: e.target.value })
                  }
                  placeholder={
                    row.operator === "in" || row.operator === "not_in"
                      ? "comma, separated, values"
                      : "Value"
                  }
                  // className="min-w-0 flex-1"
                />
              )}
              {needsSecondValue && (
                <Input
                  type={field?.type === "date" ? "date" : "number"}
                  value={row.value2 || ""}
                  onChange={(e: any) =>
                    updateRow(row.id, { value2: e.target.value })
                  }
                  placeholder="and"
                  className="rounded-lg px-2 py-2 lg:px-2 lg:py-2 text-xs lg:text-xs placeholder:text-xs w-24 shrink-0"
                />
              )}
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                title="Remove filter"
                className="shrink-0 text-slate-400 hover:text-red-500 hover:border hover:border-red-500"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900"
        >
          <Plus size={12} /> Add a Filter
        </button>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={clearAll}
            className="bg-slate-500 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-300"
          >
            Clear
          </Button>
          <Button type="button" onClick={apply} className="px-3 py-1.5 text-xs">
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  );
}
