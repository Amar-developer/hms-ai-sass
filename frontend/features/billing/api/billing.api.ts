import { apiFetch, apiUpload, type ApiSession } from "@/lib/api";

export function fetchEnabledPaymentMethods(session: ApiSession) {
  return apiFetch(
    "/settings/resolve?module=payment&key=payment.methods_enabled",
    session,
  );
}

export function fetchInvoiceDelivery(session: ApiSession, invoiceId: string) {
  return apiFetch(
    `/billing/invoices/${encodeURIComponent(invoiceId)}/delivery`,
    session,
  );
}

export function fetchDueCollectionReport(session: ApiSession, query = "") {
  return apiFetch(`/billing/reports/due-collection${query}`, session);
}

export function fetchRevenueReport(session: ApiSession, query: string) {
  return apiFetch(
    `/billing/reports/revenue?group_by=doctor&${query}`,
    session,
  );
}

export function fetchCollectionsReport(session: ApiSession, query: string) {
  return apiFetch(`/billing/reports/collections?${query}`, session);
}

export function fetchSettlementSummary(session: ApiSession, query = "") {
  return apiFetch(`/billing/doctor-settlements/summary${query}`, session);
}

export function createInvoiceFromConsultation(
  session: ApiSession,
  payload: { consultation_id: string; created_by_user_id?: string },
) {
  return apiFetch("/billing/invoices/from-consultation", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function uploadInvoiceForDelivery(
  session: ApiSession,
  invoiceId: string,
  form: FormData,
) {
  return apiUpload(
    `/billing/invoices/${encodeURIComponent(invoiceId)}/send`,
    session,
    form,
  );
}

export function fetchInvoiceDetail(session: ApiSession, invoiceId: string) {
  return apiFetch(`/billing/invoices/${invoiceId}`, session);
}

export function fetchInvoiceItemSupplierOptions(
  session: ApiSession,
  invoiceId: string,
  itemId: string,
) {
  return apiFetch(
    `/billing/invoices/${invoiceId}/items/${itemId}/supplier-options`,
    session,
  );
}

export function createInvoicePayment(
  session: ApiSession,
  invoiceId: string,
  payload: Record<string, unknown>,
) {
  return apiFetch(`/billing/invoices/${invoiceId}/payments`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function applyInvoiceMembershipBenefit(
  session: ApiSession,
  invoiceId: string,
) {
  return apiFetch(
    `/billing/invoices/${invoiceId}/membership-benefit/apply`,
    session,
    { method: "POST" },
  );
}

export function createInvoiceCreditNote(
  session: ApiSession,
  invoiceId: string,
  payload: Record<string, unknown>,
) {
  return apiFetch(`/billing/invoices/${invoiceId}/credit-notes`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateInvoiceItemSupplierRequest(
  session: ApiSession,
  invoiceId: string,
  itemId: string,
  supplierId: string | null,
) {
  return apiFetch(
    `/billing/invoices/${invoiceId}/items/${itemId}/supplier`,
    session,
    {
      method: "PATCH",
      body: JSON.stringify({ supplier_id: supplierId }),
    },
  );
}

export function updateInvoiceLifecycle(
  session: ApiSession,
  invoiceId: string,
  kind: "cancel" | "amend",
  payload: Record<string, unknown>,
) {
  return apiFetch(`/billing/invoices/${invoiceId}/${kind}`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createInvoiceAdjustmentRequest(
  session: ApiSession,
  invoiceId: string,
  payload: Record<string, unknown>,
) {
  return apiFetch(
    `/billing/invoices/${invoiceId}/adjustment-requests`,
    session,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function executeInvoiceAdjustmentRequest(
  session: ApiSession,
  requestId: string,
  payload: Record<string, unknown>,
) {
  return apiFetch(
    `/billing/adjustment-requests/${requestId}/execute`,
    session,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function reviewInvoiceAdjustmentRequest(
  session: ApiSession,
  requestId: string,
  kind: "approve" | "reject",
  payload: Record<string, unknown>,
) {
  return apiFetch(
    `/billing/adjustment-requests/${requestId}/${kind}`,
    session,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function finalizeDoctorSettlement(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/billing/doctor-settlements/finalize", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
