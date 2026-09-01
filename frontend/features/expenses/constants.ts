import type { ExpenseCategory, ExpenseStatus } from "./types";

export const EXPENSE_CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "supplies", label: "Supplies" },
  { value: "travel", label: "Travel" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
];

export const EXPENSE_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "reimbursed", label: "Reimbursed" },
];

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  reimbursed: "Reimbursed",
};

export const EXPENSE_STATUS_TONE: Record<ExpenseStatus, "amber" | "green" | "red" | "blue"> = {
  pending: "amber",
  approved: "blue",
  rejected: "red",
  reimbursed: "green",
};
