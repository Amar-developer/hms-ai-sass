import { displayDate,money } from "@/utils/helper";
import { a, b } from "./contants";

const OPERATIONAL_INVOICE_LINKS = [
  "lab_order_id",
  "pharmacy_issue_id",
  "physiotherapy_case_id",
  "home_care_booking_id",
  "ip_admission_id",
  "consultation_id",
  "appointment_id",
] as const;

export const invoiceSourceOptions = [
  { key: "lab_scan", label: "Lab & Service" },
  { key: "pharmacy", label: "Pharmacy" },
  { key: "physiotherapy", label: "Physiotherapy" },
  { key: "home_care", label: "Home Care / Visit" },
  { key: "ip_billing", label: "IP Billing" },
  { key: "consultation", label: "Consultation" },
  { key: "membership", label: "Membership" },
  { key: "direct", label: "Direct" },
] as const;

export function isMembershipPlanInvoice(invoice: any) {
  const hasMembershipPurchaseReference = Boolean(
    invoice?.patient_subscription_enrollment_id ||
      invoice?.patient_subscription_plan_id,
  );
  if (!hasMembershipPurchaseReference) return false;
  return !OPERATIONAL_INVOICE_LINKS.some((key) => Boolean(invoice?.[key]));
}

export function invoiceSourceKey(invoice: any) {
  if (invoice.lab_order_id) return "lab_scan";
  if (invoice.pharmacy_issue_id) return "pharmacy";
  if (invoice.physiotherapy_case_id) return "physiotherapy";
  if (invoice.home_care_booking_id) return "home_care";
  if (invoice.ip_admission_id) return "ip_billing";
  if (invoice.consultation_id || invoice.appointment_id) return "consultation";
  if (isMembershipPlanInvoice(invoice)) return "membership";
  return "direct";
}

export function invoiceSource(invoice: any) {
  const sources: Record<
    string,
    { label: string; tone: "slate" | "blue" | "amber" | "purple" |"orange" | "skyblue"|"green" }
  > = {
    lab_scan: { label: "Lab & Service", tone: "blue" },
    pharmacy: { label: "Pharmacy", tone: "amber" },
    physiotherapy: { label: "Physiotherapy", tone: "purple" },
    home_care: { label: "Home Care / Visit", tone: "orange" },
    ip_billing: { label: "IP Billing", tone: "skyblue" },
    consultation: { label: "Consultation", tone: "green" },
    membership: { label: "Membership", tone: "purple" },
    direct: { label: "Direct", tone: "amber" },
  };
  return sources[invoiceSourceKey(invoice)] || sources.direct;
}

export function invoiceLinkedRecord(invoice: any) {
  if (invoice.ip_admission_id) return "IP admission";
  if (invoice.physiotherapy_case_id) return "Physiotherapy case";
  if (invoice.home_care_booking_id) return "Home care / visit booking";
  if (invoice.pharmacy_issue_id) return "Pharmacy issue";
  if (invoice.lab_order_id) return "Lab & Service order";
  if (invoice.consultation_id) return "Consultation";
  if (invoice.appointment_id) return "Appointment";
  if (isMembershipPlanInvoice(invoice)) return "Membership plan purchase";
  return "Direct invoice";
}

export function numberValue(value: any) {
  return Number(value || 0);
}

export function invoiceDiscountParts(invoice: any) {
  const discount = numberValue(invoice.discount_amount);
  const membership = numberValue(invoice.membership_discount_amount);
  const approved = numberValue(invoice.approved_discount_amount);
  const offer = numberValue(invoice.offer_discount_amount);
  return {
    approvedDiscount: approved,
    offerDiscount: offer,
    membershipDiscount: membership,
  };
}

export function invoiceHasAppliedMembershipBenefit(invoice: any) {
  return [
    invoice?.membership_discount_amount,
    invoice?.membership_free_items_amount,
    invoice?.membership_item_discount_amount,
  ].some((value) => numberValue(value) > 0);
}

export function invoiceMembershipLabel(invoice: any) {
  if (invoiceHasAppliedMembershipBenefit(invoice))
    return "Membership benefit applied";
  if (isMembershipPlanInvoice(invoice)) return "Membership plan invoice";
  return "";
}

export function percentLabel(amount: any, base: any) {
  const value = numberValue(amount);
  const total = numberValue(base);
  if (value <= 0 || total <= 0) return "0%";
  const percent = (value * 100) / total;
  return `${Math.round(percent).toLocaleString("en-IN")}%`;
}

export function claimedDetail(amount: any, base: any, verb = "claimed") {
  return `${money(amount)} of ${money(base)} (${percentLabel(amount, base)} ${verb})`;
}

export function invoiceTaxAdjustedDiscount(invoice: any, amount: any) {
  const discount = numberValue(amount);
  if (discount <= 0) return 0;
  const taxable = numberValue(invoice?.taxable_amount);
  const tax = numberValue(invoice?.tax_amount);
  if (taxable <= 0 || tax <= 0) return discount;
  return (
    Math.round(
      (discount + discount * (tax / taxable) + Number.EPSILON) * 100,
    ) / 100
  );
}

export function invoiceDateKey(invoice: any) {
  const raw =
    invoice.invoice_date ||
    invoice.created_at ||
    invoice.updated_at ||
    invoice.paid_at;
  if (!raw) return "";
  if (typeof raw === "string") return raw.slice(0, 10);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function formatInvoiceDate(invoice: any) {
  const key = invoiceDateKey(invoice);
  if (!key) return "-";
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? key : displayDate(key);
}

export function invoicePaidStatus(invoice: any) {
  const paid = Number(invoice.paid_amount || 0);
  const balance = Number(invoice.balance_amount || 0);
  const status = String(invoice.status || "").toLowerCase();
  if (status === "partially_refunded") return "partially_refunded";
  if (status === "refunded" || status === "cancelled") return status;
  if (status === "paid" || balance <= 0) return "paid";
  if (status === "partially_paid" || paid > 0) return "partially_paid";
  return "unpaid";
}

export function itemTypeLabel(type: any) {
  const labels: Record<string, string> = {
    consultation: "Consultation",
    lab: "Lab / Service",
    pharmacy: "Medicine",
    ip_room: "IP Room",
    ip_consultation: "IP Doctor",
    ip_medication: "IP Medicine",
    ip_lab: "IP Lab / Service",
    ip_charge: "IP Charge",
    physiotherapy: "Physiotherapy",
    home_care: "Home Care / Visit",
  };
  return (
    labels[String(type || "")] || String(type || "Service").replaceAll("_", " ")
  );
}

export const toNumber = (v: number | string | undefined): number => {
  if (v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export const formatMoney = (v: number | string | undefined, symbol: string) => {
  const n = toNumber(v);
  const sign = n < 0 ? "-" : "";
  return `${sign}${symbol}${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
};

export const formatPercentage = (
  value: number | string | undefined,
): string => Math.round(toNumber(value)).toLocaleString("en-IN");

export const formatDiscountPercentage = (
  value: number | string | undefined,
): string => formatPercentage(value);

export function numberToWordsIndian(num: number): string {
  if (num === 0) return "Zero";


  const twoDigits = (n: number): string => {
    if (n < 20) return a[n];
    return `${b[Math.floor(n / 10)]} ${a[n % 10]}`.trim();
  };

  const threeDigits = (n: number): string => {
    if (n < 100) return twoDigits(n);
    return `${a[Math.floor(n / 100)]} Hundred ${twoDigits(n % 100)}`.trim();
  };

  let result = "";
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = Math.floor(num);

  if (crore) result += `${threeDigits(crore)} Crore `;
  if (lakh) result += `${threeDigits(lakh)} Lakh `;
  if (thousand) result += `${threeDigits(thousand)} Thousand `;
  if (hundred) result += `${threeDigits(hundred)}`;

  return result.trim();
}

/**
 * Resolve the customer-facing price reduction for one invoice line.
 *
 * InvoiceItem.total_amount is the gross amount charged by the source module
 * before invoice-level benefits.  A catalog MRP can be higher than that amount
 * (the normal selling-price markdown), while item.discount_amount contains the
 * allocated offer, membership, or approved-request discount.  Receipts and the
 * billing detail must show both reductions together without subtracting the MRP
 * markdown from invoice totals a second time.
 */
export function invoiceItemPriceBreakdown(item: any, invoice: any) {
  const quantity = Math.max(numberValue(item?.quantity), 1);
  const lineAmount = numberValue(item?.total_amount);
  const rateUnit =
    numberValue(item?.selling_amount) ||
    numberValue(item?.unit_amount) ||
    (lineAmount > 0 ? lineAmount / quantity : 0);
  const mrpUnit = numberValue(item?.mrp_amount);
  const hasMrp = mrpUnit > 0;
  const mrpTotal = hasMrp ? mrpUnit * quantity : 0;

  let allocatedInvoiceDiscount: number;
  if (item?.discount_amount !== undefined && item?.discount_amount !== null) {
    allocatedInvoiceDiscount = numberValue(item.discount_amount);
  } else {
    const subtotal = numberValue(invoice?.subtotal_amount);
    allocatedInvoiceDiscount =
      subtotal > 0
        ? Math.round(
            ((lineAmount * numberValue(invoice?.discount_amount)) / subtotal +
              Number.EPSILON) *
              100,
          ) / 100
        : 0;
  }
  allocatedInvoiceDiscount = Math.min(
    Math.max(allocatedInvoiceDiscount, 0),
    lineAmount,
  );

  const mrpMarkdown = hasMrp ? Math.max(mrpTotal - lineAmount, 0) : 0;
  const effectiveDiscount = mrpMarkdown + allocatedInvoiceDiscount;
  const discountBase = mrpTotal > 0 ? mrpTotal : lineAmount;

  return {
    hasMrp,
    mrpUnit,
    mrpTotal,
    rateUnit,
    lineAmount,
    allocatedInvoiceDiscount,
    mrpMarkdown,
    effectiveDiscount,
    discountPercent:
      discountBase > 0
        ? Number(((effectiveDiscount * 100) / discountBase).toFixed(2))
        : 0,
    payableAmount: Math.max(lineAmount - allocatedInvoiceDiscount, 0),
  };
}
