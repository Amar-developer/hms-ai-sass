import { displayDate,money } from "@/utils/helper";
import { a, b } from "./contants";

export function invoiceSourceKey(invoice: any) {
  if (invoice.patient_subscription_plan_id) return "membership";
  if (invoice.lab_order_id) return "lab_scan";
  if (invoice.pharmacy_issue_id) return "pharmacy";
  if (invoice.physiotherapy_case_id) return "physiotherapy";
  if (invoice.home_care_booking_id) return "home_care";
  if (invoice.ip_admission_id) return "ip_billing";
  if (invoice.consultation_id || invoice.appointment_id) return "consultation";
  return "direct";
}

export function invoiceSource(invoice: any) {
  const sources: Record<
    string,
    { label: string; tone: "slate" | "blue" | "amber" | "purple" }
  > = {
    lab_scan: { label: "Lab & Service", tone: "blue" },
    pharmacy: { label: "Pharmacy", tone: "amber" },
    physiotherapy: { label: "Physiotherapy", tone: "purple" },
    home_care: { label: "Home Care / Visit", tone: "blue" },
    ip_billing: { label: "IP Billing", tone: "blue" },
    consultation: { label: "Consultation", tone: "slate" },
    membership: { label: "Membership", tone: "purple" },
    direct: { label: "Direct", tone: "amber" },
  };
  return sources[invoiceSourceKey(invoice)] || sources.direct;
}

export function invoiceLinkedRecord(invoice: any) {
  if (invoice.patient_subscription_plan_id) return "Membership plan purchase";
  if (invoice.ip_admission_id) return "IP admission";
  if (invoice.physiotherapy_case_id) return "Physiotherapy case";
  if (invoice.home_care_booking_id) return "Home care / visit booking";
  if (invoice.pharmacy_issue_id) return "Pharmacy issue";
  if (invoice.lab_order_id) return "Lab & Service order";
  if (invoice.consultation_id) return "Consultation";
  if (invoice.appointment_id) return "Appointment";
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
  if (numberValue(invoice.membership_discount_amount) > 0)
    return "Membership benefit applied";
  if (
    invoice.patient_subscription_enrollment_id ||
    invoice.patient_subscription_plan_id
  )
    return "Membership plan invoice";
  return "";
}

export function percentLabel(amount: any, base: any) {
  const value = numberValue(amount);
  const total = numberValue(base);
  if (value <= 0 || total <= 0) return "0%";
  const percent = (value * 100) / total;
  return `${Number(percent.toFixed(1)).toLocaleString("en-IN")}%`;
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
  return discount + Math.round(discount * (tax / taxable));
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
  return `${symbol}${n.toFixed(2)}`;
};

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
