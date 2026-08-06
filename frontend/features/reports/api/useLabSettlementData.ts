"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as reportsApi from "./reports.api";
import { mapWithConcurrency } from "@/lib/concurrency";

type UseLabSettlementDataParams = {
  apiSession: ApiSession | null | undefined;
  liveInvoices: any[];
  refreshTick: number;
};

export function useLabSettlementData({
  apiSession,
  liveInvoices,
  refreshTick,
}: UseLabSettlementDataParams) {
  const [labTests, setLabTests] = useState<any[]>([]);
  const [labPackages, setLabPackages] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [labOrderDetails, setLabOrderDetails] = useState<any[]>([]);
  const [labSettlementLoading, setLabSettlementLoading] = useState(false);
  const labInvoiceOrderIds = Array.from(
    new Set(
      liveInvoices
        .map((invoice: any) => invoice.lab_order_id)
        .filter(Boolean),
    ),
  ).sort();
  const labInvoiceOrderIdsKey = labInvoiceOrderIds.join("|");

  useEffect(() => {
    if (!apiSession?.tenantId) return;
    let cancelled = false;
    async function loadLabSettlementData() {
      setLabSettlementLoading(true);
      try {
        const [testRows, packageRows, supplierRows, orderRows] =
          await Promise.all([
            reportsApi.listLabTests(apiSession as ApiSession).catch(() => []),
            reportsApi
              .listLabPackages(apiSession as ApiSession)
              .catch(() => []),
            reportsApi
              .listSuppliers(apiSession as ApiSession)
              .catch(() => []),
            reportsApi.listLabOrders(apiSession as ApiSession).catch(() => []),
          ]);
        if (cancelled) return;
        setLabTests(testRows || []);
        setLabPackages(packageRows || []);
        setSuppliers(supplierRows || []);
        const sourceOrderIds = labInvoiceOrderIds.length
          ? labInvoiceOrderIds
          : (orderRows || []).slice(0, 200).map((order: any) => order.id);
        const details = await mapWithConcurrency(
          sourceOrderIds,
          (orderId: any) =>
            reportsApi
              .getLabOrderDetail(apiSession as ApiSession, orderId)
              .catch(() => null),
          4,
        );
        if (!cancelled) setLabOrderDetails(details.filter(Boolean));
      } finally {
        if (!cancelled) setLabSettlementLoading(false);
      }
    }
    loadLabSettlementData();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId, labInvoiceOrderIdsKey, refreshTick]);

  return {
    labTests,
    labPackages,
    suppliers,
    labOrderDetails,
    labSettlementLoading,
  };
}
