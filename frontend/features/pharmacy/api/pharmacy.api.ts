import { apiFetch, type ApiSession } from "@/lib/api";

export function fetchPharmacyIssues(session: ApiSession, signal?: AbortSignal) {
  return apiFetch("/pharmacy/issues", session, { signal });
}

export function fetchPharmacyIssuePage(
  session: ApiSession,
  params: URLSearchParams,
) {
  return apiFetch(`/pharmacy/issues/page?${params.toString()}`, session);
}

export function fetchPharmacyIssueFilterOptions(
  session: ApiSession,
  params: URLSearchParams,
) {
  return apiFetch(
    `/pharmacy/issues/filter-options?${params.toString()}`,
    session,
  );
}

export function fetchPharmacyMedicines(session: ApiSession, signal?: AbortSignal) {
  return apiFetch("/pharmacy/medicines", session, { signal });
}

export function fetchPharmacyBatches(session: ApiSession, signal?: AbortSignal) {
  return apiFetch("/pharmacy/batches", session, { signal });
}

export function fetchPharmacySuppliers(session: ApiSession, signal?: AbortSignal) {
  return apiFetch("/pharmacy/suppliers", session, { signal });
}

export function fetchLowStock(
  session: ApiSession,
  branchId?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (branchId) params.set("branch_id", branchId);
  return apiFetch(
    `/pharmacy/low-stock${params.toString() ? `?${params}` : ""}`,
    session,
    { signal },
  );
}

export function fetchAvailableMedicines(
  session: ApiSession,
  query = "",
  signal?: AbortSignal,
) {
  return apiFetch(`/pharmacy/catalog/available-medicines${query}`, session, {
    signal,
  });
}

export function createPharmacyMedicine(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/pharmacy/medicines", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createPharmacySupplier(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/pharmacy/suppliers", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createPharmacyPurchase(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/pharmacy/purchases", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createPharmacyReturn(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/pharmacy/returns", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createPharmacyIssue(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/pharmacy/issues", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createPharmacyIssueFromConsultation(
  session: ApiSession,
  consultationId: string,
  payload: Record<string, unknown>,
) {
  return apiFetch(
    `/pharmacy/issues/from-consultation/${consultationId}`,
    session,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function updatePharmacyIssueStatus(
  session: ApiSession,
  issueId: string,
  payload: Record<string, unknown>,
) {
  return apiFetch(`/pharmacy/issues/${issueId}/status`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updatePharmacyIssueAmount(
  session: ApiSession,
  issueId: string,
  payload: Record<string, unknown>,
) {
  return apiFetch(`/pharmacy/issues/${issueId}/amount`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createInvoiceFromPharmacyIssue(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/billing/invoices/from-pharmacy-issue", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchConsultationDetail(
  session: ApiSession,
  consultationId: string,
) {
  return apiFetch(`/consultations/${consultationId}`, session);
}
