"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as reportsApi from "./reports.api";
import { mapWithConcurrency } from "@/lib/concurrency";

async function fetchInvoiceDetailsBatch(
  apiSession: ApiSession,
  invoiceIds: string[],
) {
  const chunks: string[][] = [];
  for (let index = 0; index < invoiceIds.length; index += 50) {
    chunks.push(invoiceIds.slice(index, index + 50));
  }
  const responses = await mapWithConcurrency(
    chunks,
    (chunk) =>
      reportsApi.getInvoiceReportDetails(apiSession, chunk).catch(() => []),
    2,
  );
  return responses.flat().filter(Boolean);
}

type UseInvoiceDetailsBatchParams = {
  apiSession: ApiSession | null | undefined;
  invoiceIds: string[];
  invoiceIdsKey: string;
  refreshTick: number;
};

/**
 * Fetches report-only invoice items/payments in server-side batches.
 * Owns its own `invoiceDetails`/`invoiceDetailsLoading` state — use this
 * when nothing needs to read that state before this hook's ids are ready
 * (e.g. the home-care invoice ids, known from `liveInvoices` alone).
 */
export function useInvoiceDetailsBatch({
  apiSession,
  invoiceIds,
  invoiceIdsKey,
  refreshTick,
}: UseInvoiceDetailsBatchParams) {
  const [invoiceDetails, setInvoiceDetails] = useState<any[]>([]);
  const [invoiceDetailsLoading, setInvoiceDetailsLoading] = useState(false);

  useEffect(() => {
    if (!apiSession?.tenantId || invoiceIds.length === 0) {
      setInvoiceDetails([]);
      setInvoiceDetailsLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setInvoiceDetailsLoading(true);
      try {
        const details = await fetchInvoiceDetailsBatch(
          apiSession as ApiSession,
          invoiceIds,
        );
        if (!cancelled) setInvoiceDetails(details);
      } finally {
        if (!cancelled) setInvoiceDetailsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId, invoiceIdsKey, refreshTick]);

  return { invoiceDetails, invoiceDetailsLoading };
}

type UseInvoiceDetailsBatchEffectParams = UseInvoiceDetailsBatchParams & {
  setInvoiceDetails: (rows: any[]) => void;
  setInvoiceDetailsLoading: (value: boolean) => void;
};

/**
 * Same fetch as `useInvoiceDetailsBatch`, but writes into caller-owned
 * state instead of owning its own. Use this when other computations in the
 * component need to read the (initially-empty) state *before* this hook's
 * `invoiceIds` argument is itself known — e.g. the filtered-report invoice
 * ids, which are derived using a supplier lookup built from these same
 * invoice details.
 */
export function useInvoiceDetailsBatchEffect({
  apiSession,
  invoiceIds,
  invoiceIdsKey,
  refreshTick,
  setInvoiceDetails,
  setInvoiceDetailsLoading,
}: UseInvoiceDetailsBatchEffectParams) {
  useEffect(() => {
    if (!apiSession?.tenantId || invoiceIds.length === 0) {
      setInvoiceDetails([]);
      setInvoiceDetailsLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setInvoiceDetailsLoading(true);
      try {
        const details = await fetchInvoiceDetailsBatch(
          apiSession as ApiSession,
          invoiceIds,
        );
        if (!cancelled) setInvoiceDetails(details);
      } finally {
        if (!cancelled) setInvoiceDetailsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId, invoiceIdsKey, refreshTick]);
}
