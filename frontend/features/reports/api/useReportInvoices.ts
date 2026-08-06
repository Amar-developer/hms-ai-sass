"use client";

import { useEffect, useState } from "react";

import { fetchInvoicePage } from "@/features/billing/api/billing.api";

const REPORT_INVOICE_PAGE_SIZE = 100;

async function fetchInvoiceRange(
  apiSession: any,
  branchId: string | undefined,
  fromDate: string,
  toDate: string,
) {
  const firstParams = new URLSearchParams({
    limit: String(REPORT_INVOICE_PAGE_SIZE),
    offset: "0",
  });
  if (fromDate) firstParams.set("from_date", fromDate);
  if (toDate) firstParams.set("to_date", toDate);
  if (branchId) firstParams.set("branch_id", branchId);

  const first = await fetchInvoicePage(apiSession, firstParams);
  const rows = Array.isArray(first?.items) ? [...first.items] : [];
  const total = Number(first?.total || rows.length);
  for (
    let offset = REPORT_INVOICE_PAGE_SIZE;
    offset < total;
    offset += REPORT_INVOICE_PAGE_SIZE
  ) {
    const params = new URLSearchParams(firstParams);
    params.set("offset", String(offset));
    const page = await fetchInvoicePage(apiSession, params);
    if (Array.isArray(page?.items)) rows.push(...page.items);
  }
  return rows;
}

export function useReportInvoices({
  apiSession,
  branchId,
  ranges,
  refreshTick,
}: any) {
  const [invoices, setInvoices] = useState<any[] | null>(null);
  const normalizedRanges = Array.from(
    new Map(
      ranges.map((range: [string, string]) => [range.join(":"), range]),
    ).values(),
  ) as [string, string][];
  const rangeKey = normalizedRanges
    .map((range: [string, string]) => `${range[0]}:${range[1]}`)
    .join("|");

  useEffect(() => {
    if (!apiSession) {
      setInvoices(null);
      return;
    }
    let active = true;
    Promise.all(
      normalizedRanges.map(([fromDate, toDate]: [string, string]) =>
        fetchInvoiceRange(apiSession, branchId, fromDate, toDate),
      ),
    )
      .then((pages) => {
        if (!active) return;
        const unique = new Map<string, any>();
        pages.flat().forEach((invoice) => unique.set(invoice.id, invoice));
        setInvoices([...unique.values()]);
      })
      .catch(() => {
        if (active) setInvoices(null);
      });
    return () => {
      active = false;
    };
  }, [apiSession?.tenantId, branchId, rangeKey, refreshTick]);

  return invoices;
}
