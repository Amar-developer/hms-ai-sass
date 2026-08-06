"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as homeCareApi from "./homecare.api";

type UseHomeCareBookingDetailParams = {
  apiSession: ApiSession | null | undefined;
  bookingId?: string;
};

/**
 * Owns the selected booking's generated invoice (if any). Reloads whenever
 * the selected booking changes, and exposes `loadInvoice` for callers to
 * refresh after generating one.
 */
export function useHomeCareBookingDetail({
  apiSession,
  bookingId,
}: UseHomeCareBookingDetailParams) {
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);

  async function loadInvoice(id: string) {
    if (!apiSession) return;
    setInvoiceDetail(null);
    try {
      setInvoiceDetail(await homeCareApi.getBookingInvoice(apiSession, id));
    } catch {}
  }

  useEffect(() => {
    if (bookingId) loadInvoice(bookingId);
    else setInvoiceDetail(null);
  }, [bookingId]);

  return { invoiceDetail, setInvoiceDetail, loadInvoice };
}
