import { apiBlob, apiFetch, apiUpload, type ApiSession } from "@/lib/api";

export function listOrders(session: ApiSession) {
  return apiFetch("/lab/orders", session);
}

export function getOrderDetail(
  session: ApiSession,
  orderId: string,
  options: { signal?: AbortSignal } = {},
) {
  return apiFetch(`/lab/orders/${orderId}`, session, {
    signal: options.signal,
  });
}

export function listConsultationReferrals(session: ApiSession) {
  return apiFetch("/lab/consultation-referrals", session);
}

export function listTests(session: ApiSession) {
  return apiFetch("/lab/catalog/tests", session);
}

export function listPackages(session: ApiSession) {
  return apiFetch("/lab/catalog/packages", session);
}

export function searchAvailableTests(session: ApiSession, search?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  return apiFetch(
    `/lab/catalog/available-tests${params.toString() ? `?${params}` : ""}`,
    session,
  );
}

export function listResultTemplates(session: ApiSession) {
  return apiFetch("/lab/result-templates", session);
}

export function listSuppliers(session: ApiSession) {
  return apiFetch("/pharmacy/suppliers", session);
}

export function listLabReportFiles(session: ApiSession) {
  return apiFetch("/files?category=lab_report&limit=500", session);
}

export function createOrder(session: ApiSession, payload: any) {
  return apiFetch("/lab/orders", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createOrderFromConsultation(
  session: ApiSession,
  consultationId: string,
  payload: any,
) {
  return apiFetch(`/lab/orders/from-consultation/${consultationId}`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function collectSample(
  session: ApiSession,
  orderId: string,
  payload: any,
) {
  return apiFetch(`/lab/orders/${orderId}/samples`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOrderStatus(
  session: ApiSession,
  orderId: string,
  payload: any,
) {
  return apiFetch(`/lab/orders/${orderId}/status`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function uploadOrderDocument(session: ApiSession, formData: FormData) {
  return apiUpload("/files", session, formData);
}

export function deleteFile(session: ApiSession, fileId: string) {
  return apiFetch(`/files/${fileId}`, session, { method: "DELETE" });
}

export function releaseResult(
  session: ApiSession,
  orderId: string,
  payload: any,
) {
  return apiFetch(`/lab/orders/${orderId}/results`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function downloadFile(session: ApiSession, fileId: string) {
  return apiBlob(`/files/${fileId}/download`, session);
}

export function downloadOrderReportsZip(session: ApiSession, orderId: string) {
  return apiBlob(`/lab/orders/${orderId}/reports.zip`, session);
}

export function downloadOrderReportPdf(session: ApiSession, orderId: string) {
  return apiBlob(`/lab/orders/${orderId}/report.pdf`, session);
}

export function createInvoiceFromLabOrder(session: ApiSession, payload: any) {
  return apiFetch("/billing/invoices/from-lab-order", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getConsultation(session: ApiSession, consultationId: string) {
  return apiFetch(`/consultations/${consultationId}`, session);
}
