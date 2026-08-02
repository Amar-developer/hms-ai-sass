"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import Invoice from "@/features/billing/components/Invoice";
import { exportInvoicePdf } from "@/features/billing/exportInvoicePdf";
import {
  invoiceReceiptFilename,
  loadInvoiceReceiptProps,
} from "@/features/billing/invoiceReceiptData";
import type { InvoiceProps } from "@/features/billing/types";
import type { ApiSession } from "@/lib/api";

function readSession(): ApiSession | null {
  const raw = window.localStorage.getItem("medizinhub.session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ApiSession;
  } catch {
    return null;
  }
}

export default function ReceiptPage() {
  const queryClient = useQueryClient();
  const [invoiceProps, setInvoiceProps] = useState<InvoiceProps | null>(null);
  const [error, setError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const printRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const invoiceId = new URLSearchParams(window.location.search).get("id");
    const session = readSession();

    if (!invoiceId) {
      setError("No invoice was selected.");
      return;
    }
    if (!session) {
      setError("Your session has expired. Please log in again.");
      return;
    }

    let cancelled = false;
    let releaseLogo: () => void = () => undefined;
    void (async () => {
      try {
        const { props, release } = await loadInvoiceReceiptProps(
          invoiceId,
          session,
          queryClient,
        );
        if (cancelled) {
          release();
          return;
        }
        releaseLogo = release;
        setInvoiceProps(props);
      } catch (caught: any) {
        if (!cancelled) {
          setError(caught?.message || "Could not load the invoice.");
        }
      }
    })();

    return () => {
      cancelled = true;
      releaseLogo();
    };
  }, []);

  async function downloadPdf() {
    if (!invoiceProps || !printRootRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await document.fonts?.ready;
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.complete ? Promise.resolve() : img.decode().catch(() => undefined),
        ),
      );
      await exportInvoicePdf(printRootRef.current, invoiceReceiptFilename(invoiceProps));
    } finally {
      setIsExporting(false);
    }
  }

  useEffect(() => {
    if (!invoiceProps) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) void downloadPdf();
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceProps]);

  if (error) {
    return <main className="p-8 text-sm text-red-600">{error}</main>;
  }
  if (!invoiceProps) {
    return <main className="p-8 text-sm text-slate-500">Loading invoice…</main>;
  }

  return (
    <main className="invoice-print bg-slate-100 p-4 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[900px] justify-end print:hidden">
        <button
          type="button"
          onClick={() => void downloadPdf()}
          disabled={isExporting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {isExporting ? "Generating PDF…" : "Download PDF"}
        </button>
      </div>
      <div ref={printRootRef}>
        <Invoice {...invoiceProps} />
      </div>
    </main>
  );
}
