import type { ApiSession } from "@/lib/api";
import {
  fetchInvoicePage,
  fetchPendingConsultationInvoicePage,
} from "@/features/billing/api/billing.api";
import { listOrders } from "@/features/lab/api/lab.api";
import { fetchPharmacyIssues } from "@/features/pharmacy/api/pharmacy.api";

export type OPDBillingQueueRow =
  | ({ queueType: "consultation" } & Record<string, any>)
  | ({ queueType: "lab" } & Record<string, any>)
  | ({ queueType: "pharmacy" } & Record<string, any>);

export function activeUnbilledConsultationSource(row: any) {
  const status = String(row?.status || "").toLowerCase();
  return (
    row?.consultation_id &&
    !row?.billing_invoice_id &&
    status !== "cancelled" &&
    status !== "canceled"
  );
}

export async function fetchOPDBillingQueueRows({
  apiSession,
  branchId,
}: {
  apiSession: ApiSession;
  branchId?: string;
}) {
  const params = new URLSearchParams({ limit: "100", offset: "0" });
  if (branchId) params.set("branch_id", branchId);
  const [consultationResult, labRows, pharmacyRows] = await Promise.all([
    fetchPendingConsultationInvoicePage(apiSession, params).catch(() => ({
      items: [],
    })),
    listOrders(apiSession).catch(() => []),
    fetchPharmacyIssues(apiSession).catch(() => []),
  ]);
  const consultationQueue = (Array.isArray(consultationResult?.items)
    ? consultationResult.items
    : []
  ).map((row: any) => ({ ...row, queueType: "consultation" as const }));
  const labQueue = (Array.isArray(labRows) ? labRows : [])
    .filter(
      (row: any) =>
        activeUnbilledConsultationSource(row) &&
        (!branchId || row.branch_id === branchId),
    )
    .map((row: any) => ({ ...row, queueType: "lab" as const }));
  const pharmacyQueue = (Array.isArray(pharmacyRows) ? pharmacyRows : [])
    .filter(
      (row: any) =>
        activeUnbilledConsultationSource(row) &&
        (!branchId || row.branch_id === branchId),
    )
    .map((row: any) => ({ ...row, queueType: "pharmacy" as const }));
  return [...consultationQueue, ...labQueue, ...pharmacyQueue];
}

export async function fetchOPDPaymentQueueRows({
  apiSession,
  branchId,
}: {
  apiSession: ApiSession;
  branchId?: string;
}) {
  const params = new URLSearchParams({
    limit: "100",
    offset: "0",
    payment_state: "due",
  });
  if (branchId) params.set("branch_id", branchId);
  const result = await fetchInvoicePage(apiSession, params).catch(() => ({
    items: [],
  }));
  return (Array.isArray(result?.items) ? result.items : []).filter(
    (invoice: any) =>
      invoice?.consultation_id &&
      (invoice.lab_order_id ||
        invoice.pharmacy_issue_id ||
        (!invoice.ip_admission_id &&
          !invoice.physiotherapy_case_id &&
          !invoice.home_care_booking_id)),
  );
}
