import { displayDate } from "@/utils/helper";
import { isMembershipPlanInvoice } from "@/features/billing/helpers";
import {
  approvedDiscountUsage,
  billingDiscountUsage,
  membershipBenefitUsage,
  offerDiscountUsage,
  recognizedInvoiceRevenue,
  recognizedInvoiceTax,
  reportedInvoiceTotal,
} from "./financials";

export function numberValue(value: any) {
  return Number(value || 0);
}

export function dateKey(value: any) {
  return String(value || "").slice(0, 10);
}

export function normalized(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

export function isCompleted(row: any) {
  return [
    row.status,
    row.queueStatus,
    row.queue_status,
    row.consultationStatus,
    row.consultation_status,
  ]
    .map(normalized)
    .some((status) =>
      [
        "consultation_completed",
        "consultation_done",
        "completed",
        "done",
        "seen",
        "signed",
        "billed",
      ].includes(status),
    );
}

export function currentRange(period: string) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (period === "daily") {
    return [toInputDate(start), toInputDate(end)];
  }
  if (period === "weekly") {
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    end.setDate(start.getDate() + 6);
    return [toInputDate(start), toInputDate(end)];
  }
  if (period === "quarterly") {
    const quarterStartMonth = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(quarterStartMonth, 1);
    end.setMonth(quarterStartMonth + 3, 0);
    return [toInputDate(start), toInputDate(end)];
  }
  if (period === "half_yearly") {
    const halfStartMonth = start.getMonth() < 6 ? 0 : 6;
    start.setMonth(halfStartMonth, 1);
    end.setMonth(halfStartMonth + 6, 0);
    return [toInputDate(start), toInputDate(end)];
  }
  if (period === "yearly") {
    start.setMonth(0, 1);
    end.setMonth(12, 0);
    return [toInputDate(start), toInputDate(end)];
  }
  start.setDate(1);
  end.setMonth(end.getMonth() + 1, 0);
  return [toInputDate(start), toInputDate(end)];
}

export function toInputDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function percent(value: number, total: number, fallbackTotal = 0) {
  const basis = total || fallbackTotal;
  if (!basis) return "0%";
  return `${Math.round((value / basis) * 100)}%`;
}

export function settlementPaidBasis(invoice: any) {
  const total = numberValue(invoice.total_amount);
  const paid = numberValue(invoice.paid_amount);
  const doctorShare = numberValue(invoice.doctor_share_amount);
  if (!doctorShare) return 0;
  if (total <= 0 && membershipBenefitUsage(invoice) > 0) return doctorShare;
  if (!total || !paid) return 0;
  return Math.min(Math.round((doctorShare * paid) / total), paid);
}

export function rowDateKey(invoice: any) {
  return dateKey(
    invoice.invoice_date ||
      invoice.created_at ||
      invoice.updated_at ||
      invoice.paid_at,
  );
}

export function rowDate(invoice: any) {
  return displayDate(rowDateKey(invoice));
}

export function isPaidInvoice(invoice: any) {
  const status = normalized(invoice.status);
  const paid = numberValue(invoice.paid_amount);
  const balance = numberValue(invoice.balance_amount);
  return status === "paid" || (paid > 0 && balance <= 0);
}

export function invoiceType(invoice: any) {
  if (invoice.pharmacy_issue_id) return "pharmacy";
  if (invoice.lab_order_id) return "lab";
  if (invoice.physiotherapy_case_id) return "physiotherapy";
  if (invoice.home_care_booking_id) return "home_care";
  if (invoice.ip_admission_id) return "ip";
  if (isMembershipPlanInvoice(invoice)) return "membership";
  return "consultation";
}

export function invoiceTypeLabel(type: string) {
  if (type === "pharmacy") return "Pharmacy";
  if (type === "lab") return "Lab & Service";
  if (type === "physiotherapy") return "Physiotherapy";
  if (type === "home_care") return "Home Care / Visit";
  if (type === "ip") return "IP Billing";
  if (type === "membership") return "Membership";
  return "Consultation";
}

export function csvCell(value: any) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadBlob(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function tableToCsv(headers: string[], rows: any[][]) {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

export function htmlEscape(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function htmlTable(headers: string[], rows: any[][]) {
  const headerStyle =
    "background-color:#2f6b52;color:#ffffff;font-family:Roboto,Arial,sans-serif;font-size:13px;font-weight:bold;border:1px solid #b7c5bd;padding:9px 10px;text-align:left;white-space:nowrap;";
  const textStyle =
    "font-family:Roboto,Arial,sans-serif;font-size:13px;color:#1f2937;border:1px solid #d9e2dd;padding:8px 10px;text-align:left;";
  const numberStyle =
    "font-family:Roboto,Arial,sans-serif;font-size:13px;color:#1f2937;border:1px solid #d9e2dd;padding:8px 10px;text-align:right;";
  const emptyStyle =
    "font-family:Roboto,Arial,sans-serif;font-size:13px;color:#64748b;border:1px solid #d9e2dd;padding:12px 10px;text-align:left;";
  return `
    <table style="border-collapse:collapse;width:100%;margin-bottom:22px;">
      <thead>
        <tr>${headers.map((header) => `<th style="${headerStyle}">${htmlEscape(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map((row, index) => {
                  const isTotal = row[0] === "Total";
                  const background = isTotal ? "#e6f2ec" : index % 2 ? "#f8faf9" : "#ffffff";
                  return (
                    `<tr>${row
                      .map((cell) => {
                        const style = `${typeof cell === "number" ? numberStyle : textStyle}${isTotal ? "font-weight:bold;" : ""}`;
                        return `<td style="${style}background-color:${background};">${htmlEscape(cell)}</td>`;
                      })
                      .join("")}</tr>`
                  );
                })
                .join("")
            : `<tr><td colspan="${headers.length}" style="${emptyStyle}">No rows</td></tr>`
        }
      </tbody>
    </table>
  `;
}

export function titledHtmlTable(title: string, headers: string[], rows: any[][]) {
  const titleStyle =
    "font-family:Roboto,Arial,sans-serif;font-size:16px;font-weight:bold;color:#0f172a;background-color:#eef6f1;border:1px solid #b7c5bd;padding:10px 12px;text-align:left;";
  return `
    <table style="border-collapse:collapse;width:100%;margin-bottom:22px;">
      <thead>
        <tr><th colspan="${headers.length}" style="${titleStyle}">${htmlEscape(title)}</th></tr>
      </thead>
    </table>
    ${htmlTable(headers, rows)}
  `;
}

export function parseEmailList(value: string) {
  return value
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function aggregateInvoiceMetrics(
  list: any[],
  homeVisitBookingIds: Set<string> = new Set(),
  homeVisitInvoiceIds: Set<string> = new Set(),
  nonConsultationSettlement: (invoice: any) => number = settlementPaidBasis,
) {
  return list.reduce(
    (acc: any, invoice: any) => {
      const total = reportedInvoiceTotal(invoice);
      const paid = recognizedInvoiceRevenue(invoice);
      const balance = numberValue(invoice.balance_amount);
      const doctorShare = numberValue(invoice.doctor_share_amount);
      const type = invoiceType(invoice);
      const doctorFee =
        type === "consultation" ? settlementPaidBasis(invoice) : 0;
      const settlement =
        type === "consultation" ? 0 : nonConsultationSettlement(invoice);
      acc.invoices += 1;
      acc.grossRevenue += total;
      acc.paidRevenue += paid;
      acc.paidTax += recognizedInvoiceTax(invoice);
      acc.balance += balance;
      acc.doctorFee += doctorFee;
      acc.settlement += settlement;
      acc.clinicFee +=
        numberValue(invoice.clinic_share_amount) ||
        Math.max(total - membershipBenefitUsage(invoice) - doctorShare, 0);
      acc.tax += numberValue(invoice.tax_amount);
      acc.membershipDiscount += membershipBenefitUsage(invoice);
      acc.approvedDiscount += approvedDiscountUsage(invoice);
      acc.offerDiscount += offerDiscountUsage(invoice);
      acc.billingDiscount += billingDiscountUsage(invoice);
      const isPlanPurchase = isMembershipPlanInvoice(invoice);
      if (isPlanPurchase) {
        acc.membershipPurchases += 1;
        acc.membershipEnrollCount += 1;
        acc.membershipEnrollAmount += paid;
      }
      if (type === "lab") acc.labRevenue += paid;
      if (type === "pharmacy") acc.pharmacyRevenue += paid;
      if (type === "consultation") acc.consultationRevenue += paid;
      if (type === "home_care") {
        if (
          homeVisitInvoiceIds.has(invoice.id) ||
          homeVisitBookingIds.has(invoice.home_care_booking_id)
        )
          acc.homeVisitRevenue += paid;
        else acc.homeCareRevenue += paid;
      }
      const membershipClaim = membershipBenefitUsage(invoice);
      if (membershipClaim > 0) {
        const claimRow = acc.membershipClaims[type] || {
          type,
          label: invoiceTypeLabel(type),
          invoices: 0,
          claimedAmount: 0,
        };
        claimRow.invoices += 1;
        claimRow.claimedAmount += membershipClaim;
        acc.membershipClaims[type] = claimRow;
      }
      return acc;
    },
    {
      invoices: 0,
      grossRevenue: 0,
      paidRevenue: 0,
      paidTax: 0,
      balance: 0,
      doctorFee: 0,
      settlement: 0,
      clinicFee: 0,
      tax: 0,
      membershipDiscount: 0,
      approvedDiscount: 0,
      offerDiscount: 0,
      billingDiscount: 0,
      membershipPurchases: 0,
      membershipEnrollCount: 0,
      membershipEnrollAmount: 0,
      consultationRevenue: 0,
      labRevenue: 0,
      pharmacyRevenue: 0,
      homeCareRevenue: 0,
      homeVisitRevenue: 0,
      membershipClaims: {},
    },
  );
}
