"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as reportsApi from "./reports.api";
import { mapWithConcurrency } from "@/lib/concurrency";

type UsePharmacySettlementDataParams = {
  apiSession: ApiSession | null | undefined;
  liveInvoices: any[];
  refreshTick: number;
};

export function usePharmacySettlementData({
  apiSession,
  liveInvoices,
  refreshTick,
}: UsePharmacySettlementDataParams) {
  const [medicineRows, setMedicineRows] = useState<any[]>([]);
  const [pharmacyIssueDetails, setPharmacyIssueDetails] = useState<any[]>([]);
  const [pharmacySettlementLoading, setPharmacySettlementLoading] =
    useState(false);
  const pharmacyInvoiceIssueIds = Array.from(
    new Set(
      liveInvoices
        .map((invoice: any) => invoice.pharmacy_issue_id)
        .filter(Boolean),
    ),
  ).sort();
  const pharmacyInvoiceIssueIdsKey = pharmacyInvoiceIssueIds.join("|");

  useEffect(() => {
    if (!apiSession?.tenantId) return;
    let cancelled = false;
    async function loadPharmacySettlementData() {
      setPharmacySettlementLoading(true);
      try {
        const [medicines, issueRows] = await Promise.all([
          reportsApi.listMedicines(apiSession as ApiSession).catch(() => []),
          reportsApi
            .listPharmacyIssues(apiSession as ApiSession)
            .catch(() => []),
        ]);
        if (cancelled) return;
        setMedicineRows(medicines || []);
        const sourceIssueIds = pharmacyInvoiceIssueIds.length
          ? pharmacyInvoiceIssueIds
          : (issueRows || []).slice(0, 200).map((issue: any) => issue.id);
        const details = await mapWithConcurrency(
          sourceIssueIds,
          (issueId: any) =>
            reportsApi
              .getPharmacyIssueDetail(apiSession as ApiSession, issueId)
              .catch(() => null),
          4,
        );
        if (!cancelled) setPharmacyIssueDetails(details.filter(Boolean));
      } finally {
        if (!cancelled) setPharmacySettlementLoading(false);
      }
    }
    loadPharmacySettlementData();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId, pharmacyInvoiceIssueIdsKey, refreshTick]);

  return { medicineRows, pharmacyIssueDetails, pharmacySettlementLoading };
}
