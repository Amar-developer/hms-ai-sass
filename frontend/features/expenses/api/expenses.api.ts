import { apiFetch, type ApiSession } from "@/lib/api";

export function fetchExpensePage(session: ApiSession, params: URLSearchParams) {
  return apiFetch(`/expenses?${params.toString()}`, session);
}

export function fetchExpenseFilterOptions(
  session: ApiSession,
  params: URLSearchParams,
) {
  return apiFetch(`/expenses/filter-options?${params.toString()}`, session);
}

export function fetchExpense(session: ApiSession, expenseId: string) {
  return apiFetch(`/expenses/${expenseId}`, session);
}

export function createExpense(session: ApiSession, payload: Record<string, unknown>) {
  return apiFetch("/expenses", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateExpense(
  session: ApiSession,
  expenseId: string,
  payload: Record<string, unknown>,
) {
  return apiFetch(`/expenses/${expenseId}`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function attachExpenseReceipt(
  session: ApiSession,
  expenseId: string,
  recieptFileId: string,
) {
  return apiFetch(`/expenses/${expenseId}/receipt`, session, {
    method: "POST",
    body: JSON.stringify({ reciept_file_id: recieptFileId }),
  });
}

export function approveExpense(session: ApiSession, expenseId: string) {
  return apiFetch(`/expenses/${expenseId}/approve`, session, { method: "POST" });
}

export function rejectExpense(session: ApiSession, expenseId: string, reason: string) {
  return apiFetch(`/expenses/${expenseId}/reject`, session, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function fetchRecentSubcategories(session: ApiSession) {
  return apiFetch("/expenses/subcategories/recent", session);
}

export function fetchExpenseSubcategoryConfigs(
  session: ApiSession,
  params?: { category?: string; activeOnly?: boolean },
) {
  const search = new URLSearchParams();
  if (params?.category) search.set("category", params.category);
  if (params?.activeOnly) search.set("active_only", "true");
  const query = search.toString();
  return apiFetch(
    `/expenses/subcategory-configs${query ? `?${query}` : ""}`,
    session,
  );
}

export function createExpenseSubcategoryConfig(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/expenses/subcategory-configs", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateExpenseSubcategoryConfig(
  session: ApiSession,
  subcategoryId: string,
  payload: Record<string, unknown>,
) {
  return apiFetch(`/expenses/subcategory-configs/${subcategoryId}`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteExpenseSubcategoryConfig(
  session: ApiSession,
  subcategoryId: string,
) {
  return apiFetch(`/expenses/subcategory-configs/${subcategoryId}`, session, {
    method: "DELETE",
  });
}
