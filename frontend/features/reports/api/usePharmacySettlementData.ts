"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as reportsApi from "./reports.api";

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
        const relevantIssueIds = Array.from(
          new Set(
            liveInvoices
              .filter((invoice: any) => invoice.pharmacy_issue_id)
              .map((invoice: any) => invoice.pharmacy_issue_id),
          ),
        );
        const sourceIssueIds = relevantIssueIds.length
          ? relevantIssueIds
          : (issueRows || []).slice(0, 200).map((issue: any) => issue.id);
        const details = await Promise.all(
          sourceIssueIds.map((issueId: any) =>
            reportsApi
              .getPharmacyIssueDetail(apiSession as ApiSession, issueId)
              .catch(() => null),
          ),
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
  }, [apiSession?.tenantId, liveInvoices.length, refreshTick]);

  return { medicineRows, pharmacyIssueDetails, pharmacySettlementLoading };
}
