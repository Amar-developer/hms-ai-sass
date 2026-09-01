import { apiFetch } from "@/lib/api";
import type { QueryClient } from "@tanstack/react-query";
import { getBillingReport } from "@/features/billing/api/billingReportQueries";

interface DashboardApiParams {
  branchId?: string;
  today: string;
  monthStart: string;
  monthEnd: string;
  apiSession: any;
  queryClient?: QueryClient;
}

export async function getDashboardReports({
  branchId,
  today,
  monthStart,
  monthEnd,
  apiSession,
  queryClient,
}: DashboardApiParams) {
  const monthlyParams = new URLSearchParams({
    from_date: monthStart,
    to_date: monthEnd,
  });

  const todayParams = new URLSearchParams({
    from_date: today,
    to_date: today,
  });

  if (branchId) {
    monthlyParams.set("branch_id", branchId);
    todayParams.set("branch_id", branchId);
  }

  const homeCareParams = new URLSearchParams();
  if (branchId) homeCareParams.set("branch_id", branchId);

  const [
    collections,
    todayPaid,
    monthlyDue,
    todayDue,
    patientCount,
    homeCareBookings,
  ] =
    await Promise.all([
      (queryClient
        ? getBillingReport(
            queryClient,
            apiSession,
            `/billing/reports/collections?${monthlyParams}`,
          )
        : apiFetch(
            `/billing/reports/collections?${monthlyParams}`,
            apiSession,
          )
      ).catch(() => null),

      (queryClient
        ? getBillingReport(
            queryClient,
            apiSession,
            `/billing/reports/collections?${todayParams}`,
          )
        : apiFetch(
            `/billing/reports/collections?${todayParams}`,
            apiSession,
          )
      ).catch(() => null),

      (queryClient
        ? getBillingReport(
            queryClient,
            apiSession,
            `/billing/reports/due-collection?${monthlyParams}`,
          )
        : apiFetch(
            `/billing/reports/due-collection?${monthlyParams}`,
            apiSession,
          )
      ).catch(() => null),

      (queryClient
        ? getBillingReport(
            queryClient,
            apiSession,
            `/billing/reports/due-collection?${todayParams}`,
          )
        : apiFetch(
            `/billing/reports/due-collection?${todayParams}`,
            apiSession,
          )
      ).catch(() => null),

      apiFetch(
        `/patients/count?from_date=${today}&to_date=${today}`,
        apiSession,
      ).catch(() => null),

      apiFetch(
        `/home-care/bookings${homeCareParams.toString() ? `?${homeCareParams}` : ""}`,
        apiSession,
      ).catch(() => []),
    ]);

  return {
    collections,
    todayPaid,
    monthlyDue,
    todayDue,
    patientCount,
    homeCareBookings,
  };
}
