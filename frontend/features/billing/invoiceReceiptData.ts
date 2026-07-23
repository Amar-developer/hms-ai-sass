import { apiFetch, type ApiSession, uploadAssetUrl } from "@/lib/api";
import { resolveInvoiceLogoAsset } from "@/lib/imageAssets";
import type { InvoiceProps } from "./types";

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

function invoiceItemPriceBreakdown(item: any, invoice: any) {
  const toNumber = (value: unknown, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const quantity = Math.max(1, toNumber(item.quantity ?? item.qty ?? 1));
  const mrpUnit = toNumber(
    item.mrp_unit ?? item.mrp ?? item.price ?? item.unit_price ?? item.selling_price ?? item.rate ?? 0,
  );
  const totalAmount = toNumber(item.amount ?? item.total ?? 0);

  let payableAmount = toNumber(item.rate ?? item.unit_rate ?? item.selling_price ?? item.price);
  if (!payableAmount && totalAmount && quantity) {
    payableAmount = totalAmount / quantity;
  }
  if (!payableAmount) {
    payableAmount = mrpUnit;
  }

  const rawDiscountPercent = toNumber(
    item.discount_percent ?? item.discount_percentage ?? item.disc_percent ?? item.discount ?? 0,
  );
  const discountPercent =
    rawDiscountPercent ||
    (mrpUnit > 0
      ? Math.round(((mrpUnit - payableAmount) / mrpUnit) * 10000) / 100
      : 0);

  return {
    mrpUnit,
    discountPercent,
    payableAmount,
  };
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
      patientId: patient?.patient_number || "",
    },
    items: (detail.items || []).map((item: any, index: number) => {
      const pricing = invoiceItemPriceBreakdown(item, invoice);
      return {
        srNo: index + 1,
        name: item.description || item.item_type || "Item",
        qty: item.quantity || 1,
        mrp: pricing.mrpUnit,
        discPercent: pricing.discountPercent,
        rate: pricing.payableAmount,
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
    taxPercentage: Number(invoice.tax_percentage || 0),
    total: Number(invoice.total_amount || 0),
  };
}

export async function loadInvoiceReceiptProps(
  invoiceId: string,
  session: ApiSession,
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
      apiFetch("/settings/resolve?module=invoice&key=invoice.logo_url", session).catch(
        () => null,
      ),
      apiFetch(
        "/settings/resolve?module=accounts&key=accounts.bank_details",
        session,
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
