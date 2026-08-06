import { apiFetch, apiUpload, type ApiSession } from "@/lib/api";

export function fetchInvoicePage(
  session: ApiSession,
  params: URLSearchParams,
) {
  return apiFetch(`/billing/invoices/page?${params.toString()}`, session);
}

export function fetchPendingConsultationInvoicePage(
  session: ApiSession,
  params: URLSearchParams,
) {
  return apiFetch(
    `/billing/pending-consultation-invoices/page?${params.toString()}`,
    session,
  );
}

export function fetchInvoiceDelivery(session: ApiSession, invoiceId: string) {
  return apiFetch(
    `/billing/invoices/${encodeURIComponent(invoiceId)}/delivery`,
    session,
  );
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

export function fetchInvoiceDocument(session: ApiSession, invoiceId: string) {
  return apiFetch(
    `/billing/invoices/${encodeURIComponent(invoiceId)}/document`,
    session,
  );
}

export function finalizeInvoiceDocument(
  session: ApiSession,
  invoiceId: string,
  form: FormData,
) {
  return apiUpload(
    `/billing/invoices/${encodeURIComponent(invoiceId)}/document/finalize`,
    session,
    form,
  );
}

export function regenerateInvoiceDocument(
  session: ApiSession,
  invoiceId: string,
  form: FormData,
) {
  return apiUpload(
    `/billing/invoices/${encodeURIComponent(invoiceId)}/document/regenerate`,
    session,
    form,
  );
}

export function fetchInvoiceDeliveries(session: ApiSession, invoiceId: string) {
  return apiFetch(
    `/billing/invoices/${encodeURIComponent(invoiceId)}/deliveries`,
    session,
  );
}

export function sendInvoiceDocument(
  session: ApiSession,
  invoiceId: string,
  payload: { channel: "whatsapp" | "email"; idempotency_key: string },
) {
  return apiFetch(
    `/billing/invoices/${encodeURIComponent(invoiceId)}/send`,
    session,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
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

export function applyInvoiceOffer(
  session: ApiSession,
  invoiceId: string,
  payload?: { discount_offer_id?: string; code?: string },
) {
  return apiFetch(`/billing/invoices/${invoiceId}/offer/apply`, session, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export function removeInvoiceOffer(session: ApiSession, invoiceId: string) {
  return apiFetch(`/billing/invoices/${invoiceId}/offer/remove`, session, {
    method: "POST",
  });
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
