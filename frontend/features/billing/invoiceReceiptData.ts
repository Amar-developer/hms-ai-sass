import { apiFetch, type ApiSession, uploadAssetUrl } from "@/lib/api";
import type { QueryClient } from "@tanstack/react-query";
import { resolveInvoiceLogoAsset } from "@/lib/imageAssets";
import { invoiceItemPriceBreakdown } from "./helpers";
import { patientDisplayMobile } from "@/features/patients/helpers";
import type { InvoiceProps } from "./types";
import {
  fetchResolvedSetting,
  getResolvedSetting,
} from "@/features/settings/api/resolvedSettingQueries";

export function safeFilename(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function invoiceReceiptFilename(props: InvoiceProps) {
  return (
    [safeFilename(props.customer.name), safeFilename(props.invoiceNo)]
      .filter(Boolean)
      .join("-") || "invoice"
  );
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

export function invoiceReceiptLineItem(item: any, invoice: any, index: number) {
  const pricing = invoiceItemPriceBreakdown(item, invoice);
  return {
    srNo: index + 1,
    name: item.description || item.item_type || "Item",
    qty: item.quantity || 1,
    mrp: pricing.mrpUnit,
    discPercent: pricing.discountPercent,
    rate: pricing.payableAmount,
  };
}

export function toInvoiceProps(
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
      // Show a reachable number even when the patient has no primary on
      // file, and don't print the same number twice.
      phone: patientDisplayMobile(patient),
      whatsapp:
        patient?.alternate_mobile &&
        patient.alternate_mobile !== patientDisplayMobile(patient)
          ? patient.alternate_mobile
          : "",
      address: patient?.address || "",
      patientId: patient?.patient_number || "",
    },
    items: (detail.items || []).map((item: any, index: number) =>
      invoiceReceiptLineItem(item, invoice, index),
    ),
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
    taxPercentage: Number(invoice.tax_percentage || 0),
    total: Number(invoice.total_amount || 0),
    paidAmount: Number(invoice.paid_amount || 0),
    balanceAmount: Number(invoice.balance_amount || 0),
  };
}

export async function loadInvoiceReceiptProps(
  invoiceId: string,
  session: ApiSession,
  queryClient?: QueryClient,
): Promise<{ props: InvoiceProps; release: () => void }> {
  const detail = await apiFetch(
    `/billing/invoices/${encodeURIComponent(invoiceId)}`,
    session,
  );
  const patientId = detail.invoice?.patient_id;
  const [patient, branding, logoSetting, bankSetting, logoFiles] =
    await Promise.all([
      patientId
        ? apiFetch(`/patients/${encodeURIComponent(patientId)}`, session).catch(
            () => null,
          )
        : Promise.resolve(null),
      apiFetch("/tenants/current/branding", session).catch(() => null),
      (queryClient
        ? getResolvedSetting(
            queryClient,
            session,
            "invoice",
            "invoice.logo_url",
          )
        : fetchResolvedSetting(session, "invoice", "invoice.logo_url")
      ).catch(() => null),
      (queryClient
        ? getResolvedSetting(
            queryClient,
            session,
            "accounts",
            "accounts.bank_details",
          )
        : fetchResolvedSetting(
            session,
            "accounts",
            "accounts.bank_details",
          )
      ).catch(() => null),
      apiFetch("/files?category=logo&attached_to_doctype=Tenant&limit=20", session).catch(
        () => [],
      ),
    ]);

  const resolvedLogo = await resolveInvoiceLogoAsset(
    logoSetting?.value || branding?.logo_url || "",
    logoFiles || [],
    session,
  );

  const props = toInvoiceProps(
    detail,
    patient,
    branding,
    resolvedLogo.url,
    bankSetting?.value,
  );

  return { props, release: resolvedLogo.release };
}
