"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ApiSession } from "@/lib/api";
import { getBillingReport } from "./billingReportQueries";

export function useBillingReports(
  session: ApiSession | null | undefined,
  options: {
    branchId?: string;
    invoiceCount: number;
    monthStart: string;
    monthEnd: string;
    canViewRevenueSummary: boolean;
    canViewSettlementSummary: boolean;
  },
) {
  const queryClient = useQueryClient();
  const {
    branchId,
    invoiceCount,
    monthStart,
    monthEnd,
    canViewRevenueSummary,
    canViewSettlementSummary,
  } = options;
  const [dueReport, setDueReport] = useState<any>(null);
  const [currentMonthDueReport, setCurrentMonthDueReport] = useState<any>(null);
  const [revenueReport, setRevenueReport] = useState<any>(null);
  const [collectionReport, setCollectionReport] = useState<any>(null);
  const [settlement, setSettlement] = useState<any>(null);

  const branchReportQuery = branchId
    ? `?branch_id=${encodeURIComponent(branchId)}`
    : "";
  const monthlyReportParams = new URLSearchParams({
    from_date: monthStart,
    to_date: monthEnd,
  });
  if (branchId) monthlyReportParams.set("branch_id", branchId);
  const monthlyReportQuery = monthlyReportParams.toString();

  async function loadReports(force = false) {
    if (!session) return;
    const duePath = `/billing/reports/due-collection${branchReportQuery}`;
    const currentMonthDuePath =
      `/billing/reports/due-collection?${monthlyReportQuery}`;
    const revenuePath =
      `/billing/reports/revenue?group_by=doctor&${monthlyReportQuery}`;
    const collectionsPath =
      `/billing/reports/collections?${monthlyReportQuery}`;
    const settlementPath =
      `/billing/doctor-settlements/summary${branchReportQuery}`;
    const [due, currentMonthDue, revenue, collections, summary] =
      await Promise.all([
        canViewRevenueSummary
          ? getBillingReport(queryClient, session, duePath, force).catch(
              () => null,
            )
          : Promise.resolve(null),
        canViewRevenueSummary
          ? getBillingReport(
              queryClient,
              session,
              currentMonthDuePath,
              force,
            ).catch(() => null)
          : Promise.resolve(null),
        canViewRevenueSummary
          ? getBillingReport(queryClient, session, revenuePath, force).catch(
              () => null,
            )
          : Promise.resolve(null),
        canViewRevenueSummary
          ? getBillingReport(
              queryClient,
              session,
              collectionsPath,
              force,
            ).catch(
              () => null,
            )
          : Promise.resolve(null),
        canViewSettlementSummary
          ? getBillingReport(
              queryClient,
              session,
              settlementPath,
              force,
            ).catch(() => null)
          : Promise.resolve(null),
      ]);
    setDueReport(due);
    setCurrentMonthDueReport(currentMonthDue);
    setRevenueReport(revenue);
    setCollectionReport(collections);
    setSettlement(summary);
  }

  useEffect(() => {
    if (session) loadReports();
  }, [
    session?.tenantId,
    invoiceCount,
    branchId,
    monthStart,
    monthEnd,
    canViewRevenueSummary,
    canViewSettlementSummary,
  ]);

  return {
    dueReport,
    currentMonthDueReport,
    revenueReport,
    collectionReport,
    settlement,
    setSettlement,
    loadReports,
  };
}
