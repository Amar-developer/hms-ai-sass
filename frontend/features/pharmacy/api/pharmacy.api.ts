import { apiFetch, type ApiSession } from "@/lib/api";

export function fetchPharmacyIssues(session: ApiSession) {
  return apiFetch("/pharmacy/issues", session);
}

export function fetchPharmacyMedicines(session: ApiSession) {
  return apiFetch("/pharmacy/medicines", session);
}

export function fetchPharmacyBatches(session: ApiSession) {
  return apiFetch("/pharmacy/batches", session);
}

export function fetchPharmacySuppliers(session: ApiSession) {
  return apiFetch("/pharmacy/suppliers", session);
}

export function fetchLowStock(session: ApiSession, branchId?: string) {
  return apiFetch(`/pharmacy/low-stock?branch_id=${branchId}`, session);
}

export function fetchAvailableMedicines(session: ApiSession, query = "") {
  return apiFetch(`/pharmacy/catalog/available-medicines${query}`, session);
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
