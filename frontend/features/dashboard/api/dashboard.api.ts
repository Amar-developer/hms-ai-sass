import { apiFetch } from "@/lib/api";

interface DashboardApiParams {
  branchId?: string;
  today: string;
  monthStart: string;
  monthEnd: string;
  apiSession: any;
}

export async function getDashboardReports({
  branchId,
  today,
  monthStart,
  monthEnd,
  apiSession,
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

  const [collections, todayPaid, monthlyDue, todayDue, patientCount] =
    await Promise.all([
      apiFetch(
        `/billing/reports/collections?${monthlyParams}`,
        apiSession,
      ).catch(() => null),

      apiFetch(`/billing/reports/collections?${todayParams}`, apiSession).catch(
        () => null,
      ),

      apiFetch(
        `/billing/reports/due-collection?${monthlyParams}`,
        apiSession,
      ).catch(() => null),

      apiFetch(
        `/billing/reports/due-collection?${todayParams}`,
        apiSession,
      ).catch(() => null),

      apiFetch(
        `/patients/count?from_date=${today}&to_date=${today}`,
        apiSession,
      ).catch(() => null),
    ]);

  return {
    collections,
    todayPaid,
    monthlyDue,
    todayDue,
    patientCount,
  };
}
