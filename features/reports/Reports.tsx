"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
/*   CalendarDays,
  ChevronDown,
  Download,
  IndianRupee,
  Mail,
  Percent,
  ReceiptIndianRupee,
  Stethoscope, */
  FileText,
  Receipt,
  Users,
  FlaskConical,
} from "lucide-react";
import { Badge, Card, Field, Input, Select } from "@/components/common/ui";
import { apiFetch } from "@/lib/api";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import {
  money,
  numberValue,
  dateKey,
  normalized,
  isCompleted,
  currentRange,
  toInputDate,
  percent,
  settlementPaidBasis,
  rowDate,
  isPaidInvoice,
  invoiceType,
  invoiceTypeLabel,
  csvCell,
  downloadBlob,
  tableToCsv,
  // htmlEscape,
  htmlTable,
  titledHtmlTable,
  parseEmailList,
  isEmail,
} from "./utils";
import Header from "@/components/reports/Header";
import InvoiceReport from "@/components/reports/InvoiceReport";
import MetricsReport from "./MetricsReport";
import PharmacyReports from "./PharmacyReports";
import AppointmentReports from "./AppointmentReports";
import LabReports from "./LabReports";

export const reportSections = [
  ["metrix", "Metrics Report", Activity],
  ["invoice", "Invoice Report", Receipt],
  ["lab", "Lab Report", FlaskConical],
  ["appointments", "Appointments Report", FileText],
  ["pharmacy", "Pharmacy Report", Users],
];

export function Reports({
  scopedAppointments,
  patients,
  ipAdmissions,
  apiSession,
  branchId,
  liveInvoices = [],
  livePractitioners = [],
  section,
  setSection,
}: any) {
  const [period, setPeriod] = useState("monthly");
  const [rangeStart, rangeEnd] = currentRange(period);
  const [fromDate, setFromDate] = useState(rangeStart);
  const [toDate, setToDate] = useState(rangeEnd);
  const [doctorId, setDoctorId] = useState("all");
  const [typeFilter, setTypeFilter] = useState("overall");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [openSections, setOpenSections] = useState<any>({
    doctor: true,
    lab: true,
    pharmacy: true,
  });
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
    () =>
      new Map<string, any>(scopedAppointments.map((row: any) => [row.id, row])),
    [scopedAppointments],
  );
  const pageSize = 10;
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
      return (
        type === "doctor" &&
        status !== "inactive" &&
        (!branchId || branchIds.length === 0 || branchIds.includes(branchId))
      );
    })
    .map((row: any) => [row.id, row.full_name || row.name || row.id]);

  const appointmentDoctorOptions = scopedAppointments
    .map((row: any) => [
      row.doctorId || row.practitioner_id,
      row.doctor ||
        row.practitioner_name ||
        doctorById.get(row.doctorId || row.practitioner_id),
    ])
    .filter(([id]) => Boolean(id));

  const doctorOptions = Array.from(
    new Map([...branchDoctorOptions, ...appointmentDoctorOptions]).entries(),
  ).sort((a: any, b: any) => String(a[1]).localeCompare(String(b[1])));

  const filteredInvoices = liveInvoices.filter((invoice: any) => {
    const invoiceDate = rowDate(invoice);
    const appointment = appointmentById.get(invoice.appointment_id);
    const invoiceDoctorId =
      appointment?.doctorId ||
      appointment?.practitioner_id ||
      invoice.practitioner_id;
    const invoiceBranchId =
      invoice.branch_id || appointment?.branchId || appointment?.branch_id;
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

  const totalInvoicePages = Math.max(
    1,
    Math.ceil(filteredInvoices.length / pageSize),
  );

  const safeInvoicePage = Math.min(invoicePage, totalInvoicePages);

  const invoicePageRows = filteredInvoices.slice(
    (safeInvoicePage - 1) * pageSize,
    safeInvoicePage * pageSize,
  );

  useEffect(() => {
    setInvoicePage(1);
  }, [fromDate, toDate, doctorId, typeFilter, branchId]);

  useEffect(() => {
    if (
      doctorId !== "all" &&
      !doctorOptions.some(([id]: any) => id === doctorId)
    ) {
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
        window.localStorage.getItem(
          `medizinhub.reportEmails.${apiSession.tenantId}`,
        ) || "[]",
      );
      if (Array.isArray(saved))
        setRecentEmails(
          saved.filter((item) => typeof item === "string").slice(0, 6),
        );
    } catch {}
  }, [apiSession?.tenantId]);

  useEffect(() => {
    if (!apiSession?.token) return;
    let cancelled = false;
    async function loadLabSettlementData() {
      const [testRows, packageRows, supplierRows, orderRows] =
        await Promise.all([
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
        sourceOrderIds.map((orderId: any) =>
          apiFetch(`/lab/orders/${orderId}`, apiSession).catch(() => null),
        ),
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
        sourceIssueIds.map((issueId: any) =>
          apiFetch(`/pharmacy/issues/${issueId}`, apiSession).catch(() => null),
        ),
      );
      if (!cancelled) setPharmacyIssueDetails(details.filter(Boolean));
    }
    loadPharmacySettlementData();
    return () => {
      cancelled = true;
    };
  }, [apiSession?.token, apiSession?.tenantId, liveInvoices.length]);

  const completedAppointments = scopedAppointments.filter((row: any) => {
    const appointmentDate = dateKey(
      row.appointmentDate || row.appointment_date,
    );
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
      acc.invoices += 1;
      acc.grossRevenue += total;
      acc.paidRevenue += paid;
      acc.balance += balance;
      acc.doctorFee += doctorShare;
      acc.settlement += settlement;
      acc.clinicFee +=
        numberValue(invoice.clinic_share_amount) ||
        Math.max(total - doctorShare, 0);
      acc.tax += numberValue(invoice.tax_amount);
      acc.membershipDiscount += numberValue(invoice.membership_discount_amount);
      if (
        invoice.patient_subscription_enrollment_id ||
        invoice.patient_subscription_plan_id
      )
        acc.membershipPurchases += 1;
      const type = invoiceType(invoice);
      if (type === "lab") acc.labRevenue += paid;
      if (type === "pharmacy") acc.pharmacyRevenue += paid;
      if (type === "consultation") acc.consultationRevenue += paid;
      return acc;
    },
    {
      invoices: 0,
      grossRevenue: 0,
      paidRevenue: 0,
      balance: 0,
      doctorFee: 0,
      settlement: 0,
      clinicFee: 0,
      tax: 0,
      membershipDiscount: 0,
      membershipPurchases: 0,
      consultationRevenue: 0,
      labRevenue: 0,
      pharmacyRevenue: 0,
    },
  );

  const grossProfit = Math.max(totals.grossRevenue - totals.doctorFee, 0);
  const finalProfit = Math.max(totals.paidRevenue - totals.settlement, 0);
  const doctorRows = Array.from(
    filteredInvoices
      .reduce((acc: Map<string, any>, invoice: any) => {
        const appointment: any = appointmentById.get(invoice.appointment_id);
        const key =
          appointment?.doctorId ||
          appointment?.practitioner_id ||
          invoice.practitioner_id ||
          "unassigned";
        const row = acc.get(key) || {
          id: key,
          doctor: appointment?.doctor || doctorById.get(key) || "Unassigned",
          invoices: 0,
          consultations: 0,
          grossRevenue: 0,
          paidRevenue: 0,
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
        row.doctorFee += doctorFee;
        row.settlement += settlement;
        row.clinicFee +=
          numberValue(invoice.clinic_share_amount) ||
          Math.max(total - doctorFee, 0);
        row.finalProfit += Math.max(paid - settlement, 0);
        acc.set(key, row);
        return acc;
      }, new Map<string, any>())
      .values(),
  )
    .map((row: any) => ({
      ...row,
      consultations: completedAppointments.filter(
        (appointment: any) =>
          (appointment.doctorId ||
            appointment.practitioner_id ||
            "unassigned") === row.id,
      ).length,
    }))
    .sort((a: any, b: any) => b.finalProfit - a.finalProfit);

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
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.consultations),
            0,
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.invoices),
            0,
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.grossRevenue),
            0,
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.paidRevenue),
            0,
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.doctorFee),
            0,
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.settlement),
            0,
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.clinicFee),
            0,
          ),
          percent(grossProfit, totals.grossRevenue),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.finalProfit),
            0,
          ),
        ],
      ]
    : settlementRows;

  const labTestById = useMemo(
    () => new Map(labTests.map((row: any) => [row.id, row])),
    [labTests],
  );
  const labPackageById = useMemo(
    () => new Map(labPackages.map((row: any) => [row.id, row])),
    [labPackages],
  );
  const medicineById = useMemo(
    () => new Map(medicineRows.map((row: any) => [row.id, row])),
    [medicineRows],
  );
  const supplierById = useMemo(
    () => new Map(suppliers.map((row: any) => [row.id, row.name])),
    [suppliers],
  );
  const labOrderDetailById = useMemo(
    () =>
      new Map(labOrderDetails.map((detail: any) => [detail.order?.id, detail])),
    [labOrderDetails],
  );
  const labSettlementRows = Array.from(
    filteredInvoices
      .filter(
        (invoice: any) =>
          invoiceType(invoice) === "lab" && invoice.lab_order_id,
      )
      .reduce((acc: Map<string, any>, invoice: any) => {
        const detail: any = labOrderDetailById.get(invoice.lab_order_id);
        const items = detail?.items?.length
          ? detail.items
          : [{ test_name: "Unmapped Lab Invoice", price: invoice.paid_amount }];
        for (const item of items) {
          const catalogItem = item.package_id
            ? labPackageById.get(item.package_id)
            : labTestById.get(item.test_id);
          const supplierId = catalogItem?.supplier_id || "none";
          const key = `${supplierId}:${item.test_name || item.id}`;
          const row = acc.get(key) || {
            id: key,
            supplierId,
            supplier: supplierById.get(supplierId) || "No supplier",
            item: item.test_name || catalogItem?.name || "Lab item",
            orders: new Set(),
            invoices: new Set(),
            revenue: 0,
            purchaseCost: 0,
          };
          row.orders.add(invoice.lab_order_id);
          row.invoices.add(invoice.id);
          row.revenue += numberValue(item.price);
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
    .filter(
      (row: any) =>
        supplierFilter === "all" || row.supplierId === supplierFilter,
    )
    .sort((a: any, b: any) => b.profit - a.profit);
  const pharmacyIssueDetailById = useMemo(
    () =>
      new Map(
        pharmacyIssueDetails.map((detail: any) => [detail.issue?.id, detail]),
      ),
    [pharmacyIssueDetails],
  );
  const pharmacySettlementRows = Array.from(
    filteredInvoices
      .filter(
        (invoice: any) =>
          invoiceType(invoice) === "pharmacy" && invoice.pharmacy_issue_id,
      )
      .reduce((acc: Map<string, any>, invoice: any) => {
        const detail: any = pharmacyIssueDetailById.get(
          invoice.pharmacy_issue_id,
        );
        const items = detail?.items?.length
          ? detail.items
          : [
              {
                medicine_name: "Unmapped Pharmacy Invoice",
                unit_price: invoice.paid_amount,
                quantity: 1,
              },
            ];
        for (const item of items) {
          const medicine = medicineById.get(item.medicine_id);
          const supplierId = medicine?.supplier_id || "none";
          const key = `${supplierId}:${item.medicine_name || item.id}`;
          const quantity = numberValue(
            item.dispensed_quantity || item.quantity || 1,
          );
          const revenue = numberValue(item.unit_price) * quantity;
          const purchaseCost = numberValue(medicine?.purchase_price) * quantity;
          const row = acc.get(key) || {
            id: key,
            supplierId,
            supplier: supplierById.get(supplierId) || "No supplier",
            item: item.medicine_name || medicine?.name || "Medicine",
            issues: new Set(),
            invoices: new Set(),
            quantity: 0,
            revenue: 0,
            purchaseCost: 0,
          };
          row.issues.add(invoice.pharmacy_issue_id);
          row.invoices.add(invoice.id);
          row.quantity += quantity;
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
    .filter(
      (row: any) =>
        supplierFilter === "all" || row.supplierId === supplierFilter,
    )
    .sort((a: any, b: any) => b.profit - a.profit);
  const labSettlementHeaders = [
    "Supplier",
    "Lab Test / Package",
    "Orders",
    "Invoices",
    "Revenue",
    "Purchase Cost",
    "Lab Profit",
  ];
  const labSettlementExportRows = labSettlementRows.map((row: any) => [
    row.supplier,
    row.item,
    row.orderCount,
    row.invoiceCount,
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
    "Revenue",
    "Purchase Cost",
    "Pharmacy Profit",
  ];
  const pharmacySettlementExportRows = pharmacySettlementRows.map(
    (row: any) => [
      row.supplier,
      row.item,
      row.issueCount,
      row.invoiceCount,
      row.quantity,
      row.revenue,
      row.purchaseCost,
      row.profit,
    ],
  );
  const labSettlementSummary = labSettlementRows.reduce(
    (acc: any, row: any) => ({
      revenue: acc.revenue + numberValue(row.revenue),
      purchaseCost: acc.purchaseCost + numberValue(row.purchaseCost),
      profit: acc.profit + numberValue(row.profit),
    }),
    { revenue: 0, purchaseCost: 0, profit: 0 },
  );
  const pharmacySettlementSummary = pharmacySettlementRows.reduce(
    (acc: any, row: any) => ({
      revenue: acc.revenue + numberValue(row.revenue),
      purchaseCost: acc.purchaseCost + numberValue(row.purchaseCost),
      profit: acc.profit + numberValue(row.profit),
    }),
    { revenue: 0, purchaseCost: 0, profit: 0 },
  );
  const invoiceHeaders = [
    "Invoice",
    "Date",
    "Type",
    "Patient",
    "Doctor",
    "Status",
    "Total",
    "Paid",
    "Balance",
    "Membership Discount",
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
      patient?.name ||
        patient?.full_name ||
        invoice.patient_name ||
        publicDisplayValue(invoice.patient_id),
      doctorName,
      humanizeOptionLabel(invoice.status),
      numberValue(invoice.total_amount),
      paid,
      numberValue(invoice.balance_amount),
      numberValue(invoice.membership_discount_amount),
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
          totals.grossRevenue,
          totals.paidRevenue,
          totals.balance,
          totals.membershipDiscount,
          totals.doctorFee,
          totals.settlement,
          finalProfit,
        ],
      ]
    : invoiceRows;
  const summaryRows = [
    ["Gross Revenue", totals.grossRevenue],
    ["Paid Revenue", totals.paidRevenue],
    ["Consultation Revenue", totals.consultationRevenue],
    ["Lab Revenue", totals.labRevenue],
    ["Pharmacy Revenue", totals.pharmacyRevenue],
    ["Membership Purchases", totals.membershipPurchases],
    ["Membership Discounts Used", totals.membershipDiscount],
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
    downloadBlob(
      `${exportName}.xls`,
      "application/vnd.ms-excel;charset=utf-8",
      html,
    );
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
      const nextRecent = Array.from(
        new Set([...recipients, ...recentEmails]),
      ).slice(0, 6);
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

  function renderReportSection(section: string) {
    switch (section) {
      case "appointments":
        return (
          <AppointmentReports
            doctorRows={doctorRows}
            openSections={openSections}
            setOpenSections={setOpenSections}
            money={money}
            percent={percent}
          />
        );

      case "invoice":
        return (
          <InvoiceReport
            filteredInvoices={filteredInvoices}
            invoicePageRows={invoicePageRows}
            appointmentById={appointmentById}
            patientById={patientById}
            settlementPaidBasis={settlementPaidBasis}
            numberValue={numberValue}
            doctorById={doctorById}
            rowDate={rowDate}
            invoiceTypeLabel={invoiceTypeLabel}
            invoiceType={invoiceType}
            publicDisplayValue={publicDisplayValue}
            humanizeOptionLabel={humanizeOptionLabel}
            money={money}
            safeInvoicePage={safeInvoicePage}
            totalInvoicePages={totalInvoicePages}
            total={filteredInvoices}
            setInvoicePage={setInvoicePage}
            pageSize={pageSize}
          />
        );

      case "lab":
        return (
          <LabReports
            labSettlementRows={labSettlementRows}
            openSections={openSections}
            setOpenSections={setOpenSections}
            money={money}
          />
        );

      case "pharmacy":
        return (
          <PharmacyReports
            pharmacySettlementRows={pharmacySettlementRows}
            openSections={openSections}
            setOpenSections={setOpenSections}
            money={money}
          />
        );

      case "metrix":
        return (
          <MetricsReport
            totals={totals}
            grossProfit={grossProfit}
            finalProfit={finalProfit}
            completedAppointments={completedAppointments}
            patients={patients}
            ipAdmissions={ipAdmissions}
            labSettlementSummary={labSettlementSummary}
            pharmacySettlementSummary={pharmacySettlementSummary}
            money={money}
            percent={percent}
          />
        );

      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      <Header
        apiSession={apiSession}
        exportCsv={exportCsv}
        exportExcel={exportExcel}
        exportPdf={exportPdf}
        canSendEmail={canSendEmail}
        sendPanelOpen={sendPanelOpen}
        setSendPanelOpen={setSendPanelOpen}
        sendMessage={sendMessage}
        setSendMessage={setSendMessage}
        sendError={sendError}
        setSendError={setSendError}
        recipientInput={recipientInput}
        setRecipientInput={setRecipientInput}
        recentEmails={recentEmails}
        addRecipientSuggestion={addRecipientSuggestion}
        sendEmailReport={sendEmailReport}
        sendBusy={sendBusy}
        period={period}
        changePeriod={changePeriod}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
        doctorId={doctorId}
        setDoctorId={setDoctorId}
        doctorOptions={doctorOptions}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        supplierFilter={supplierFilter}
        setSupplierFilter={setSupplierFilter}
        suppliers={suppliers}
        setPeriod={setPeriod}
      />

      {/* DYNAMIC CONTENT */}
      {renderReportSection(section)}
    </div>
  );
}
