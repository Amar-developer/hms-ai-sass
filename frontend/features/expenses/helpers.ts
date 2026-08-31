import type { Expense, ExpenseSubcategoryConfig } from "./types";

export function mapExpense(
  raw: any,
  branchNameById: Record<string, string>,
  currentUserId?: string,
): Expense {
  return {
    id: raw.id,
    branchId: raw.branch_id ?? null,
    branchName: raw.branch_id
      ? branchNameById[raw.branch_id] ?? raw.branch_id
      : "—",
    category: raw.category,
    subcategory: raw.subcategory ?? null,
    amount: Number(raw.amount),
    currency: raw.currency,
    incurredOn: raw.incurred_on,
    description: raw.description,
    status: raw.status,
    submittedBy:
      currentUserId && raw.submitted_by === currentUserId
        ? "You"
        : raw.submitted_by,
    submittedByName: raw.submitted_by_name ?? null,
    approvedBy: raw.approved_by ?? undefined,
    approvedByName: raw.approved_by_name ?? null,
    quantity: raw.quantity != null ? Number(raw.quantity) : null,
    rejectionReason: raw.rejection_reason ?? undefined,
    receiptName: raw.receipt_file_id ?? undefined,
    createdByUserId: raw.created_by_user_id ?? null,
    updatedByUserId: raw.updated_by_user_id ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function mapExpenseSubcategoryConfig(raw: any): ExpenseSubcategoryConfig {
  return {
    id: raw.id,
    category: raw.category,
    name: raw.name,
    defaultAmount: raw.default_amount != null ? Number(raw.default_amount) : null,
    requiresQuantity: Boolean(raw.requires_quantity),
    isActive: Boolean(raw.is_active),
  };
}

export type MonthGroup = {
  monthKey: string;
  label: string;
  count: number;
  total: number;
};

export function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function groupExpensesByMonth(expenses: Expense[]): MonthGroup[] {
  const totals = new Map<string, { count: number; total: number }>();
  for (const expense of expenses) {
    const monthKey = expense.incurredOn.slice(0, 7);
    const existing = totals.get(monthKey) ?? { count: 0, total: 0 };
    existing.count += 1;
    existing.total += expense.amount;
    totals.set(monthKey, existing);
  }
  return Array.from(totals.entries())
    .map(([monthKey, { count, total }]) => ({
      monthKey,
      label: monthLabel(monthKey),
      count,
      total,
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export function getMonthDateRange(month: number, year: number) {
  const monthIndex = month - 1

  const firstDay = new Date(year, monthIndex, 1)
  const lastDay = new Date(year, monthIndex + 1, 0)

  const formatDate = (date: Date) => {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    const dd = String(date.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  }

  return {
    min: formatDate(firstDay),
    max: formatDate(lastDay),
  }
}
