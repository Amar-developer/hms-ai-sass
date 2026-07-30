"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import {
  fetchCollectionsReport,
  fetchDueCollectionReport,
  fetchRevenueReport,
  fetchSettlementSummary,
} from "./billing.api";

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

  async function loadReports() {
    if (!session) return;
    const [due, currentMonthDue, revenue, collections, summary] =
      await Promise.all([
        canViewRevenueSummary
          ? fetchDueCollectionReport(session, branchReportQuery).catch(
              () => null,
            )
          : Promise.resolve(null),
        canViewRevenueSummary
          ? fetchDueCollectionReport(session, `?${monthlyReportQuery}`).catch(
              () => null,
            )
          : Promise.resolve(null),
        canViewRevenueSummary
          ? fetchRevenueReport(session, monthlyReportQuery).catch(() => null)
          : Promise.resolve(null),
        canViewRevenueSummary
          ? fetchCollectionsReport(session, monthlyReportQuery).catch(
              () => null,
            )
          : Promise.resolve(null),
        canViewSettlementSummary
          ? fetchSettlementSummary(session, branchReportQuery).catch(
              () => null,
            )
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
