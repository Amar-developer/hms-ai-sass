import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
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
