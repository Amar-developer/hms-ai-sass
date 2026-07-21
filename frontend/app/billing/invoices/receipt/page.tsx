"use client";

import { useEffect, useState } from "react";

import Invoice from "@/features/billing/components/Invoice";
import type { InvoiceProps } from "@/features/billing/types";
import { apiFetch, type ApiSession, uploadAssetUrl } from "@/lib/api";
import { resolveInvoiceLogoAsset } from "@/lib/imageAssets";

function readSession(): ApiSession | null {
  const raw = window.localStorage.getItem("medizinhub.session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ApiSession;
  } catch {
    return null;
  }
}

function safeFilename(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function invoiceDate(invoice: any) {
  const value = invoice.invoice_date || invoice.created_at;
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(value))
    : "";
}

function toInvoiceProps(
  detail: any,
  patient: any,
  branding: any,
  logoValue: unknown,
  bankValue: unknown,
): InvoiceProps {
  const invoice = detail.invoice || {};
  const bank =
    bankValue && typeof bankValue === "object"
      ? (bankValue as Record<string, unknown>)
      : {};
  const companyName =
    branding?.legal_name || branding?.name || "MedizinHub Healthcare";

  return {
    company: {
      name: companyName,
      tagline: branding?.description || undefined,
      address: branding?.address || "",
      phone: branding?.phone || "",
      gstin: String(bank.gstin || ""),
      logoUrl: uploadAssetUrl(String(logoValue || branding?.logo_url || "")),
    },
    invoiceNo: invoice.invoice_number || invoice.id || "",
    invoiceDate: invoiceDate(invoice),
    customer: {
      name: patient?.full_name || patient?.name || "Patient",
      phone: patient?.mobile || "",
      whatsapp: patient?.alternate_mobile || "",
      address: patient?.address || "",
    },
    items: (detail.items || []).map((item: any, index: number) => {
      const lineTotal = Number(item.total_amount || 0);
      const lineDiscount =
        item.discount_amount === null || item.discount_amount === undefined
          ? Math.round(
              (lineTotal * Number(invoice.discount_amount || 0)) /
                Math.max(Number(invoice.subtotal_amount || 0), 1),
            )
          : Number(item.discount_amount || 0);
      return {
        srNo: index + 1,
        name: item.description || item.item_type || "Item",
        qty: item.quantity || 1,
        mrp: item.mrp_amount || item.selling_amount || item.unit_amount || 0,
        discPercent:
          lineTotal > 0 ? Math.round((lineDiscount * 100) / lineTotal) : 0,
        rate: lineTotal,
      };
    }),
    bank: {
      name: String(bank.account_name || ""),
      branch: String(bank.branch_name || ""),
      accountNumber: String(bank.account_number || ""),
      ifsc: String(bank.ifsc || ""),
      upiId: String(bank.upi_id || ""),
      qrImageUrl: uploadAssetUrl(String(bank.qr_image_url || "")),
    },
    isPaid: String(invoice.status || "").toLowerCase() === "paid",
    signatoryLine: `For ${companyName}`,
    subTotal: Number(invoice.subtotal_amount || 0),
    discountAmount: Number(invoice.discount_amount || 0),
    taxableAmount: Number(invoice.taxable_amount || 0),
    taxAmount: Number(invoice.tax_amount || 0),
    taxLabel: invoice.tax_label || "Tax",
    total: Number(invoice.total_amount || 0),
  };
}

export default function ReceiptPage() {
  const [invoiceProps, setInvoiceProps] = useState<InvoiceProps | null>(null);
  const [error, setError] = useState("");

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
        const detail = await apiFetch(
          `/billing/invoices/${encodeURIComponent(invoiceId)}`,
          session,
        );
        const patientId = detail.invoice?.patient_id;
        const [patient, branding, logoSetting, bankSetting, logoFiles] =
          await Promise.all([
            patientId
              ? apiFetch(
                  `/patients/${encodeURIComponent(patientId)}`,
                  session,
                ).catch(() => null)
              : Promise.resolve(null),
            apiFetch("/tenants/current/branding", session).catch(() => null),
            apiFetch(
              "/settings/resolve?module=invoice&key=invoice.logo_url",
              session,
            ).catch(() => null),
            apiFetch(
              "/settings/resolve?module=accounts&key=accounts.bank_details",
              session,
            ).catch(() => null),
            apiFetch(
              "/files?category=logo&attached_to_doctype=Tenant&limit=20",
              session,
            ).catch(() => []),
          ]);
        if (cancelled) return;

        const resolvedLogo = await resolveInvoiceLogoAsset(
          logoSetting?.value || branding?.logo_url || "",
          logoFiles || [],
          session,
        );
        if (cancelled) {
          resolvedLogo.release();
          return;
        }
        releaseLogo = resolvedLogo.release;

        const props = toInvoiceProps(
          detail,
          patient,
          branding,
          resolvedLogo.url,
          bankSetting?.value,
        );
        document.title =
          [safeFilename(props.customer.name), safeFilename(props.invoiceNo)]
            .filter(Boolean)
            .join("-") || "invoice";
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

  useEffect(() => {
    if (!invoiceProps) return;
    let cancelled = false;
    const printWhenReady = async () => {
      await document.fonts?.ready;
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.complete ? Promise.resolve() : img.decode().catch(() => undefined),
        ),
      );
      if (!cancelled) window.print();
    };
    const timer = window.setTimeout(() => void printWhenReady(), 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
        >
          Print / Save PDF
        </button>
      </div>
      <Invoice {...invoiceProps} />
    </main>
  );
}
