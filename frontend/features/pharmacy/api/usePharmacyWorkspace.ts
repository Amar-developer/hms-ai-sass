"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import type { PharmacyIssueSummary } from "@/lib/contracts";
import {
  fetchLowStock,
  fetchPharmacyBatches,
  fetchPharmacyIssues,
  fetchPharmacyMedicines,
  fetchPharmacySuppliers,
} from "./pharmacy.api";

export function usePharmacyWorkspace(
  session: ApiSession | null | undefined,
  branchId: string | undefined,
  options: { setMessage: (message: string) => void },
) {
  const { setMessage } = options;
  const [issues, setIssues] = useState<PharmacyIssueSummary[]>([]);
  const [issuesLoaded, setIssuesLoaded] = useState(false);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);

  async function load(signal?: AbortSignal) {
    if (!session) {
      setIssues([]);
      return;
    }
    try {
      const [issueRows, medicineRows, batchRows, supplierRows, lowRows] =
        await Promise.all([
          fetchPharmacyIssues(session, signal),
          fetchPharmacyMedicines(session, signal),
          fetchPharmacyBatches(session, signal),
          fetchPharmacySuppliers(session, signal),
          fetchLowStock(session, branchId, signal),
        ]);
      if (signal?.aborted) return;
      setIssues(issueRows);
      setMedicines(medicineRows);
      setBatches(batchRows);
      setSuppliers(supplierRows);
      setLowStock(lowRows);
    } catch (err: any) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessage(err.message || "Could not load pharmacy workspace.");
    } finally {
      if (!signal?.aborted) setIssuesLoaded(true);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [session?.tenantId, branchId]);

  return {
    issues,
    issuesLoaded,
    medicines,
    batches,
    suppliers,
    lowStock,
    load,
  };
}
