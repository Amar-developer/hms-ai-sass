import { apiFetch, type ApiSession } from "@/lib/api";

export function listUsers(session: ApiSession) {
  return apiFetch("/identity/users", session);
}

export function getInvoiceDetail(session: ApiSession, invoiceId: string) {
  return apiFetch(`/billing/invoices/${invoiceId}`, session);
}

export function getInvoiceReportDetails(
  session: ApiSession,
  invoiceIds: string[],
) {
  const params = new URLSearchParams();
  invoiceIds.forEach((invoiceId) => params.append("ids", invoiceId));
  return apiFetch(`/billing/invoices/report-details?${params}`, session);
}

export function listLabTests(session: ApiSession) {
  return apiFetch("/lab/catalog/tests", session);
}

export function listLabPackages(session: ApiSession) {
  return apiFetch("/lab/catalog/packages", session);
}

export function listSuppliers(session: ApiSession) {
  return apiFetch("/pharmacy/suppliers", session);
}

export function listLabOrders(session: ApiSession) {
  return apiFetch("/lab/orders", session);
}

export function getLabOrderDetail(session: ApiSession, orderId: string) {
  return apiFetch(`/lab/orders/${orderId}`, session);
}

export function listMonthlySnapshots(session: ApiSession, branchId?: string) {
  return apiFetch(
    `/reports/monthly-snapshots${branchId ? `?branch_id=${branchId}` : ""}`,
    session,
  );
}

export function getDashboardMetrics(
  session: ApiSession,
  params: {
    fromDate: string;
    toDate: string;
    seriesFrom: string;
    seriesTo: string;
    branchId?: string;
  },
) {
  const query = new URLSearchParams({
    from_date: params.fromDate,
    to_date: params.toDate,
    series_from: params.seriesFrom,
    series_to: params.seriesTo,
  });
  if (params.branchId) query.set("branch_id", params.branchId);
  return apiFetch(`/reports/dashboard-metrics?${query}`, session);
}

export function archiveMonthlySnapshot(session: ApiSession, payload: any) {
  return apiFetch("/reports/monthly-snapshots/archive", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listHomeCareBookings(session: ApiSession, branchId?: string) {
  return apiFetch(
    `/home-care/bookings${branchId ? `?branch_id=${branchId}` : ""}`,
    session,
  );
}

export function listMedicines(session: ApiSession) {
  return apiFetch("/pharmacy/medicines", session);
}

export function listPharmacyIssues(session: ApiSession) {
  return apiFetch("/pharmacy/issues", session);
}

export function getPharmacyIssueDetail(session: ApiSession, issueId: string) {
  return apiFetch(`/pharmacy/issues/${issueId}`, session);
}

export function sendProfitEmailReport(session: ApiSession, payload: any) {
  return apiFetch("/reports/profit-email/send", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
