"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  Download,
  IndianRupee,
  Mail,
  Percent,
  ReceiptIndianRupee,
  Stethoscope,
} from "lucide-react";
import { Badge, Card, Field, Input, Select } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";

const pageSize = 10;

function money(value: any) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function numberValue(value: any) {
  return Number(value || 0);
}

function dateKey(value: any) {
  return String(value || "").slice(0, 10);
}

function normalized(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

function isCompleted(row: any) {
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

function currentRange(period: string) {
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
  start.setDate(1);
  end.setMonth(end.getMonth() + 1, 0);
  return [toInputDate(start), toInputDate(end)];
}

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function percent(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function settlementPaidBasis(invoice: any) {
  const total = numberValue(invoice.total_amount);
  const paid = numberValue(invoice.paid_amount);
  const doctorShare = numberValue(invoice.doctor_share_amount);
  if (!total || !paid || !doctorShare) return 0;
  return Math.min(Math.round((doctorShare * paid) / total), paid);
}

function invoiceItemTotal(invoice: any) {
  return numberValue(invoice.subtotal_amount || invoice.total_amount);
}

function invoiceMembershipBenefit(invoice: any) {
  return numberValue(invoice.membership_discount_amount);
}

function invoiceOfferDiscount(invoice: any) {
  return Math.max(numberValue(invoice.discount_amount) - invoiceMembershipBenefit(invoice), 0);
}

function allocatedLineRevenue(invoice: any, lineAmount: number) {
  const itemTotal = invoiceItemTotal(invoice);
  const revenue = numberValue(invoice.paid_amount || invoice.total_amount);
  if (!itemTotal || !lineAmount || !revenue) return 0;
  return Math.round((lineAmount * revenue) / itemTotal);
}

function allocatedLineOfferDiscount(invoice: any, lineAmount: number) {
  const itemTotal = invoiceItemTotal(invoice);
  const offerDiscount = invoiceOfferDiscount(invoice);
  if (!itemTotal || !lineAmount || !offerDiscount) return 0;
  return Math.round((lineAmount * offerDiscount) / itemTotal);
}

function allocatedLineMembershipBenefit(invoice: any, lineAmount: number) {
  const itemTotal = invoiceItemTotal(invoice);
  const membershipBenefit = invoiceMembershipBenefit(invoice);
  if (!itemTotal || !lineAmount || !membershipBenefit) return 0;
  return Math.round((lineAmount * membershipBenefit) / itemTotal);
}

function rowDate(invoice: any) {
  return dateKey(invoice.created_at || invoice.invoice_date || invoice.updated_at);
}

function isPaidInvoice(invoice: any) {
  const status = normalized(invoice.status);
  const paid = numberValue(invoice.paid_amount);
  const balance = numberValue(invoice.balance_amount);
  const total = numberValue(invoice.total_amount);
  const settledZeroInvoice = total === 0 && balance <= 0 && numberValue(invoice.discount_amount) > 0;
  return status === "paid" || (paid > 0 && balance <= 0) || settledZeroInvoice;
}

function invoiceType(invoice: any) {
  if (invoice.pharmacy_issue_id) return "pharmacy";
  if (invoice.lab_order_id) return "lab";
  return "consultation";
}

function invoiceTypeLabel(type: string) {
  if (type === "pharmacy") return "Pharmacy";
  if (type === "lab") return "Lab";
  return "Consultation";
}

function csvCell(value: any) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadBlob(filename: string, mimeType: string, content: string) {
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

function tableToCsv(headers: string[], rows: any[][]) {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

function htmlEscape(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function htmlTable(headers: string[], rows: any[][]) {
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

function titledHtmlTable(title: string, headers: string[], rows: any[][]) {
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

function parseEmailList(value: string) {
  return value
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function Reports({
  scopedAppointments,
  patients,
  ipAdmissions,
  apiSession,
  branchId,
  liveInvoices = [],
  livePractitioners = [],
}: any) {
  const [period, setPeriod] = useState("monthly");
  const [rangeStart, rangeEnd] = currentRange(period);
  const [fromDate, setFromDate] = useState(rangeStart);
  const [toDate, setToDate] = useState(rangeEnd);
  const [doctorId, setDoctorId] = useState("all");
  const [typeFilter, setTypeFilter] = useState("overall");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [openSections, setOpenSections] = useState<any>({doctor: true, lab: true, pharmacy: true});
  const [invoicePage, setInvoicePage] = useState(1);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMessage, setSendMessage] = useState("");
  const [sendError, setSendError] = useState("");
  const [sendPanelOpen, setSendPanelOpen] = useState(false);
  const [recipientInput, setRecipientInput] = useState("");
  const [recentEmails, setRecentEmails] = useState<string[]>([]);
  const [labTests, setLabTests] = useState<any[]>([]);
  const [labPackages, setLabPackages] = useState<any[]>([]);
  const [labOrderDetails, setLabOrderDetails] = useState<any[]>([]);
  const [medicineRows, setMedicineRows] = useState<any[]>([]);
  const [pharmacyIssueDetails, setPharmacyIssueDetails] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const patientById = useMemo(
    () => new Map<string, any>(patients.map((row: any) => [row.id, row])),
    [patients],
  );
  const appointmentById = useMemo(
    () => new Map<string, any>(scopedAppointments.map((row: any) => [row.id, row])),
    [scopedAppointments],
  );
  const doctorById = useMemo(
    () =>
      new Map(
        livePractitioners.map((row: any) => [
          row.id,
          row.full_name || row.name || row.id,
        ]),
      ),
    [livePractitioners],
  );
  const branchDoctorOptions = livePractitioners
    .filter((row: any) => {
      const type = normalized(row.practitioner_type || row.type || "doctor");
      const status = normalized(row.status || "active");
      const branchIds = row.branch_ids || [];
      return type === "doctor" && status !== "inactive" && (!branchId || branchIds.length === 0 || branchIds.includes(branchId));
    })
    .map((row: any) => [row.id, row.full_name || row.name || row.id]);
  const appointmentDoctorOptions = scopedAppointments
    .map((row: any) => [
      row.doctorId || row.practitioner_id,
      row.doctor || row.practitioner_name || doctorById.get(row.doctorId || row.practitioner_id),
    ])
    .filter(([id]) => Boolean(id));
  const doctorOptions = Array.from(new Map([...branchDoctorOptions, ...appointmentDoctorOptions]).entries()).sort((a: any, b: any) =>
    String(a[1]).localeCompare(String(b[1])),
  );
  const filteredInvoices = liveInvoices.filter((invoice: any) => {
    const invoiceDate = rowDate(invoice);
    const appointment = appointmentById.get(invoice.appointment_id);
    const invoiceDoctorId =
      appointment?.doctorId || appointment?.practitioner_id || invoice.practitioner_id;
    const invoiceBranchId = invoice.branch_id || appointment?.branchId || appointment?.branch_id;
    const type = invoiceType(invoice);
    return (
      isPaidInvoice(invoice) &&
      (!branchId || invoiceBranchId === branchId) &&
      (!fromDate || invoiceDate >= fromDate) &&
      (!toDate || invoiceDate <= toDate) &&
      (doctorId === "all" || invoiceDoctorId === doctorId) &&
      (typeFilter === "overall" || type === typeFilter)
    );
  });
  const totalInvoicePages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safeInvoicePage = Math.min(invoicePage, totalInvoicePages);
  const invoicePageRows = filteredInvoices.slice(
    (safeInvoicePage - 1) * pageSize,
    safeInvoicePage * pageSize,
  );

  useEffect(() => {
    setInvoicePage(1);
  }, [fromDate, toDate, doctorId, typeFilter, branchId]);

  useEffect(() => {
    if (doctorId !== "all" && !doctorOptions.some(([id]: any) => id === doctorId)) {
      setDoctorId("all");
    }
  }, [branchId, doctorId, doctorOptions.length]);

  useEffect(() => {
    if (invoicePage !== safeInvoicePage) setInvoicePage(safeInvoicePage);
  }, [invoicePage, safeInvoicePage]);

  useEffect(() => {
    if (!apiSession?.tenantId || typeof window === "undefined") return;
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(`medizinhub.reportEmails.${apiSession.tenantId}`) || "[]",
      );
      if (Array.isArray(saved)) setRecentEmails(saved.filter((item) => typeof item === "string").slice(0, 6));
    } catch {}
  }, [apiSession?.tenantId]);

  useEffect(() => {
    if (!apiSession?.token) return;
    let cancelled = false;
    async function loadLabSettlementData() {
      const [testRows, packageRows, supplierRows, orderRows] = await Promise.all([
        apiFetch("/lab/catalog/tests", apiSession).catch(() => []),
        apiFetch("/lab/catalog/packages", apiSession).catch(() => []),
        apiFetch("/pharmacy/suppliers", apiSession).catch(() => []),
        apiFetch("/lab/orders", apiSession).catch(() => []),
      ]);
      if (cancelled) return;
      setLabTests(testRows || []);
      setLabPackages(packageRows || []);
      setSuppliers(supplierRows || []);
      const relevantOrderIds = Array.from(
        new Set(
          liveInvoices
            .filter((invoice: any) => invoice.lab_order_id)
            .map((invoice: any) => invoice.lab_order_id),
        ),
      );
      const sourceOrderIds = relevantOrderIds.length
        ? relevantOrderIds
        : (orderRows || []).slice(0, 200).map((order: any) => order.id);
      const details = await Promise.all(
        sourceOrderIds.map((orderId: any) => apiFetch(`/lab/orders/${orderId}`, apiSession).catch(() => null)),
      );
      if (!cancelled) setLabOrderDetails(details.filter(Boolean));
    }
    loadLabSettlementData();
    return () => {
      cancelled = true;
    };
  }, [apiSession?.token, apiSession?.tenantId, liveInvoices.length]);

  useEffect(() => {
    if (!apiSession?.token) return;
    let cancelled = false;
    async function loadPharmacySettlementData() {
      const [medicines, issueRows] = await Promise.all([
        apiFetch("/pharmacy/medicines", apiSession).catch(() => []),
        apiFetch("/pharmacy/issues", apiSession).catch(() => []),
      ]);
      if (cancelled) return;
      setMedicineRows(medicines || []);
      const relevantIssueIds = Array.from(
        new Set(
          liveInvoices
            .filter((invoice: any) => invoice.pharmacy_issue_id)
            .map((invoice: any) => invoice.pharmacy_issue_id),
        ),
      );
      const sourceIssueIds = relevantIssueIds.length
        ? relevantIssueIds
        : (issueRows || []).slice(0, 200).map((issue: any) => issue.id);
      const details = await Promise.all(
        sourceIssueIds.map((issueId: any) => apiFetch(`/pharmacy/issues/${issueId}`, apiSession).catch(() => null)),
      );
      if (!cancelled) setPharmacyIssueDetails(details.filter(Boolean));
    }
    loadPharmacySettlementData();
    return () => {
      cancelled = true;
    };
  }, [apiSession?.token, apiSession?.tenantId, liveInvoices.length]);
  const completedAppointments = scopedAppointments.filter((row: any) => {
    const appointmentDate = dateKey(row.appointmentDate || row.appointment_date);
    const rowDoctorId = row.doctorId || row.practitioner_id;
    return (
      isCompleted(row) &&
      (!fromDate || appointmentDate >= fromDate) &&
      (!toDate || appointmentDate <= toDate) &&
      (doctorId === "all" || rowDoctorId === doctorId)
    );
  });
  const totals = filteredInvoices.reduce(
    (acc: any, invoice: any) => {
      const total = numberValue(invoice.total_amount);
      const paid = numberValue(invoice.paid_amount);
      const balance = numberValue(invoice.balance_amount);
      const doctorShare = numberValue(invoice.doctor_share_amount);
      const settlement = settlementPaidBasis(invoice);
      const itemTotal = invoiceItemTotal(invoice);
      const offerDiscount = invoiceOfferDiscount(invoice);
      const membershipBenefit = invoiceMembershipBenefit(invoice);
      acc.invoices += 1;
      acc.itemTotal += itemTotal;
      acc.grossRevenue += total;
      acc.paidRevenue += paid;
      acc.balance += balance;
      acc.doctorFee += doctorShare;
      acc.settlement += settlement;
      acc.clinicFee += numberValue(invoice.clinic_share_amount) || Math.max(total - doctorShare, 0);
      acc.tax += numberValue(invoice.tax_amount);
      acc.offerDiscount += offerDiscount;
      acc.membershipDiscount += membershipBenefit;
      acc.totalSavings += offerDiscount + membershipBenefit;
      if (invoice.patient_subscription_enrollment_id || invoice.patient_subscription_plan_id) acc.membershipPurchases += 1;
      const type = invoiceType(invoice);
      if (type === "lab") acc.labRevenue += paid;
      if (type === "pharmacy") acc.pharmacyRevenue += paid;
      if (type === "consultation") acc.consultationRevenue += paid;
      return acc;
    },
    {
      invoices: 0,
      itemTotal: 0,
      grossRevenue: 0,
      paidRevenue: 0,
      balance: 0,
      doctorFee: 0,
      settlement: 0,
      clinicFee: 0,
      tax: 0,
      offerDiscount: 0,
      membershipDiscount: 0,
      totalSavings: 0,
      membershipPurchases: 0,
      consultationRevenue: 0,
      labRevenue: 0,
      pharmacyRevenue: 0,
    },
  );
  const grossProfit = Math.max(totals.grossRevenue - totals.doctorFee, 0);
  const finalProfit = Math.max(totals.paidRevenue - totals.settlement, 0);
  const doctorRows = Array.from(
    filteredInvoices.reduce((acc: Map<string, any>, invoice: any) => {
      const appointment: any = appointmentById.get(invoice.appointment_id);
      const key =
        appointment?.doctorId || appointment?.practitioner_id || invoice.practitioner_id || "unassigned";
      const row =
        acc.get(key) ||
        {
          id: key,
          doctor: appointment?.doctor || doctorById.get(key) || "Unassigned",
          invoices: 0,
          consultations: 0,
          grossRevenue: 0,
          paidRevenue: 0,
          offerDiscount: 0,
          membershipDiscount: 0,
          doctorFee: 0,
          settlement: 0,
          clinicFee: 0,
          finalProfit: 0,
        };
      const total = numberValue(invoice.total_amount);
      const paid = numberValue(invoice.paid_amount);
      const doctorFee = numberValue(invoice.doctor_share_amount);
      const settlement = settlementPaidBasis(invoice);
      row.invoices += 1;
      row.grossRevenue += total;
      row.paidRevenue += paid;
      row.offerDiscount += invoiceOfferDiscount(invoice);
      row.membershipDiscount += invoiceMembershipBenefit(invoice);
      row.doctorFee += doctorFee;
      row.settlement += settlement;
      row.clinicFee += numberValue(invoice.clinic_share_amount) || Math.max(total - doctorFee, 0);
      row.finalProfit += Math.max(paid - settlement, 0);
      acc.set(key, row);
      return acc;
    }, new Map<string, any>()).values(),
  ).map((row: any) => ({
    ...row,
    consultations: completedAppointments.filter(
      (appointment: any) => (appointment.doctorId || appointment.practitioner_id || "unassigned") === row.id,
    ).length,
  })).sort((a: any, b: any) => b.finalProfit - a.finalProfit);

  function changePeriod(nextPeriod: string) {
    const [start, end] = currentRange(nextPeriod);
    setPeriod(nextPeriod);
    if (nextPeriod !== "custom") {
      setFromDate(start);
      setToDate(end);
    }
  }

  const settlementHeaders = [
    "Doctor",
    "Consultations",
    "Invoices",
    "Gross Revenue",
    "Paid Revenue",
    "Offer Discount",
    "Membership Benefit",
    "Doctor Fee",
    "Settlement",
    "Clinic Fee",
    "Gross Profit %",
    "Final Profit",
  ];
  const settlementRows = doctorRows.map((row: any) => [
    row.doctor,
    row.consultations,
    row.invoices,
    row.grossRevenue,
    row.paidRevenue,
    row.offerDiscount,
    row.membershipDiscount,
    row.doctorFee,
    row.settlement,
    row.clinicFee,
    percent(Math.max(row.grossRevenue - row.doctorFee, 0), row.grossRevenue),
    row.finalProfit,
  ]);
  const settlementExportRows = settlementRows.length
    ? [
        ...settlementRows,
        [
          "Total",
          doctorRows.reduce((sum: number, row: any) => sum + numberValue(row.consultations), 0),
          doctorRows.reduce((sum: number, row: any) => sum + numberValue(row.invoices), 0),
          doctorRows.reduce((sum: number, row: any) => sum + numberValue(row.grossRevenue), 0),
          doctorRows.reduce((sum: number, row: any) => sum + numberValue(row.paidRevenue), 0),
          doctorRows.reduce((sum: number, row: any) => sum + numberValue(row.offerDiscount), 0),
          doctorRows.reduce((sum: number, row: any) => sum + numberValue(row.membershipDiscount), 0),
          doctorRows.reduce((sum: number, row: any) => sum + numberValue(row.doctorFee), 0),
          doctorRows.reduce((sum: number, row: any) => sum + numberValue(row.settlement), 0),
          doctorRows.reduce((sum: number, row: any) => sum + numberValue(row.clinicFee), 0),
          percent(grossProfit, totals.grossRevenue),
          doctorRows.reduce((sum: number, row: any) => sum + numberValue(row.finalProfit), 0),
        ],
      ]
    : settlementRows;

  const labTestById = useMemo(() => new Map(labTests.map((row: any) => [row.id, row])), [labTests]);
  const labPackageById = useMemo(() => new Map(labPackages.map((row: any) => [row.id, row])), [labPackages]);
  const medicineById = useMemo(() => new Map(medicineRows.map((row: any) => [row.id, row])), [medicineRows]);
  const supplierById = useMemo(() => new Map(suppliers.map((row: any) => [row.id, row.name])), [suppliers]);
  const labOrderDetailById = useMemo(
    () => new Map(labOrderDetails.map((detail: any) => [detail.order?.id, detail])),
    [labOrderDetails],
  );
  const labSettlementRows = Array.from(
    filteredInvoices
      .filter((invoice: any) => invoiceType(invoice) === "lab" && invoice.lab_order_id)
      .reduce((acc: Map<string, any>, invoice: any) => {
        const detail: any = labOrderDetailById.get(invoice.lab_order_id);
        const items = detail?.items?.length ? detail.items : [{test_name: "Unmapped Lab Invoice", price: invoiceItemTotal(invoice)}];
        for (const item of items) {
          const catalogItem = item.package_id ? labPackageById.get(item.package_id) : labTestById.get(item.test_id);
          const supplierId = catalogItem?.supplier_id || "none";
          const key = `${supplierId}:${item.test_name || item.id}`;
          const lineAmount = numberValue(item.price);
          const row =
            acc.get(key) ||
            {
              id: key,
              supplierId,
              supplier: supplierById.get(supplierId) || "No supplier",
              item: item.test_name || catalogItem?.name || "Lab item",
              orders: new Set(),
              invoices: new Set(),
              itemTotal: 0,
              offerDiscount: 0,
              membershipBenefit: 0,
              revenue: 0,
              purchaseCost: 0,
            };
          row.orders.add(invoice.lab_order_id);
          row.invoices.add(invoice.id);
          row.itemTotal += lineAmount;
          row.offerDiscount += allocatedLineOfferDiscount(invoice, lineAmount);
          row.membershipBenefit += allocatedLineMembershipBenefit(invoice, lineAmount);
          row.revenue += allocatedLineRevenue(invoice, lineAmount);
          row.purchaseCost += numberValue(catalogItem?.purchase_price);
          acc.set(key, row);
        }
        return acc;
      }, new Map<string, any>())
      .values(),
  )
    .map((row: any) => ({
      ...row,
      orderCount: row.orders.size,
      invoiceCount: row.invoices.size,
      profit: Math.max(row.revenue - row.purchaseCost, 0),
    }))
    .filter((row: any) => supplierFilter === "all" || row.supplierId === supplierFilter)
    .sort((a: any, b: any) => b.profit - a.profit);
  const pharmacyIssueDetailById = useMemo(
    () => new Map(pharmacyIssueDetails.map((detail: any) => [detail.issue?.id, detail])),
    [pharmacyIssueDetails],
  );
  const pharmacySettlementRows = Array.from(
    filteredInvoices
      .filter((invoice: any) => invoiceType(invoice) === "pharmacy" && invoice.pharmacy_issue_id)
      .reduce((acc: Map<string, any>, invoice: any) => {
        const detail: any = pharmacyIssueDetailById.get(invoice.pharmacy_issue_id);
        const items = detail?.items?.length ? detail.items : [{medicine_name: "Unmapped Pharmacy Invoice", unit_price: invoiceItemTotal(invoice), quantity: 1}];
        for (const item of items) {
          const medicine = medicineById.get(item.medicine_id);
          const supplierId = medicine?.supplier_id || "none";
          const key = `${supplierId}:${item.medicine_name || item.id}`;
          const quantity = numberValue(item.dispensed_quantity || item.quantity || 1);
          const lineAmount = numberValue(item.unit_price) * quantity;
          const revenue = allocatedLineRevenue(invoice, lineAmount);
          const purchaseCost = numberValue(medicine?.purchase_price) * quantity;
          const row =
            acc.get(key) ||
            {
              id: key,
              supplierId,
              supplier: supplierById.get(supplierId) || "No supplier",
              item: item.medicine_name || medicine?.name || "Medicine",
              issues: new Set(),
              invoices: new Set(),
              quantity: 0,
              itemTotal: 0,
              offerDiscount: 0,
              membershipBenefit: 0,
              revenue: 0,
              purchaseCost: 0,
            };
          row.issues.add(invoice.pharmacy_issue_id);
          row.invoices.add(invoice.id);
          row.quantity += quantity;
          row.itemTotal += lineAmount;
          row.offerDiscount += allocatedLineOfferDiscount(invoice, lineAmount);
          row.membershipBenefit += allocatedLineMembershipBenefit(invoice, lineAmount);
          row.revenue += revenue;
          row.purchaseCost += purchaseCost;
          acc.set(key, row);
        }
        return acc;
      }, new Map<string, any>())
      .values(),
  )
    .map((row: any) => ({
      ...row,
      issueCount: row.issues.size,
      invoiceCount: row.invoices.size,
      profit: Math.max(row.revenue - row.purchaseCost, 0),
    }))
    .filter((row: any) => supplierFilter === "all" || row.supplierId === supplierFilter)
    .sort((a: any, b: any) => b.profit - a.profit);
  const labSettlementHeaders = [
    "Supplier",
    "Lab Test / Package",
    "Orders",
    "Invoices",
    "Item Total",
    "Offer Discount",
    "Membership Benefit",
    "Net Revenue",
    "Purchase Cost",
    "Lab Profit",
  ];
  const labSettlementExportRows = labSettlementRows.map((row: any) => [
    row.supplier,
    row.item,
    row.orderCount,
    row.invoiceCount,
    row.itemTotal,
    row.offerDiscount,
    row.membershipBenefit,
    row.revenue,
    row.purchaseCost,
    row.profit,
  ]);
  const pharmacySettlementHeaders = [
    "Supplier",
    "Medicine",
    "Issues",
    "Invoices",
    "Qty",
    "Item Total",
    "Offer Discount",
    "Membership Benefit",
    "Net Revenue",
    "Purchase Cost",
    "Pharmacy Profit",
  ];
  const pharmacySettlementExportRows = pharmacySettlementRows.map((row: any) => [
    row.supplier,
    row.item,
    row.issueCount,
    row.invoiceCount,
    row.quantity,
    row.itemTotal,
    row.offerDiscount,
    row.membershipBenefit,
    row.revenue,
    row.purchaseCost,
    row.profit,
  ]);
  const labSettlementSummary = labSettlementRows.reduce(
    (acc: any, row: any) => ({
      itemTotal: acc.itemTotal + numberValue(row.itemTotal),
      offerDiscount: acc.offerDiscount + numberValue(row.offerDiscount),
      membershipBenefit: acc.membershipBenefit + numberValue(row.membershipBenefit),
      revenue: acc.revenue + numberValue(row.revenue),
      purchaseCost: acc.purchaseCost + numberValue(row.purchaseCost),
      profit: acc.profit + numberValue(row.profit),
    }),
    {itemTotal: 0, offerDiscount: 0, membershipBenefit: 0, revenue: 0, purchaseCost: 0, profit: 0},
  );
  const pharmacySettlementSummary = pharmacySettlementRows.reduce(
    (acc: any, row: any) => ({
      itemTotal: acc.itemTotal + numberValue(row.itemTotal),
      offerDiscount: acc.offerDiscount + numberValue(row.offerDiscount),
      membershipBenefit: acc.membershipBenefit + numberValue(row.membershipBenefit),
      revenue: acc.revenue + numberValue(row.revenue),
      purchaseCost: acc.purchaseCost + numberValue(row.purchaseCost),
      profit: acc.profit + numberValue(row.profit),
    }),
    {itemTotal: 0, offerDiscount: 0, membershipBenefit: 0, revenue: 0, purchaseCost: 0, profit: 0},
  );
  const invoiceHeaders = [
    "Invoice",
    "Date",
    "Type",
    "Patient",
    "Doctor",
    "Status",
    "Item Total",
    "Offer Discount",
    "Membership Benefit",
    "Total",
    "Paid",
    "Balance",
    "Doctor Fee",
    "Settlement",
    "Clinic Profit",
  ];
  const invoiceRows = filteredInvoices.map((invoice: any) => {
    const appointment: any = appointmentById.get(invoice.appointment_id);
    const patient: any = patientById.get(invoice.patient_id);
    const settlement = settlementPaidBasis(invoice);
    const paid = numberValue(invoice.paid_amount);
    const doctorName =
      appointment?.doctor ||
      doctorById.get(appointment?.doctorId || appointment?.practitioner_id) ||
      "Unassigned";
    return [
      invoice.invoice_number,
      rowDate(invoice),
      invoiceTypeLabel(invoiceType(invoice)),
      patient?.name || patient?.full_name || invoice.patient_name || publicDisplayValue(invoice.patient_id),
      doctorName,
      humanizeOptionLabel(invoice.status),
      invoiceItemTotal(invoice),
      invoiceOfferDiscount(invoice),
      invoiceMembershipBenefit(invoice),
      numberValue(invoice.total_amount),
      paid,
      numberValue(invoice.balance_amount),
      numberValue(invoice.doctor_share_amount),
      settlement,
      Math.max(paid - settlement, 0),
    ];
  });
  const invoiceExportRows = invoiceRows.length
    ? [
        ...invoiceRows,
        [
          "Total",
          "",
          "",
          "",
          "",
          "",
          totals.itemTotal,
          totals.offerDiscount,
          totals.membershipDiscount,
          totals.grossRevenue,
          totals.paidRevenue,
          totals.balance,
          totals.doctorFee,
          totals.settlement,
          finalProfit,
        ],
      ]
    : invoiceRows;
  const summaryRows = [
    ["Item Total", totals.itemTotal],
    ["Offer Discounts Used", totals.offerDiscount],
    ["Membership Benefits Used", totals.membershipDiscount],
    ["Total Savings", totals.totalSavings],
    ["Net Invoice Revenue", totals.grossRevenue],
    ["Paid Revenue", totals.paidRevenue],
    ["Consultation Revenue", totals.consultationRevenue],
    ["Lab Revenue", totals.labRevenue],
    ["Pharmacy Revenue", totals.pharmacyRevenue],
    ["Membership Purchases", totals.membershipPurchases],
    ["Balance", totals.balance],
    ["Doctor Fee", totals.doctorFee],
    ["Settlement", totals.settlement],
    ["Clinic Fee", totals.clinicFee],
    ["Gross Profit", grossProfit],
    ["Gross Profit %", percent(grossProfit, totals.grossRevenue)],
    ["Final Profit", finalProfit],
    ["Final Profit %", percent(finalProfit, totals.paidRevenue)],
    ["Completed Consultations", completedAppointments.length],
  ];
  const exportName = `healthcare-profit-report-${fromDate || "start"}-${toDate || "end"}-${typeFilter}`;
  const canSendEmail = Boolean(
    apiSession?.user &&
      !apiSession.user.is_super_admin &&
      (apiSession.user.user_type === "tenant_admin" ||
        apiSession.user.roles?.includes("tenant_admin")),
  );

  function exportCsv() {
    const content = [
      "Healthcare Gross Profit Report",
      `Period,${fromDate || "-"},${toDate || "-"}`,
      "",
      tableToCsv(["Metric", "Value"], summaryRows),
      "",
      "Doctor Settlement & Profitability",
      tableToCsv(settlementHeaders, settlementExportRows),
      "",
      "Lab Test Settlement & Profitability",
      tableToCsv(labSettlementHeaders, labSettlementExportRows),
      "",
      "Pharmacy Settlement & Profitability",
      tableToCsv(pharmacySettlementHeaders, pharmacySettlementExportRows),
      "",
      "Invoice Profit Details",
      tableToCsv(invoiceHeaders, invoiceExportRows),
    ].join("\n");
    downloadBlob(`${exportName}.csv`, "text/csv;charset=utf-8", content);
  }

  function exportExcel() {
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Roboto, Arial, sans-serif; color: #1f2937; font-size: 13px; }
            h1 { margin: 0 0 6px; font-size: 22px; color: #0f172a; }
            p { margin: 0 0 18px; color: #475569; font-size: 13px; }
          </style>
        </head>
        <body>
          <h1 style="font-family:Roboto,Arial,sans-serif;font-size:22px;font-weight:bold;color:#0f172a;margin:0 0 6px;">Healthcare Gross Profit Report</h1>
          <p style="font-family:Roboto,Arial,sans-serif;font-size:13px;color:#475569;margin:0 0 18px;">Period: ${fromDate || "-"} to ${toDate || "-"}</p>
          ${titledHtmlTable("Summary", ["Metric", "Value"], summaryRows)}
          ${titledHtmlTable("Doctor Settlement & Profitability", settlementHeaders, settlementExportRows)}
          ${titledHtmlTable("Lab Test Settlement & Profitability", labSettlementHeaders, labSettlementExportRows)}
          ${titledHtmlTable("Pharmacy Settlement & Profitability", pharmacySettlementHeaders, pharmacySettlementExportRows)}
          ${titledHtmlTable("Invoice Profit Details", invoiceHeaders, invoiceExportRows)}
        </body>
      </html>
    `;
    downloadBlob(`${exportName}.xls`, "application/vnd.ms-excel;charset=utf-8", html);
  }

  function exportPdf() {
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Healthcare Gross Profit Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1, h2, h3 { margin: 0 0 8px; }
            p { color: #475569; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0 28px; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
            th { background: #f1f5f9; text-transform: uppercase; font-size: 11px; }
          </style>
        </head>
        <body>
          <h1>Healthcare Gross Profit Report</h1>
          <p>Period: ${fromDate || "-"} to ${toDate || "-"}</p>
          <h2>Summary</h2>
          ${htmlTable(["Metric", "Value"], summaryRows)}
          <h2>Doctor Settlement & Profitability</h2>
          ${htmlTable(settlementHeaders, settlementExportRows)}
          <h2>Lab Test Settlement & Profitability</h2>
          ${htmlTable(labSettlementHeaders, labSettlementExportRows)}
          <h2>Pharmacy Settlement & Profitability</h2>
          ${htmlTable(pharmacySettlementHeaders, pharmacySettlementExportRows)}
          <h2>Invoice Profit Details</h2>
          ${htmlTable(invoiceHeaders, invoiceExportRows)}
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  }

  async function sendEmailReport() {
    setSendMessage("");
    setSendError("");
    if (!fromDate || !toDate) {
      setSendError("Select from date and to date before sending.");
      return;
    }
    const recipients = Array.from(new Set(parseEmailList(recipientInput)));
    if (recipients.length === 0) {
      setSendError("Enter at least one email address.");
      return;
    }
    const invalidEmail = recipients.find((email) => !isEmail(email));
    if (invalidEmail) {
      setSendError(`Check email address: ${invalidEmail}`);
      return;
    }
    setSendBusy(true);
    try {
      const result = await apiFetch("/reports/profit-email/send", apiSession, {
        method: "POST",
        body: JSON.stringify({
          recipients,
          from_date: fromDate,
          to_date: toDate,
          doctor_id: doctorId === "all" ? null : doctorId,
          invoice_type: typeFilter,
          supplier_id: supplierFilter === "all" ? null : supplierFilter,
          branch_id: branchId || null,
        }),
      });
      const nextRecent = Array.from(new Set([...recipients, ...recentEmails])).slice(0, 6);
      setRecentEmails(nextRecent);
      if (typeof window !== "undefined" && apiSession?.tenantId) {
        window.localStorage.setItem(
          `medizinhub.reportEmails.${apiSession.tenantId}`,
          JSON.stringify(nextRecent),
        );
      }
      setSendPanelOpen(false);
      setSendMessage(
        `Sent to ${result.recipients.join(", ")} with ${result.attachment_filenames.length} Excel files.`,
      );
    } catch (err: any) {
      setSendError(err.message || "Could not send report email.");
    } finally {
      setSendBusy(false);
    }
  }

  function addRecipientSuggestion(email: string) {
    const current = parseEmailList(recipientInput);
    if (current.includes(email)) return;
    setRecipientInput([...current, email].join(", "));
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="text-lg font-bold">Healthcare Gross Profit Report</h3>
            <p className="text-sm text-slate-500">
              Item value, offer savings, membership benefits, collected revenue,
              and paid-basis settlement.
            </p>
          </div>
          <Badge tone="blue">
            {apiSession?.user?.is_super_admin ? "Super Admin" : "Tenant Admin"}
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-bold"
          >
            <Download size={15} />
            CSV
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="rounded-2xl border px-3 py-2 text-sm font-bold"
          >
            Excel
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="rounded-2xl border px-3 py-2 text-sm font-bold"
          >
            PDF
          </button>
          {canSendEmail && (
            <button
              type="button"
              onClick={() => {
                setSendPanelOpen((open) => !open);
                setSendMessage("");
                setSendError("");
              }}
              className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-bold disabled:text-slate-400"
            >
              <Mail size={15} />
              Send
            </button>
          )}
        </div>
        {canSendEmail && sendPanelOpen && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Field label="Email recipients">
              <textarea
                value={recipientInput}
                onChange={(event: any) => setRecipientInput(event.target.value)}
                placeholder="Enter one or more email IDs, separated by comma"
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
              />
            </Field>
            {recentEmails.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {recentEmails.map((email) => (
                  <button
                    key={email}
                    type="button"
                    onClick={() => addRecipientSuggestion(email)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                  >
                    {email}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={sendEmailReport}
                disabled={sendBusy}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
              >
                <Mail size={15} />
                {sendBusy ? "Sending..." : "Send Excel"}
              </button>
              <button
                type="button"
                onClick={() => setSendPanelOpen(false)}
                disabled={sendBusy}
                className="rounded-2xl border bg-white px-4 py-2 text-sm font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {(sendMessage || sendError) && (
          <div
            className={`mt-3 rounded-2xl p-3 text-sm font-semibold ${
              sendError ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {sendError || sendMessage}
          </div>
        )}
        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <Field label="Period">
            <Select value={period} onChange={(event: any) => changePeriod(event.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>
          <Field label="From Date">
            <Input
              type="date"
              value={fromDate}
              onChange={(event: any) => {
                setPeriod("custom");
                setFromDate(event.target.value);
              }}
            />
          </Field>
          <Field label="To Date">
            <Input
              type="date"
              value={toDate}
              onChange={(event: any) => {
                setPeriod("custom");
                setToDate(event.target.value);
              }}
            />
          </Field>
          <Field label="Doctor">
            <Select value={doctorId} onChange={(event: any) => setDoctorId(event.target.value)}>
              <option value="all">All doctors</option>
              {doctorOptions.map(([id, label]: any) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={typeFilter} onChange={(event: any) => setTypeFilter(event.target.value)}>
              <option value="overall">Overall</option>
              <option value="consultation">Consultation</option>
              <option value="lab">Lab</option>
              <option value="pharmacy">Pharmacy</option>
            </Select>
          </Field>
          <Field label="Supplier">
            <Select value={supplierFilter} onChange={(event: any) => setSupplierFilter(event.target.value)}>
              <option value="all">All suppliers</option>
              <option value="none">No supplier</option>
              {suppliers.map((supplier: any) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={IndianRupee} label="Item Total" value={money(totals.itemTotal)} hint={`${totals.invoices} settled invoices`} />
        <Metric icon={Percent} label="Offer Discounts" value={money(totals.offerDiscount)} hint={`Membership benefits ${money(totals.membershipDiscount)}`} />
        <Metric icon={ReceiptIndianRupee} label="Net Invoice Revenue" value={money(totals.grossRevenue)} hint={`Tax collected ${money(totals.tax)}`} />
        <Metric icon={ReceiptIndianRupee} label="Paid Revenue" value={money(totals.paidRevenue)} hint={`Due ${money(totals.balance)}`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Stethoscope} label="Doctor Fee" value={money(totals.doctorFee)} hint={`Settlement ${money(totals.settlement)}`} />
        <Metric icon={Activity} label="Final Profit" value={money(finalProfit)} hint={`Gross profit ${money(grossProfit)}`} />
        <Metric icon={Percent} label="Gross Profit %" value={percent(grossProfit, totals.grossRevenue)} hint="After doctor fee on invoice value" />
        <Metric icon={Percent} label="Final Profit %" value={percent(finalProfit, totals.paidRevenue)} hint="After paid-basis doctor settlement" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={CalendarDays} label="Completed Consultations" value={completedAppointments.length} hint={`${patients.length} patient records · ${ipAdmissions.length} IP records`} />
        <Metric icon={ReceiptIndianRupee} label="Membership Benefits" value={money(totals.membershipDiscount)} hint={`${totals.membershipPurchases} plan purchase invoices`} />
        <Metric icon={ReceiptIndianRupee} label="Total Savings" value={money(totals.totalSavings)} hint="Offer discounts plus membership benefits" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={ReceiptIndianRupee} label="Consultation Revenue" value={money(totals.consultationRevenue)} hint="Paid consultation invoices" />
        <Metric icon={ReceiptIndianRupee} label="Lab Revenue" value={money(totals.labRevenue)} hint="Paid lab invoices" />
        <Metric icon={ReceiptIndianRupee} label="Pharmacy Revenue" value={money(totals.pharmacyRevenue)} hint="Paid pharmacy invoices" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Metric icon={ReceiptIndianRupee} label="Lab Settlement" value={money(labSettlementSummary.purchaseCost)} hint={`Net ${money(labSettlementSummary.revenue)} · saved ${money(labSettlementSummary.offerDiscount + labSettlementSummary.membershipBenefit)}`} />
        <Metric icon={ReceiptIndianRupee} label="Pharmacy Settlement" value={money(pharmacySettlementSummary.purchaseCost)} hint={`Net ${money(pharmacySettlementSummary.revenue)} · saved ${money(pharmacySettlementSummary.offerDiscount + pharmacySettlementSummary.membershipBenefit)}`} />
      </div>

      <CollapsibleReportSection
        title="Doctor Settlement & Profitability"
        subtitle="Profit and settlement use only fully paid invoices, so issued or due invoices do not overstate doctor payout or clinic profit."
        badge={`${doctorRows.length} doctors`}
        isOpen={openSections.doctor}
        onToggle={() => setOpenSections((state: any) => ({...state, doctor: !state.doctor}))}
      >
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full min-w-[1480px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Doctor</th>
                <th>Consultations</th>
                <th>Invoices</th>
                <th>Gross Revenue</th>
                <th>Paid</th>
                <th>Offer Discount</th>
                <th>Membership Benefit</th>
                <th>Doctor Fee</th>
                <th>Settlement</th>
                <th>Clinic Fee</th>
                <th>Gross Profit %</th>
                <th>Final Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {doctorRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-4 text-slate-500">
                    No healthcare invoices match this filter.
                  </td>
                </tr>
              )}
              {doctorRows.map((row: any) => (
                <tr key={row.id}>
                  <td className="px-4 py-4">
                    <b>{row.doctor}</b>
                  </td>
                  <td>{row.consultations}</td>
                  <td>{row.invoices}</td>
                  <td>{money(row.grossRevenue)}</td>
                  <td>{money(row.paidRevenue)}</td>
                  <td>{money(row.offerDiscount)}</td>
                  <td>{money(row.membershipDiscount)}</td>
                  <td>{money(row.doctorFee)}</td>
                  <td>{money(row.settlement)}</td>
                  <td>{money(row.clinicFee)}</td>
                  <td>{percent(Math.max(row.grossRevenue - row.doctorFee, 0), row.grossRevenue)}</td>
                  <td className="font-bold">{money(row.finalProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleReportSection>

      <CollapsibleReportSection
        title="Lab Test Settlement & Profitability"
        subtitle="Outside lab purchase cost is taken from each lab test or package supplier setup."
        badge={`${labSettlementRows.length} lab items`}
        isOpen={openSections.lab}
        onToggle={() => setOpenSections((state: any) => ({...state, lab: !state.lab}))}
      >
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full min-w-[1480px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Supplier</th>
                <th>Lab Test / Package</th>
                <th>Orders</th>
                <th>Invoices</th>
                <th>Item Total</th>
                <th>Offer Discount</th>
                <th>Membership Benefit</th>
                <th>Net Revenue</th>
                <th>Purchase Cost</th>
                <th>Lab Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {labSettlementRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-4 text-slate-500">
                    No settled lab invoices match this filter.
                  </td>
                </tr>
              )}
              {labSettlementRows.map((row: any) => (
                <tr key={row.id}>
                  <td className="px-4 py-4">
                    <b>{row.supplier}</b>
                  </td>
                  <td>{row.item}</td>
                  <td>{row.orderCount}</td>
                  <td>{row.invoiceCount}</td>
                  <td>{money(row.itemTotal)}</td>
                  <td>{money(row.offerDiscount)}</td>
                  <td>{money(row.membershipBenefit)}</td>
                  <td>{money(row.revenue)}</td>
                  <td>{money(row.purchaseCost)}</td>
                  <td className="font-bold">{money(row.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleReportSection>

      <CollapsibleReportSection
        title="Pharmacy Settlement & Profitability"
        subtitle="Medicine purchase cost is taken from each medicine supplier setup."
        badge={`${pharmacySettlementRows.length} medicines`}
        isOpen={openSections.pharmacy}
        onToggle={() => setOpenSections((state: any) => ({...state, pharmacy: !state.pharmacy}))}
      >
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full min-w-[1580px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Supplier</th>
                <th>Medicine</th>
                <th>Issues</th>
                <th>Invoices</th>
                <th>Qty</th>
                <th>Item Total</th>
                <th>Offer Discount</th>
                <th>Membership Benefit</th>
                <th>Net Revenue</th>
                <th>Purchase Cost</th>
                <th>Pharmacy Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pharmacySettlementRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-4 text-slate-500">
                    No settled pharmacy invoices match this filter.
                  </td>
                </tr>
              )}
              {pharmacySettlementRows.map((row: any) => (
                <tr key={row.id}>
                  <td className="px-4 py-4">
                    <b>{row.supplier}</b>
                  </td>
                  <td>{row.item}</td>
                  <td>{row.issueCount}</td>
                  <td>{row.invoiceCount}</td>
                  <td>{row.quantity}</td>
                  <td>{money(row.itemTotal)}</td>
                  <td>{money(row.offerDiscount)}</td>
                  <td>{money(row.membershipBenefit)}</td>
                  <td>{money(row.revenue)}</td>
                  <td>{money(row.purchaseCost)}</td>
                  <td className="font-bold">{money(row.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleReportSection>

      <Card>
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
          <div>
            <h3 className="text-lg font-bold">Invoice Profit Details</h3>
            <p className="text-sm text-slate-500">Paid invoices and fully discounted membership invoices are shown.</p>
          </div>
          <Badge tone="green">{filteredInvoices.length} settled invoices</Badge>
        </div>
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full min-w-[1760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th>Type</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Status</th>
                <th>Item Total</th>
                <th>Offer Discount</th>
                <th>Membership Benefit</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Doctor Fee</th>
                <th>Settlement</th>
                <th>Clinic Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-4 text-slate-500">
                    No settled invoices match this filter.
                  </td>
                </tr>
              )}
              {invoicePageRows.map((invoice: any) => {
                const appointment: any = appointmentById.get(invoice.appointment_id);
                const patient: any = patientById.get(invoice.patient_id);
                const settlement = settlementPaidBasis(invoice);
                const paid = numberValue(invoice.paid_amount);
                const doctorName =
                  appointment?.doctor ||
                  doctorById.get(appointment?.doctorId || appointment?.practitioner_id) ||
                  "Unassigned";
                return (
                  <tr key={invoice.id}>
                    <td className="px-4 py-4">
                      <b>{invoice.invoice_number}</b>
                      <p className="text-xs text-slate-500">{rowDate(invoice)}</p>
                    </td>
                    <td>{invoiceTypeLabel(invoiceType(invoice))}</td>
                    <td>
                      <b>{patient?.name || patient?.full_name || invoice.patient_name || publicDisplayValue(invoice.patient_id)}</b>
                    </td>
                    <td>{doctorName}</td>
                    <td>
                      <Badge tone={invoice.status === "paid" ? "green" : invoice.status === "partially_paid" ? "amber" : "slate"}>
                        {humanizeOptionLabel(invoice.status)}
                      </Badge>
                    </td>
                    <td>{money(invoiceItemTotal(invoice))}</td>
                    <td>{money(invoiceOfferDiscount(invoice))}</td>
                    <td>{money(invoiceMembershipBenefit(invoice))}</td>
                    <td>{money(invoice.total_amount)}</td>
                    <td>{money(paid)}</td>
                    <td>{money(invoice.balance_amount)}</td>
                    <td>{money(invoice.doctor_share_amount)}</td>
                    <td>{money(settlement)}</td>
                    <td className="font-bold">{money(Math.max(paid - settlement, 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safeInvoicePage}
          totalPages={totalInvoicePages}
          total={filteredInvoices.length}
          onPage={setInvoicePage}
        />
      </Card>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }: any) {
  return (
    <Card>
      <Icon className="text-slate-500" />
      <p className="mt-3 text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-2 text-xs font-semibold text-slate-500">{hint}</p>
    </Card>
  );
}

function CollapsibleReportSection({title, subtitle, badge, isOpen, onToggle, children}: any) {
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col justify-between gap-3 text-left md:flex-row md:items-center"
      >
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="blue">{badge}</Badge>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600">
            <ChevronDown size={17} className={`transition ${isOpen ? "rotate-180" : ""}`} />
          </span>
        </div>
      </button>
      {isOpen && children}
    </Card>
  );
}

function Pagination({ page, totalPages, total, onPage }: any) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="mt-4 flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row sm:items-center">
      <span>Showing {start}-{end} of {total}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300"
        >
          Previous
        </button>
        <span className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}
