import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import type { QueryFieldSchema } from "@/utils/queryFilter";
import {
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_STATUS_FILTER_OPTIONS,
} from "./constants";

export function getExpenseTableSchema(view: "months" | "expenses"): TableSchema {
  return {
    id: `expenses-${view}`,
    searchLabel: "Expenses",
    searchPlaceholder: "Search description",
    filters: [
      { key: "status", label: "Status", options: EXPENSE_STATUS_FILTER_OPTIONS },
      {
        key: "category",
        label: "Category",
        options: [{ value: "all", label: "All Categories" }, ...EXPENSE_CATEGORY_OPTIONS],
      },
    ],
    sortFields:
      view === "months"
        ? [
            { key: "label", label: "Month" },
            { key: "count", label: "Expense count" },
            { key: "total", label: "Total amount" },
          ]
        : [
            { key: "incurredOn", label: "Date" },
            { key: "category", label: "Category" },
            { key: "amount", label: "Amount" },
            { key: "status", label: "Status" },
          ],
  };
}

function distinctFieldOptions(
  rows: any[],
  key: string,
  labelFor?: (value: string) => string,
): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  rows.forEach((row) => {
    const raw = row[key];
    if (raw === null || raw === undefined || raw === "") return;
    const value = String(raw);
    if (!seen.has(value)) seen.set(value, labelFor ? labelFor(value) : value);
  });
  return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
}

// status/category are server-side query params (see useExpensesData) and
// stay as the fixed dropdowns above — this ad-hoc builder is a client-side
// layer on top of whatever page that server call already returned, per the
// accepted client-filter scope limitation for server-paginated modules.
// `incurredOn`'s "Fiscal Year" operator assumes an April–March year, same
// as the rest of the app's billing/reporting (see fiscalYearRange in
// utils/queryFilter.ts) — flagging since expenses are financial records.
export function getExpenseQueryFields(
  view: "months" | "expenses",
  rows: any[],
): QueryFieldSchema[] {
  if (view === "months") {
    return [
      { key: "label", label: "Month", type: "text" },
      { key: "count", label: "Expense Count", type: "number" },
      { key: "total", label: "Total Amount", type: "number" },
    ];
  }
  return [
    { key: "description", label: "Description", type: "text" },
    { key: "subcategory", label: "Subcategory", type: "text" },
    { key: "submittedBy", label: "Submitted By", type: "text" },
    {
      key: "branchName",
      label: "Branch",
      type: "select",
      options: distinctFieldOptions(rows, "branchName"),
    },
    { key: "amount", label: "Amount", type: "number" },
    { key: "incurredOn", label: "Incurred On", type: "date" },
    { key: "createdAt", label: "Created On", type: "date" },
  ];
}
