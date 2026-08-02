import type { QueryClient } from "@tanstack/react-query";
import { apiFetch, type ApiSession } from "@/lib/api";

// Aggregate billing snapshots are expensive but change only after a billing
// write. A very short freshness window removes navigation duplicates while
// billing mutations invalidate the tenant prefix immediately.
export const BILLING_REPORT_STALE_MS = 15_000;

export function billingReportsTenantQueryKey(tenantId?: string) {
  return ["billing-report", tenantId] as const;
}

export function billingReportQueryKey(
  tenantId: string | undefined,
  path: string,
) {
  return [...billingReportsTenantQueryKey(tenantId), path] as const;
}

export function getBillingReport(
  queryClient: QueryClient,
  session: ApiSession,
  path: string,
  force = false,
) {
  return queryClient.fetchQuery({
    queryKey: billingReportQueryKey(session.tenantId, path),
    queryFn: () => apiFetch<any>(path, session),
    staleTime: force ? 0 : BILLING_REPORT_STALE_MS,
  });
}
