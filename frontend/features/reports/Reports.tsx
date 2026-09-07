"use client";

import { useEffect, useMemo, useState } from "react";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import {
  numberValue,
  dateKey,
  normalized,
  isCompleted,
  currentRange,
  dashboardPeriodRanges,
  toInputDate,
  percent,
  settlementPaidBasis,
  rowDate,
  rowDateKey,
  isPaidInvoice,
  invoiceType,
  invoiceTypeLabel,
  downloadBlob,
  tableToCsv,
  htmlEscape,
  htmlTable,
  titledHtmlTable,
  parseEmailList,
  aggregateInvoiceMetrics,
  labReportItemKind,
} from "./helpers";
import { money } from "@/utils/helper";
import Header from "./components/Header";
import InvoiceReport from "./components/InvoiceReport";
import MetricsReport from "./components/MetricsReport";
import PharmacyReports from "./components/PharmacyReports";
import AppointmentReports from "./components/AppointmentReports";
import LabReports from "./components/LabReports";
import HomeCareReports from "./components/HomeCareReports";
import ReportTotals from "./components/ReportTotals";
import {
  approvedDiscountUsage,
  aggregatePaymentModeTotals,
  allocateReportValues,
  billingDiscountUsage,
  membershipBenefitUsage,
  offerDiscountUsage,
  realizedGrossProfit,
  recognizedInvoiceRevenue,
  recognizedInvoiceTax,
  reportPaymentMode,
  reportedInvoiceTotal,
} from "./financials";
import {
  homeCareHeaders,
  invoiceHeaders,
  labSettlementHeaders,
  pharmacySettlementHeaders,
  settlementHeaders,
} from "@/features/reports/constants";
import { useIpAdmissionsQuery } from "@/features/ip/api";
import { usePractitionersQuery } from "@/features/doctors/api/usePractitionersQuery";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";
import {
  useHomeCareBookings,
  useDashboardMetrics,
  useInvoiceDetailsBatch,
  useInvoiceDetailsBatchEffect,
  useLabSettlementData,
  useMonthlySnapshots,
  usePharmacySettlementData,
  useReportInvoices,
  useReportsActions,
  useReportsUsers,
} from "./api";
import { useExpensesData } from "@/features/expenses/api";
import { invoicePatientDueAmount } from "@/features/billing/helpers";

function serviceCategoryRevenue(
  invoices: any[],
  labOrderDetailById: Map<string, any>,
  labPackageById: Map<string, any>,
) {
  return invoices.reduce((sum: number, invoice: any) => {
    if (invoiceType(invoice) !== "lab" || !invoice.lab_order_id) return sum;
    const items = labOrderDetailById.get(invoice.lab_order_id)?.items || [];
    if (!items.length) return sum;
    const seenPackages = new Set<string>();
    const lines = items.flatMap((item: any) => {
      if (!item.package_id) {
        return [{ amount: numberValue(item.price), isService: false }];
      }
      if (seenPackages.has(item.package_id)) return [];
      seenPackages.add(item.package_id);
      return [
        {
          amount: numberValue(
            labPackageById.get(item.package_id)?.package_price,
          ),
          isService: true,
        },
      ];
    });
    const scopedLines = invoice.report_item_kind
      ? lines.filter((line: any) =>
          invoice.report_item_kind === "service"
            ? line.isService
            : !line.isService,
        )
      : lines;
    const allocations = allocateReportValues(
      scopedLines.map((line: any) => line.amount),
      numberValue(invoice.subtotal_amount),
      recognizedInvoiceRevenue(invoice),
    );
    return (
      sum +
      scopedLines.reduce(
        (itemSum: number, line: any, index: number) =>
          itemSum + (line.isService ? allocations[index] || 0 : 0),
        0,
      )
    );
  }, 0);
}

function metricsFilterRange(
  period: string,
  customStart: string,
  customEnd: string,
  today = new Date(),
): [string, string] {
  if (period === "custom") return [customStart, customEnd];
  if (period === "today") {
    const key = toInputDate(today);
    return [key, key];
  }
  if (["three_months", "six_months", "this_year", "twelve_months"].includes(period)) {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    start.setDate(1);
    if (period === "three_months") start.setMonth(start.getMonth() - 2);
    if (period === "six_months") start.setMonth(start.getMonth() - 5);
    if (period === "twelve_months") start.setMonth(start.getMonth() - 11);
    if (period === "this_year") start.setMonth(0);
    return [toInputDate(start), toInputDate(today)];
  }
  return dashboardPeriodRanges(period as any, today).range;
}

const recognizedExpenseStatuses = new Set(["approved", "reimbursed"]);

function aggregateExpenseMetrics(
  expenses: any[],
  start: string,
  end: string,
) {
  const totals: Record<string, number> = {
    monthlyExpenses: 0,
    expenseRent: 0,
    expenseUtilities: 0,
    expenseSupplies: 0,
    expenseTravel: 0,
    expenseMaintenance: 0,
    expenseOther: 0,
  };
  const categoryKeys: Record<string, string> = {
    rent: "expenseRent",
    utilities: "expenseUtilities",
    supplies: "expenseSupplies",
    travel: "expenseTravel",
    maintenance: "expenseMaintenance",
    other: "expenseOther",
  };

  expenses.forEach((expense) => {
    const status = String(expense.status || "").toLowerCase();
    const incurredOn = String(expense.incurred_on || expense.incurredOn || "");
    if (
      !recognizedExpenseStatuses.has(status) ||
      !incurredOn ||
      incurredOn < start ||
      incurredOn > end
    ) {
      return;
    }
    const amount = Math.max(numberValue(expense.amount), 0);
    const categoryKey = categoryKeys[String(expense.category || "")] || "expenseOther";
    totals.monthlyExpenses += amount;
    totals[categoryKey] += amount;
  });

  return totals;
}

export function Reports({
  scopedAppointments,
  apiSession,
  branchId,
  liveInvoices = [],
  section,
  setSection,
  setActive,
  loadLiveData,
}: any) {
  const { ipAdmissions } = useIpAdmissionsQuery(apiSession);
  const { livePractitioners } = usePractitionersQuery(apiSession);
  const [period, setPeriod] = useState("monthly");
  const [metricsChartPeriod, setMetricsChartPeriod] = useState("current_month");
  const [metricsCustomStart, setMetricsCustomStart] = useState(
    dashboardPeriodRanges("current_month").range[0],
  );
  const [metricsCustomEnd, setMetricsCustomEnd] = useState(
    dashboardPeriodRanges("current_month").range[1],
  );
  const [refreshTick, setRefreshTick] = useState(0);
  async function refreshReports() {
    if (loadLiveData && apiSession) await loadLiveData(apiSession);
    setRefreshTick((tick) => tick + 1);
  }
  const [rangeStart, rangeEnd] = currentRange(period);
  const [fromDate, setFromDate] = useState(rangeStart);
  const [toDate, setToDate] = useState(rangeEnd);
  const selectedMetricsRange = metricsFilterRange(
    metricsChartPeriod,
    metricsCustomStart,
    metricsCustomEnd,
  );
  const metricsToday = toInputDate(new Date());
  const metricsHistoryStartDate = new Date();
  metricsHistoryStartDate.setHours(0, 0, 0, 0);
  metricsHistoryStartDate.setDate(1);
  metricsHistoryStartDate.setMonth(metricsHistoryStartDate.getMonth() - 11);
  const rollingHistoryStart = toInputDate(metricsHistoryStartDate);
  const metricsHistoryStart = [rollingHistoryStart, selectedMetricsRange[0]]
    .filter(Boolean)
    .sort()[0];
  const metricsHistoryEnd = [metricsToday, selectedMetricsRange[1]]
    .filter(Boolean)
    .sort()
    .at(-1)!;
  const {
    dashboardMetrics,
    dashboardMetricsLoading,
    dashboardMetricsError,
  } = useDashboardMetrics({
    apiSession,
    branchId,
    fromDate: selectedMetricsRange[0],
    toDate: selectedMetricsRange[1],
    seriesFrom: metricsHistoryStart,
    seriesTo: metricsHistoryEnd,
    refreshTick,
    enabled: section === "metrix",
  });
  const { rawExpenses: metricsExpenseRows } = useExpensesData(
    section === "metrix" ? apiSession : null,
    {
      branchId,
      fromDate,
      toDate,
      refreshTick,
    },
  );
  const serverReportInvoices = useReportInvoices({
    apiSession,
    branchId,
    ranges: [
      [fromDate, toDate],
    ],
    refreshTick,
  });
  const reportInvoiceRows = serverReportInvoices ?? liveInvoices;
  const { patientMap: patientById } = usePatientReferencesQuery(
    apiSession,
    reportInvoiceRows.map((invoice: any) => invoice.patient_id),
  );
  const [doctorId, setDoctorId] = useState("all");
  const [typeFilter, setTypeFilter] = useState("overall");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [openSections, setOpenSections] = useState<any>({
    doctor: true,
    lab: true,
    pharmacy: true,
    homeCare: true,
  });
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePickerIds, setInvoicePickerIds] = useState<string[]>([]);
  const [recalculatingSnapshotId, setRecalculatingSnapshotId] = useState<
    string | null
  >(null);
  const [snapshotMessage, setSnapshotMessage] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMessage, setSendMessage] = useState("");
  const [sendError, setSendError] = useState("");
  const [sendPanelOpen, setSendPanelOpen] = useState(false);
  const [recipientInput, setRecipientInput] = useState("");
  const [recentEmails, setRecentEmails] = useState<string[]>([]);
  const [invoiceDetails, setInvoiceDetails] = useState<any[]>([]);
  const [invoiceDetailsLoading, setInvoiceDetailsLoading] = useState(false);
  const appointmentById = useMemo(
    () =>
      new Map<string, any>(scopedAppointments.map((row: any) => [row.id, row])),
    [scopedAppointments],
  );
  const pageSize = 10;
  const homeCareInvoiceIds = useMemo(
    () =>
      reportInvoiceRows
        .filter((invoice: any) => invoice.home_care_booking_id)
        .map((invoice: any) => invoice.id)
        .filter(Boolean)
        .sort(),
    [reportInvoiceRows],
  );
  const homeCareInvoiceIdsKey = homeCareInvoiceIds.join("|");

  const { users } = useReportsUsers({ apiSession, refreshTick });

  const { labTests, labPackages, suppliers, labOrderDetails, labSettlementLoading } =
    useLabSettlementData({
      apiSession,
      liveInvoices: reportInvoiceRows,
      refreshTick,
    });

  // Closed-month income snapshots (frozen at month end). Branch-scoped to match
  // the live dashboard's branch filter; no branch = all-branches aggregate.
  const { monthlySnapshots } = useMonthlySnapshots({
    apiSession,
    branchId,
    refreshTick,
  });

  const { homeCareBookings, homeCareBookingsLoading } = useHomeCareBookings({
    apiSession,
    branchId,
    refreshTick,
  });

  const {
    invoiceDetails: homeCareInvoiceDetails,
    invoiceDetailsLoading: homeCareInvoiceDetailsLoading,
  } = useInvoiceDetailsBatch({
    apiSession,
    invoiceIds: homeCareInvoiceIds,
    invoiceIdsKey: homeCareInvoiceIdsKey,
    refreshTick,
  });

  const { medicineRows, pharmacyIssueDetails, pharmacySettlementLoading } =
    usePharmacySettlementData({
      apiSession,
      liveInvoices: reportInvoiceRows,
      refreshTick,
    });

  const { recalculateMonthlySnapshot, sendEmailReport } = useReportsActions({
    apiSession,
    branchId,
    fromDate,
    toDate,
    doctorId,
    typeFilter,
    supplierFilter,
    recipientInput,
    recentEmails,
    setRecentEmails,
    setSendBusy,
    setSendMessage,
    setSendError,
    setSendPanelOpen,
    setSnapshotMessage,
    setRecalculatingSnapshotId,
    refreshReports,
  });

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
  const userById = useMemo(() => {
    const rows = [...users];
    if (apiSession?.user) rows.push(apiSession.user);
    return new Map(
      rows
        .filter((row: any) => row?.id)
        .map((row: any) => [
          row.id,
          row.name || row.full_name || row.email || row.id,
        ]),
    );
  }, [users, apiSession?.user]);

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

  const invoiceSupplierIds = useMemo(() => {
    const result = new Map<string, Set<string>>();
    for (const detail of invoiceDetails) {
      const invoiceId = detail?.invoice?.id;
      if (!invoiceId) continue;
      const ids = new Set<string>();
      for (const item of detail?.items || []) {
        if (item.supplier_id) ids.add(item.supplier_id);
      }
      result.set(`invoice:${invoiceId}`, ids);
    }
    const labCatalog = new Map(
      labTests.map((row: any) => [row.id, row]),
    );
    for (const detail of labOrderDetails) {
      const orderId = detail?.order?.id;
      if (!orderId) continue;
      const ids = new Set<string>();
      for (const item of detail?.items || []) {
        const supplierId =
          item.supplier_id || labCatalog.get(item.test_id)?.supplier_id;
        if (supplierId) ids.add(supplierId);
      }
      result.set(`lab:${orderId}`, ids);
    }
    const medicineCatalog = new Map(
      medicineRows.map((row: any) => [row.id, row]),
    );
    for (const detail of pharmacyIssueDetails) {
      const issueId = detail?.issue?.id;
      if (!issueId) continue;
      const ids = new Set<string>();
      for (const item of detail?.items || []) {
        const supplierId = medicineCatalog.get(item.medicine_id)?.supplier_id;
        if (supplierId) ids.add(supplierId);
      }
      result.set(`pharmacy:${issueId}`, ids);
    }
    return result;
  }, [
    invoiceDetails,
    labOrderDetails,
    labTests,
    medicineRows,
    pharmacyIssueDetails,
  ]);

  function invoiceMatchesSupplier(invoice: any) {
    if (supplierFilter === "all") return true;
    const type = invoiceType(invoice);
    const sourceId =
      type === "lab"
        ? invoice.lab_order_id
        : type === "pharmacy"
          ? invoice.pharmacy_issue_id
          : null;
    if (!sourceId) return false;
    const supplierIds = invoiceSupplierIds.has(`invoice:${invoice.id}`)
      ? invoiceSupplierIds.get(`invoice:${invoice.id}`)!
      : invoiceSupplierIds.get(`${type}:${sourceId}`) || new Set<string>();
    return supplierFilter === "none"
      ? supplierIds.size === 0
      : supplierIds.has(supplierFilter);
  }

  function invoiceMatchesType(invoice: any) {
    if (typeFilter === "overall") return true;
    const type = invoiceType(invoice);
    if (typeFilter === "service" || typeFilter === "lab") {
      if (type !== "lab") return false;
      const detail = labOrderDetails.find(
        (row: any) => row?.order?.id === invoice.lab_order_id,
      );
      const items = detail?.items || [];
      if (typeFilter === "service") {
        return items.some((item: any) => labReportItemKind(item) === "service");
      }
      return (
        items.length === 0 ||
        items.some(
          (item: any) =>
            labReportItemKind(item) === "lab" && Boolean(item.test_id),
        )
      );
    }
    if (typeFilter === "home_visit" || typeFilter === "home_care") {
      if (type !== "home_care") return false;
      const booking = homeCareBookings.find(
        (row: any) => row.id === invoice.home_care_booking_id,
      );
      const detail = homeCareInvoiceDetails.find(
        (row: any) => row?.invoice?.id === invoice.id,
      );
      const itemText = (detail?.items || [])
        .flatMap((item: any) => [
          item.external_slug,
          item.service_category,
          item.item_type,
          item.description,
        ])
        .map(normalized)
        .join(" ");
      const lines = [
        ...(booking?.services || []),
        ...(booking?.visit_logs || []),
      ];
      const homeVisitLines = lines.filter(
        (line: any) => line.service_category === "home_visit_service",
      ).length;
      const isHomeVisit =
        booking?.booking_type === "home_visit" ||
        (booking?.booking_type !== "home_care" &&
          homeVisitLines > 0 &&
          homeVisitLines >= lines.length - homeVisitLines) ||
        itemText.includes("home_visit") ||
        itemText.includes("home visit") ||
        itemText.includes("hv_");
      return typeFilter === "home_visit" ? isHomeVisit : !isHomeVisit;
    }
    return type === typeFilter;
  }

  const baseFilteredInvoices = reportInvoiceRows.filter((invoice: any) => {
    const invoiceDate = rowDateKey(invoice);
    const appointment = appointmentById.get(invoice.appointment_id);
    const invoiceDoctorId =
      appointment?.doctorId ||
      appointment?.practitioner_id ||
      invoice.practitioner_id;
    const invoiceBranchId =
      invoice.branch_id || appointment?.branchId || appointment?.branch_id;
    return (
      (!branchId || invoiceBranchId === branchId) &&
      (!fromDate || invoiceDate >= fromDate) &&
      (!toDate || invoiceDate <= toDate) &&
      (doctorId === "all" || invoiceDoctorId === doctorId) &&
      invoiceMatchesType(invoice)
    );
  });
  // Lab/Service supplier filtering happens on the matching lines below. An
  // invoice-level supplier check would incorrectly drop an in-house Service
  // when the same mixed invoice also contains an outsourced Lab Test.
  const reportInvoices = ["lab", "service"].includes(typeFilter)
    ? baseFilteredInvoices
    : baseFilteredInvoices.filter(invoiceMatchesSupplier);
  const paidReportInvoices = reportInvoices.filter(isPaidInvoice);

  function labServiceScopedInvoice(invoice: any) {
    if (!["lab", "service"].includes(typeFilter) || invoiceType(invoice) !== "lab") {
      return invoice;
    }
    const detail = labOrderDetails.find(
      (row: any) => row?.order?.id === invoice.lab_order_id,
    );
    const seenPackageIds = new Set<string>();
    const lines = (detail?.items || []).flatMap((item: any) => {
      if (labReportItemKind(item) === "service") {
        const serviceKey = String(
          item.package_id || item.id || item.external_item_code || item.test_name,
        );
        if (seenPackageIds.has(serviceKey)) return [];
        seenPackageIds.add(serviceKey);
        const packageRow = labPackages.find(
          (row: any) => row.id === item.package_id,
        );
        return [
          {
            kind: "service",
            amount: numberValue(packageRow?.package_price || item.price),
            cost: numberValue(packageRow?.purchase_price || item.buying_price),
            supplierId: packageRow?.supplier_id || item.supplier_id || "",
          },
        ];
      }
      return [
        {
          kind: "lab",
          amount: numberValue(item.price),
          cost: numberValue(item.buying_price),
          supplierId: item.supplier_id || "",
        },
      ];
    });
    const matchingLines = lines.filter((line: any) => {
      if (line.kind !== typeFilter) return false;
      if (supplierFilter === "all") return true;
      if (supplierFilter === "none") return !line.supplierId;
      return line.supplierId === supplierFilter;
    });
    const matchingAmount = matchingLines.reduce(
      (sum: number, line: any) => sum + line.amount,
      0,
    );
    if (!matchingLines.length || matchingAmount <= 0) return null;
    const invoiceSubtotal = numberValue(invoice.subtotal_amount);
    const allocate = (value: any) =>
      allocateReportValues(
        matchingLines.map((line: any) => line.amount),
        invoiceSubtotal,
        numberValue(value),
      ).reduce((sum: number, amount: number) => sum + amount, 0);
    return {
      ...invoice,
      report_item_kind: typeFilter,
      subtotal_amount: matchingAmount,
      total_amount: allocate(invoice.total_amount),
      paid_amount: allocate(invoice.paid_amount),
      balance_amount: allocate(invoicePatientDueAmount(invoice)),
      tax_amount: allocate(invoice.tax_amount),
      discount_amount: allocate(invoice.discount_amount),
      approved_discount_amount: allocate(invoice.approved_discount_amount),
      offer_discount_amount: allocate(invoice.offer_discount_amount),
      membership_discount_amount: allocate(invoice.membership_discount_amount),
      membership_free_items_amount: allocate(
        invoice.membership_free_items_amount,
      ),
      report_settlement_amount: matchingLines.reduce(
        (sum: number, line: any) => sum + line.cost,
        0,
      ),
    };
  }

  const filteredInvoices = paidReportInvoices
    .map(labServiceScopedInvoice)
    .filter(Boolean);

  const totalInvoicePages = Math.max(
    1,
    Math.ceil(filteredInvoices.length / pageSize),
  );

  const safeInvoicePage = Math.min(invoicePage, totalInvoicePages);

  const invoicePageRows = filteredInvoices.slice(
    (safeInvoicePage - 1) * pageSize,
    safeInvoicePage * pageSize,
  );
  const filteredInvoiceIds = useMemo(() => {
    return Array.from(
      new Set<string>(
        baseFilteredInvoices
          .map((invoice: any) => invoice.id)
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
      ),
    );
  }, [baseFilteredInvoices]);
  const filteredInvoiceIdsKey = filteredInvoiceIds.join("|");
  useInvoiceDetailsBatchEffect({
    apiSession,
    invoiceIds: filteredInvoiceIds,
    invoiceIdsKey: filteredInvoiceIdsKey,
    refreshTick,
    setInvoiceDetails,
    setInvoiceDetailsLoading,
  });
  const invoiceById = useMemo(
    () =>
      new Map<string, any>(reportInvoiceRows.map((row: any) => [row.id, row])),
    [reportInvoiceRows],
  );
  const invoiceDetailById = useMemo(
    () =>
      new Map(
        invoiceDetails
          .filter((detail: any) => detail?.invoice?.id)
          .map((detail: any) => [detail.invoice.id, detail]),
      ),
    [invoiceDetails],
  );

  function openInvoice(invoiceId: string) {
    if (!invoiceId || typeof window === "undefined") return;
    window.sessionStorage.setItem("medizinhub.billingInvoiceId", invoiceId);
    setInvoicePickerIds([]);
    setActive?.("billing");
  }

  function openLinkedInvoices(value: any) {
    const ids = Array.from(
      new Set<string>(
        (value instanceof Set ? Array.from(value) : Array.isArray(value) ? value : [value])
          .filter(Boolean)
          .map(String),
      ),
    );
    if (ids.length === 1) openInvoice(ids[0]);
    else if (ids.length > 1) setInvoicePickerIds(ids);
  }

  useEffect(() => {
    setInvoicePage(1);
  }, [fromDate, toDate, doctorId, typeFilter, supplierFilter, branchId, section]);

  // The shared metrics filter controls the Cards dashboard, KPI cards and all
  // charts. Individual chart controls may then override only their own panel.
  useEffect(() => {
    if (section !== "metrix") return;
    const { range } = dashboardPeriodRanges("current_month");
    const [start, end] = range;
    setPeriod("monthly");
    setMetricsChartPeriod("current_month");
    setFromDate(start);
    setToDate(end);
    setMetricsCustomStart(start);
    setMetricsCustomEnd(end);
    setDoctorId("all");
    setTypeFilter("overall");
    setSupplierFilter("all");
  }, [section]);

  function changeMetricsChartPeriod(nextPeriod: string) {
    setMetricsChartPeriod(nextPeriod);
    const [start, end] = metricsFilterRange(
      nextPeriod,
      metricsCustomStart,
      metricsCustomEnd,
    );
    setFromDate(start);
    setToDate(end);
  }

  function changeMetricsCustomRange(start: string, end: string) {
    setMetricsCustomStart(start);
    setMetricsCustomEnd(end);
    if (metricsChartPeriod !== "custom" || !start || !end) return;
    setFromDate(start);
    setToDate(end);
  }

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

  // Split home care / home visit revenue by the booking type. Older bookings
  // may not have booking_type, so service categories remain the fallback.
  const homeVisitBookingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const booking of homeCareBookings) {
      if (booking.booking_type === "home_visit") {
        ids.add(booking.id);
        continue;
      }
      if (booking.booking_type === "home_care") continue;
      const lines = [
        ...(booking.services || []),
        ...(booking.visit_logs || []),
      ];
      let homeVisit = 0;
      let homeCare = 0;
      for (const line of lines) {
        if (line.service_category === "home_visit_service") homeVisit += 1;
        else homeCare += 1;
      }
      if (homeVisit > 0 && homeVisit >= homeCare) ids.add(booking.id);
    }
    return ids;
  }, [homeCareBookings]);

  const homeVisitInvoiceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const detail of homeCareInvoiceDetails) {
      const invoiceId = detail?.invoice?.id;
      const items = detail?.items || [];
      const hasHomeVisitItem = items.some((item: any) => {
        const fields = [
          item.external_slug,
          item.service_category,
          item.item_type,
          item.description,
        ]
          .map(normalized)
          .join(" ");
        return (
          fields.includes("home_visit") ||
          fields.includes("home visit") ||
          fields.includes("hv_")
        );
      });
      if (invoiceId && hasHomeVisitItem) ids.add(invoiceId);
    }
    return ids;
  }, [homeCareInvoiceDetails]);

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
  const labOrderDetailById = useMemo(
    () =>
      new Map(labOrderDetails.map((detail: any) => [detail.order?.id, detail])),
    [labOrderDetails],
  );
  const pharmacyIssueDetailById = useMemo(
    () =>
      new Map(
        pharmacyIssueDetails.map((detail: any) => [detail.issue?.id, detail]),
      ),
    [pharmacyIssueDetails],
  );

  const totals = {
    ...aggregateInvoiceMetrics(
      filteredInvoices,
      homeVisitBookingIds,
      homeVisitInvoiceIds,
      invoiceSettlementAmount,
    ),
    serviceRevenue: serviceCategoryRevenue(
      filteredInvoices,
      labOrderDetailById,
      labPackageById,
    ),
    paymentModes: aggregatePaymentModeTotals(
      filteredInvoices,
      invoiceDetailById,
    ),
    ...aggregateExpenseMetrics(metricsExpenseRows, fromDate, toDate),
  };
  const consultationSettlementInvoices = filteredInvoices.filter(
    (invoice: any) => {
      if (invoiceType(invoice) !== "consultation") return false;
      const appointment: any = appointmentById.get(invoice.appointment_id);
      return Boolean(
        appointment?.doctorId ||
        appointment?.practitioner_id ||
        invoice.practitioner_id,
      );
    },
  );

  const doctorRows = Array.from(
    consultationSettlementInvoices
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
          consultationIds: new Set<string>(),
          invoiceIds: new Set<string>(),
          paymentModes: new Set<string>(),
          grossRevenue: 0,
          paidRevenue: 0,
          paidTax: 0,
          balance: 0,
          doctorFee: 0,
          membershipBenefit: 0,
          approvedDiscount: 0,
          offerDiscount: 0,
          billingDiscount: 0,
          clinicFee: 0,
          finalProfit: 0,
        };
        const total = reportedInvoiceTotal(invoice);
        const paid = recognizedInvoiceRevenue(invoice);
        const doctorFee = invoiceDoctorFeeAmount(invoice);
        row.invoices += 1;
        row.invoiceIds.add(invoice.id);
        row.paymentModes.add(invoicePaymentMode(invoice));
        row.consultationIds.add(
          invoice.appointment_id || invoice.consultation_id || invoice.id,
        );
        row.grossRevenue += total;
        row.paidRevenue += paid;
        row.paidTax += recognizedInvoiceTax(invoice);
        row.balance += invoicePatientDueAmount(invoice);
        row.doctorFee += doctorFee;
        row.membershipBenefit += membershipBenefitUsage(invoice);
        row.approvedDiscount += approvedDiscountUsage(invoice);
        row.offerDiscount += offerDiscountUsage(invoice);
        row.billingDiscount += billingDiscountUsage(invoice);
        row.clinicFee +=
          numberValue(invoice.clinic_share_amount) ||
          Math.max(total - membershipBenefitUsage(invoice) - doctorFee, 0);
        row.finalProfit += realizedGrossProfit(invoice, doctorFee);
        acc.set(key, row);
        return acc;
      }, new Map<string, any>())
      .values(),
  )
    .map((row: any) => {
      const consultationIds = new Set(row.consultationIds);
      completedAppointments
        .filter(
          (appointment: any) =>
            (appointment.doctorId ||
              appointment.practitioner_id ||
              "unassigned") === row.id,
        )
        .forEach((appointment: any) =>
          consultationIds.add(
            appointment.id ||
              appointment.appointment_id ||
              `completed:${row.id}:${consultationIds.size}`,
          ),
        );
      return {
        ...row,
        consultationIds,
        consultations: consultationIds.size,
        paymentMode:
          Array.from(row.paymentModes)
            .filter((value: any) => value && value !== "-")
            .join(" + ") || "-",
        doctorFeePercent: percent(
          row.doctorFee,
          row.paidRevenue,
          row.grossRevenue,
        ),
      };
    })
    .sort((a: any, b: any) => b.finalProfit - a.finalProfit);

  function changePeriod(nextPeriod: string) {
    const [start, end] = currentRange(nextPeriod);
    setPeriod(nextPeriod);
    if (nextPeriod !== "custom") {
      setFromDate(start);
      setToDate(end);
    }
  }

  const settlementRows = doctorRows.map((row: any, index: number) => [
    index + 1,
    row.doctor,
    row.consultations,
    row.invoices,
    row.grossRevenue,
    row.paidRevenue,
    row.balance,
    row.paymentMode,
    row.paidTax,
    row.doctorFee,
    row.clinicFee,
    row.finalProfit,
    percent(row.finalProfit, row.paidRevenue - row.paidTax, row.grossRevenue),
  ]);
  const doctorExportTotals = doctorRows.reduce(
    (sum: any, row: any) => {
      for (const key of [
        "consultations",
        "invoices",
        "grossRevenue",
        "paidRevenue",
        "balance",
        "paidTax",
        "doctorFee",
        "clinicFee",
        "finalProfit",
      ]) sum[key] += numberValue(row[key]);
      return sum;
    },
    { consultations: 0, invoices: 0, grossRevenue: 0, paidRevenue: 0, balance: 0, paidTax: 0, doctorFee: 0, clinicFee: 0, finalProfit: 0 },
  );
  const settlementExportRows = [
        ...settlementRows,
        [
          `Filtered Totals (${doctorRows.length})`,
          "",
          doctorExportTotals.consultations,
          doctorExportTotals.invoices,
          doctorExportTotals.grossRevenue,
          doctorExportTotals.paidRevenue,
          doctorExportTotals.balance,
          "-",
          doctorExportTotals.paidTax,
          doctorExportTotals.doctorFee,
          doctorExportTotals.clinicFee,
          doctorExportTotals.finalProfit,
          percent(doctorExportTotals.finalProfit, doctorExportTotals.paidRevenue - doctorExportTotals.paidTax),
        ],
      ];

  const supplierById = useMemo(
    () => new Map(suppliers.map((row: any) => [row.id, row.name])),
    [suppliers],
  );
  const homeCareBookingById = useMemo(
    () => new Map(homeCareBookings.map((row: any) => [row.id, row])),
    [homeCareBookings],
  );
  const ipAdmissionById = useMemo(
    () => new Map(ipAdmissions.map((row: any) => [row.id, row])),
    [ipAdmissions],
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
          : [
              {
                test_id: "unmapped",
                test_name: "Unmapped Lab Invoice",
                price: invoice.subtotal_amount,
              },
            ];
        const seenPackageIds = new Set<string>();
        const reportItems = items
          .flatMap((item: any) => {
            if (labReportItemKind(item) === "lab")
              return item.test_id ? [{ ...item, reportKind: "lab" }] : [];
            const serviceKey = String(
              item.package_id ||
                item.id ||
                item.external_item_code ||
                item.test_name,
            );
            if (seenPackageIds.has(serviceKey)) return [];
            seenPackageIds.add(serviceKey);
            const service: any = labPackageById.get(item.package_id);
            return [
              {
                ...item,
                reportKind: "service",
                test_id: null,
                test_name: service?.name || item.test_name || "Service package",
                price: numberValue(service?.package_price || item.price),
                mrp_price: numberValue(service?.mrp_price || item.mrp_price),
                buying_price: numberValue(
                  service?.purchase_price || item.buying_price,
                ),
                supplier_id: service?.supplier_id || item.supplier_id,
              },
            ];
          })
          .filter(
            (item: any) =>
              !invoice.report_item_kind ||
              item.reportKind === invoice.report_item_kind,
          );
        const lineAmounts = reportItems.map((item: any) =>
          numberValue(item.price),
        );
        const invoiceSubtotal = numberValue(invoice.subtotal_amount);
        const allocatedRevenues = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          recognizedInvoiceRevenue(invoice),
        );
        const allocatedMemberships = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          membershipBenefitUsage(invoice),
        );
        const allocatedApprovedDiscounts = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          approvedDiscountUsage(invoice),
        );
        const allocatedOfferDiscounts = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          offerDiscountUsage(invoice),
        );
        const allocatedBillingDiscounts = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          billingDiscountUsage(invoice),
        );
        const allocatedBalances = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          invoicePatientDueAmount(invoice),
        );
        const allocatedTaxes = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          recognizedInvoiceTax(invoice),
        );
        reportItems.forEach((item: any, itemIndex: number) => {
          const catalogItem = labTestById.get(item.test_id);
          const billedItems = invoiceDetailById.get(invoice.id)?.items || [];
          const billedItem =
            billedItems.find(
              (row: any) =>
                row.external_item_code === (item.package_id || item.test_id) ||
                row.description === item.test_name,
            ) || billedItems[itemIndex];
          const supplierId =
            billedItem?.supplier_id ||
            item.supplier_id ||
            catalogItem?.supplier_id ||
            "none";
          const purchaseCost =
            billedItem !== undefined
              ? numberValue(billedItem.buying_amount) *
                numberValue(billedItem.quantity || 1)
              : numberValue(item.buying_price || catalogItem?.purchase_price);
          const key = `${supplierId}:${item.test_name || item.id}`;
          const lineAmount = numberValue(item.price);
          const allocatedRevenue = allocatedRevenues[itemIndex];
          const allocatedMembership = allocatedMemberships[itemIndex];
          const row = acc.get(key) || {
            id: key,
            supplierId,
            supplier:
              supplierId === "none"
                ? "Tenant Hospital / In-house"
                : supplierById.get(supplierId) || "No supplier",
            item: item.test_name || catalogItem?.name || "Lab item",
            orders: new Set(),
            invoices: new Set(),
            paymentModes: new Set<string>(),
            total: 0,
            revenue: 0,
            balance: 0,
            membershipBenefit: 0,
            approvedDiscount: 0,
            offerDiscount: 0,
            billingDiscount: 0,
            tax: 0,
            purchaseCost: 0,
          };
          row.orders.add(invoice.lab_order_id);
          row.invoices.add(invoice.id);
          row.paymentModes.add(invoicePaymentMode(invoice));
          row.total += lineAmount;
          row.revenue += allocatedRevenue;
          row.balance += allocatedBalances[itemIndex];
          row.membershipBenefit += allocatedMembership;
          row.approvedDiscount += allocatedApprovedDiscounts[itemIndex];
          row.offerDiscount += allocatedOfferDiscounts[itemIndex];
          row.billingDiscount += allocatedBillingDiscounts[itemIndex];
          row.tax += allocatedTaxes[itemIndex];
          row.purchaseCost += purchaseCost;
          acc.set(key, row);
        });
        return acc;
      }, new Map<string, any>())
      .values(),
  )
    .map((row: any) => ({
      ...row,
      orderCount: row.orders.size,
      invoiceCount: row.invoices.size,
      profit: row.revenue - row.tax - row.purchaseCost,
      paymentMode:
        Array.from(row.paymentModes)
          .filter((value: any) => value && value !== "-")
          .join(" + ") || "-",
      settlementPercent: percent(
        row.purchaseCost,
        row.revenue - row.tax,
        row.total,
      ),
    }))
    .filter(
      (row: any) =>
        supplierFilter === "all" || row.supplierId === supplierFilter,
    )
    .sort((a: any, b: any) => b.profit - a.profit);
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
                unit_price: invoice.subtotal_amount,
                quantity: 1,
              },
            ];
        const lineAmounts = items.map((item: any) => {
          const quantity = numberValue(
            item.dispensed_quantity || item.quantity || 1,
          );
          return numberValue(item.unit_price) * quantity;
        });
        const invoiceSubtotal = numberValue(invoice.subtotal_amount);
        const allocatedRevenues = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          recognizedInvoiceRevenue(invoice),
        );
        const allocatedMemberships = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          membershipBenefitUsage(invoice),
        );
        const allocatedApprovedDiscounts = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          approvedDiscountUsage(invoice),
        );
        const allocatedOfferDiscounts = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          offerDiscountUsage(invoice),
        );
        const allocatedBillingDiscounts = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          billingDiscountUsage(invoice),
        );
        const allocatedBalances = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          invoicePatientDueAmount(invoice),
        );
        const allocatedTaxes = allocateReportValues(
          lineAmounts,
          invoiceSubtotal,
          recognizedInvoiceTax(invoice),
        );
        items.forEach((item: any, itemIndex: number) => {
          const medicine = medicineById.get(item.medicine_id);
          const billedItems = invoiceDetailById.get(invoice.id)?.items || [];
          const billedItem =
            billedItems.find(
              (row: any) => row.description === item.medicine_name,
            ) || billedItems[itemIndex];
          const supplierId =
            billedItem?.supplier_id || medicine?.supplier_id || "none";
          const key = `${supplierId}:${item.medicine_name || item.id}`;
          const quantity = numberValue(
            item.dispensed_quantity || item.quantity || 1,
          );
          const revenue = lineAmounts[itemIndex];
          const allocatedRevenue = allocatedRevenues[itemIndex];
          const allocatedMembership = allocatedMemberships[itemIndex];
          const purchaseCost =
            billedItem !== undefined
              ? numberValue(billedItem.buying_amount) *
                numberValue(billedItem.quantity || quantity)
              : numberValue(medicine?.purchase_price) * quantity;
          const row = acc.get(key) || {
            id: key,
            supplierId,
            supplier: supplierById.get(supplierId) || "No supplier",
            item: item.medicine_name || medicine?.name || "Medicine",
            issues: new Set(),
            invoices: new Set(),
            paymentModes: new Set<string>(),
            quantity: 0,
            total: 0,
            revenue: 0,
            balance: 0,
            membershipBenefit: 0,
            approvedDiscount: 0,
            offerDiscount: 0,
            billingDiscount: 0,
            tax: 0,
            purchaseCost: 0,
          };
          row.issues.add(invoice.pharmacy_issue_id);
          row.invoices.add(invoice.id);
          row.paymentModes.add(invoicePaymentMode(invoice));
          row.quantity += quantity;
          row.total += revenue;
          row.revenue += allocatedRevenue;
          row.balance += allocatedBalances[itemIndex];
          row.membershipBenefit += allocatedMembership;
          row.approvedDiscount += allocatedApprovedDiscounts[itemIndex];
          row.offerDiscount += allocatedOfferDiscounts[itemIndex];
          row.billingDiscount += allocatedBillingDiscounts[itemIndex];
          row.tax += allocatedTaxes[itemIndex];
          row.purchaseCost += purchaseCost;
          acc.set(key, row);
        });
        return acc;
      }, new Map<string, any>())
      .values(),
  )
    .map((row: any) => ({
      ...row,
      issueCount: row.issues.size,
      invoiceCount: row.invoices.size,
      profit: row.revenue - row.tax - row.purchaseCost,
      paymentMode:
        Array.from(row.paymentModes)
          .filter((value: any) => value && value !== "-")
          .join(" + ") || "-",
      settlementPercent: percent(
        row.purchaseCost,
        row.revenue - row.tax,
        row.total,
      ),
    }))
    .filter(
      (row: any) =>
        supplierFilter === "all" || row.supplierId === supplierFilter,
    )
    .sort((a: any, b: any) => b.profit - a.profit);

  const labSettlementDataRows = labSettlementRows.map((row: any, index: number) => [
    index + 1,
    row.supplier,
    row.item,
    row.orderCount,
    row.invoiceCount,
    row.total,
    row.revenue,
    row.balance,
    row.paymentMode,
    row.tax,
    row.purchaseCost,
    row.profit,
    percent(row.profit, row.revenue - row.tax, row.total),
  ]);

  const pharmacySettlementDataRows = pharmacySettlementRows.map(
    (row: any, index: number) => [
      index + 1,
      row.supplier,
      row.item,
      row.issueCount,
      row.invoiceCount,
      row.quantity,
      row.total,
      row.revenue,
      row.balance,
      row.paymentMode,
      row.tax,
      row.purchaseCost,
      row.profit,
      percent(row.profit, row.revenue - row.tax, row.total),
    ],
  );
  const sumRows = (rows: any[], key: string) =>
    rows.reduce((sum: number, row: any) => sum + numberValue(row[key]), 0);
  const labRevenueTotal = sumRows(labSettlementRows, "revenue");
  const labTaxTotal = sumRows(labSettlementRows, "tax");
  const labProfitTotal = sumRows(labSettlementRows, "profit");
  const labSettlementExportRows = [
        ...labSettlementDataRows,
        [
          `Filtered Totals (${labSettlementRows.length})`,
          "",
          "",
          sumRows(labSettlementRows, "orderCount"),
          sumRows(labSettlementRows, "invoiceCount"),
          sumRows(labSettlementRows, "total"),
          labRevenueTotal,
          sumRows(labSettlementRows, "balance"),
          "-",
          labTaxTotal,
          sumRows(labSettlementRows, "purchaseCost"),
          labProfitTotal,
          percent(labProfitTotal, labRevenueTotal - labTaxTotal),
        ],
      ];
  const pharmacyRevenueTotal = sumRows(pharmacySettlementRows, "revenue");
  const pharmacyTaxTotal = sumRows(pharmacySettlementRows, "tax");
  const pharmacyProfitTotal = sumRows(pharmacySettlementRows, "profit");
  const pharmacySettlementExportRows = [
        ...pharmacySettlementDataRows,
        [
          `Filtered Totals (${pharmacySettlementRows.length})`,
          "",
          "",
          sumRows(pharmacySettlementRows, "issueCount"),
          sumRows(pharmacySettlementRows, "invoiceCount"),
          sumRows(pharmacySettlementRows, "quantity"),
          sumRows(pharmacySettlementRows, "total"),
          pharmacyRevenueTotal,
          sumRows(pharmacySettlementRows, "balance"),
          "-",
          pharmacyTaxTotal,
          sumRows(pharmacySettlementRows, "purchaseCost"),
          pharmacyProfitTotal,
          percent(pharmacyProfitTotal, pharmacyRevenueTotal - pharmacyTaxTotal),
        ],
      ];
  const labSettlementPurchaseCost = labSettlementRows.reduce(
    (sum: number, row: any) => sum + numberValue(row.purchaseCost),
    0,
  );
  const labSettlementRevenue = totals.labRevenue;
  const labSettlementSummary = {
    revenue: labSettlementRevenue,
    purchaseCost: labSettlementPurchaseCost,
    profit: labSettlementRows.reduce(
      (sum: number, row: any) => sum + numberValue(row.profit),
      0,
    ),
  };
  const pharmacySettlementSummary = pharmacySettlementRows.reduce(
    (acc: any, row: any) => ({
      revenue: acc.revenue + numberValue(row.revenue),
      purchaseCost: acc.purchaseCost + numberValue(row.purchaseCost),
      profit: acc.profit + numberValue(row.profit),
    }),
    { revenue: 0, purchaseCost: 0, profit: 0 },
  );
  function invoiceSettlementAmount(invoice: any) {
    if (invoice.report_settlement_amount != null) {
      return numberValue(invoice.report_settlement_amount);
    }
    const type = invoiceType(invoice);
    if (type === "consultation") return 0;
    const frozenItems = invoiceDetailById.get(invoice.id)?.items || [];
    if ((type === "lab" || type === "pharmacy") && frozenItems.length) {
      return frozenItems.reduce(
        (sum: number, item: any) =>
          sum +
          numberValue(item.buying_amount) * numberValue(item.quantity || 1),
        0,
      );
    }
    if (type === "lab" && invoice.lab_order_id) {
      const detail: any = labOrderDetailById.get(invoice.lab_order_id);
      const items = detail?.items || [];
      const seenPackageIds = new Set<string>();
      return items.reduce((sum: number, item: any) => {
        if (item.package_id) {
          if (seenPackageIds.has(item.package_id)) return sum;
          seenPackageIds.add(item.package_id);
          const packageRow: any = labPackageById.get(item.package_id);
          return sum + numberValue(packageRow?.purchase_price);
        }
        if (!item.test_id) return sum;
        const catalogItem = labTestById.get(item.test_id);
        const purchaseCost = numberValue(
          item.buying_price || catalogItem?.purchase_price,
        );
        return sum + purchaseCost;
      }, 0);
    }
    if (type === "pharmacy" && invoice.pharmacy_issue_id) {
      const detail: any = pharmacyIssueDetailById.get(
        invoice.pharmacy_issue_id,
      );
      const items = detail?.items || [];
      return items.reduce((sum: number, item: any) => {
        const medicine = medicineById.get(item.medicine_id);
        const quantity = numberValue(
          item.dispensed_quantity || item.quantity || 1,
        );
        return sum + numberValue(medicine?.purchase_price) * quantity;
      }, 0);
    }
    return settlementPaidBasis(invoice);
  }

  function invoiceDoctorFeeAmount(invoice: any) {
    return invoiceType(invoice) === "consultation"
      ? settlementPaidBasis(invoice)
      : 0;
  }

  function invoiceDoctorStaffName(invoice: any) {
    const appointment: any = appointmentById.get(invoice.appointment_id);
    const appointmentDoctor =
      appointment?.doctor ||
      doctorById.get(appointment?.doctorId || appointment?.practitioner_id);
    if (appointmentDoctor) return appointmentDoctor;

    const type = invoiceType(invoice);
    if (type === "lab" && invoice.lab_order_id) {
      const detail: any = labOrderDetailById.get(invoice.lab_order_id);
      const orderedBy = detail?.order?.ordered_by_user_id;
      if (orderedBy && userById.get(orderedBy)) return userById.get(orderedBy);
    }
    if (type === "pharmacy" && invoice.pharmacy_issue_id) {
      const detail: any = pharmacyIssueDetailById.get(
        invoice.pharmacy_issue_id,
      );
      const issuedBy = detail?.issue?.issued_by_user_id;
      if (issuedBy && userById.get(issuedBy)) return userById.get(issuedBy);
    }
    if (type === "home_care" && invoice.home_care_booking_id) {
      const booking: any = homeCareBookingById.get(
        invoice.home_care_booking_id,
      );
      const createdBy = booking?.created_by_user_id;
      if (createdBy && userById.get(createdBy)) return userById.get(createdBy);
    }
    if (type === "ip" && invoice.ip_admission_id) {
      const admission: any = ipAdmissionById.get(invoice.ip_admission_id);
      const createdBy = admission?.created_by_user_id;
      if (createdBy && userById.get(createdBy)) return userById.get(createdBy);
    }
    if (
      invoice.created_by_user_id &&
      userById.get(invoice.created_by_user_id)
    ) {
      return userById.get(invoice.created_by_user_id);
    }
    return "Unassigned";
  }

  function invoicePaymentMode(invoice: any) {
    const detail: any = invoiceDetailById.get(invoice.id);
    return reportPaymentMode(
      invoice,
      detail?.payments || [],
      humanizeOptionLabel,
    );
  }

  function invoiceGrossProfit(invoice: any) {
    return realizedGrossProfit(
      invoice,
      invoiceDoctorFeeAmount(invoice) + invoiceSettlementAmount(invoice),
    );
  }

  function invoiceGrossProfitPercent(invoice: any) {
    return percent(
      invoiceGrossProfit(invoice),
      numberValue(invoice.paid_amount) - recognizedInvoiceTax(invoice),
      reportedInvoiceTotal(invoice),
    );
  }

  function isHomeVisitInvoice(invoice: any) {
    return (
      homeVisitInvoiceIds.has(invoice.id) ||
      homeVisitBookingIds.has(invoice.home_care_booking_id)
    );
  }

  const sectionPaidInvoices = filteredInvoices.filter((invoice: any) => {
    const type = invoiceType(invoice);
    if (section === "lab") return type === "lab";
    if (section === "pharmacy") return type === "pharmacy";
    if (section === "home_care") return type === "home_care";
    if (section === "appointments") return type === "consultation";
    return true;
  });
  const summaryInvoices = sectionPaidInvoices;
  const reportCardTotals = {
    grandTotal: summaryInvoices.reduce(
      (sum: number, invoice: any) => sum + reportedInvoiceTotal(invoice),
      0,
    ),
    invoiceCount: summaryInvoices.length,
    paidRevenue: sectionPaidInvoices.reduce(
      (sum: number, invoice: any) => sum + recognizedInvoiceRevenue(invoice),
      0,
    ),
    doctorFee: sectionPaidInvoices.reduce(
      (sum: number, invoice: any) => sum + invoiceDoctorFeeAmount(invoice),
      0,
    ),
    settlement: sectionPaidInvoices.reduce(
      (sum: number, invoice: any) => sum + invoiceSettlementAmount(invoice),
      0,
    ),
    due: summaryInvoices.reduce(
      (sum: number, invoice: any) => sum + invoicePatientDueAmount(invoice),
      0,
    ),
    paidTax: sectionPaidInvoices.reduce(
      (sum: number, invoice: any) => sum + recognizedInvoiceTax(invoice),
      0,
    ),
    clinicFee: sectionPaidInvoices.reduce((sum: number, invoice: any) => {
      const total = reportedInvoiceTotal(invoice);
      const doctorCost = invoiceDoctorFeeAmount(invoice);
      return (
        sum +
        (numberValue(invoice.clinic_share_amount) ||
          Math.max(total - membershipBenefitUsage(invoice) - doctorCost, 0))
      );
    }, 0),
    grossProfit: sectionPaidInvoices.reduce(
      (sum: number, invoice: any) => sum + invoiceGrossProfit(invoice),
      0,
    ),
    membershipBenefit: summaryInvoices.reduce(
      (sum: number, invoice: any) =>
        sum + membershipBenefitUsage(invoice),
      0,
    ),
    approvedDiscount: summaryInvoices.reduce(
      (sum: number, invoice: any) => sum + approvedDiscountUsage(invoice),
      0,
    ),
    offerDiscount: summaryInvoices.reduce(
      (sum: number, invoice: any) => sum + offerDiscountUsage(invoice),
      0,
    ),
    billingDiscount: summaryInvoices.reduce(
      (sum: number, invoice: any) => sum + billingDiscountUsage(invoice),
      0,
    ),
  };

  const invoiceSettlementTotal = filteredInvoices.reduce(
    (sum: number, invoice: any) => sum + invoiceSettlementAmount(invoice),
    0,
  );
  const invoiceDoctorFeeTotal = filteredInvoices.reduce(
    (sum: number, invoice: any) => sum + invoiceDoctorFeeAmount(invoice),
    0,
  );
  const invoiceClinicProfitTotal = filteredInvoices.reduce(
    (sum: number, invoice: any) => sum + invoiceGrossProfit(invoice),
    0,
  );

  const invoiceRows = filteredInvoices.map((invoice: any, index: number) => {
    const patient: any = patientById.get(invoice.patient_id);
    const settlement = invoiceSettlementAmount(invoice);
    const paid = numberValue(invoice.paid_amount);
    return [
      index + 1,
      invoice.invoice_number,
      rowDate(invoice),
      invoice.report_item_kind === "lab"
        ? "Lab Test"
        : invoice.report_item_kind === "service"
          ? "Service"
          : invoiceTypeLabel(invoiceType(invoice)),
      patient?.name ||
        patient?.full_name ||
        invoice.patient_name ||
        publicDisplayValue(invoice.patient_id),
      invoiceDoctorStaffName(invoice),
      humanizeOptionLabel(invoice.status),
      reportedInvoiceTotal(invoice),
      paid,
      invoicePatientDueAmount(invoice),
      invoicePaymentMode(invoice),
      invoiceDoctorFeeAmount(invoice) + settlement,
      recognizedInvoiceTax(invoice),
      invoiceGrossProfit(invoice),
      invoiceGrossProfitPercent(invoice),
    ];
  });
  const homeCareReportRows = filteredInvoices
    .filter((invoice: any) => {
      if (invoiceType(invoice) !== "home_care") return false;
      return true;
    })
    .map((invoice: any) => {
      const patient: any = patientById.get(invoice.patient_id);
      const isHomeVisit = isHomeVisitInvoice(invoice);
      return {
        id: invoice.id,
        invoice: invoice.invoice_number,
        date: rowDate(invoice),
        type: isHomeVisit ? "Home Visit" : "Home Care",
        patient:
          patient?.name ||
          patient?.full_name ||
          invoice.patient_name ||
          publicDisplayValue(invoice.patient_id),
        patientReference: patient,
        staff: invoiceDoctorStaffName(invoice),
        invoiceIds: new Set([invoice.id]),
        totalAmount: reportedInvoiceTotal(invoice),
        paidAmount: numberValue(invoice.paid_amount),
        balance: invoicePatientDueAmount(invoice),
        approvedDiscount: approvedDiscountUsage(invoice),
        offerDiscount: offerDiscountUsage(invoice),
        membershipBenefit: membershipBenefitUsage(invoice),
        billingDiscount: billingDiscountUsage(invoice),
        paymentMode: invoicePaymentMode(invoice),
        paidTax: recognizedInvoiceTax(invoice),
        settlement: invoiceSettlementAmount(invoice),
        settlementPercent: percent(
          invoiceSettlementAmount(invoice),
          numberValue(invoice.paid_amount),
          reportedInvoiceTotal(invoice),
        ),
        grossProfit: invoiceGrossProfit(invoice),
        grossProfitPercent: invoiceGrossProfitPercent(invoice),
      };
    });
  const invoiceExportRows = [
        ...invoiceRows,
        [
          `Filtered Totals (${filteredInvoices.length})`,
          "",
          "",
          "",
          "",
          "",
          "",
          reportCardTotals.grandTotal,
          reportCardTotals.paidRevenue,
          reportCardTotals.due,
          "-",
          invoiceDoctorFeeTotal + invoiceSettlementTotal,
          reportCardTotals.paidTax,
          invoiceClinicProfitTotal,
          percent(
            invoiceClinicProfitTotal,
            reportCardTotals.paidRevenue - reportCardTotals.paidTax,
          ),
        ],
      ];
  const homeCareDataRows = homeCareReportRows.map((row: any, index: number) => [
    index + 1,
    row.invoice,
    row.date,
    row.type,
    row.patient,
    row.staff,
    row.totalAmount,
    row.paidAmount,
    row.balance,
    row.paymentMode,
    row.paidTax,
    row.settlement,
    row.grossProfit,
    row.grossProfitPercent,
  ]);
  const homeCarePaidTotal = sumRows(homeCareReportRows, "paidAmount");
  const homeCareTaxTotal = sumRows(homeCareReportRows, "paidTax");
  const homeCareProfitTotal = sumRows(homeCareReportRows, "grossProfit");
  const homeCareExportRows = [
        ...homeCareDataRows,
        [
          `Filtered Totals (${homeCareReportRows.length})`,
          "",
          "",
          "",
          "",
          "",
          sumRows(homeCareReportRows, "totalAmount"),
          homeCarePaidTotal,
          sumRows(homeCareReportRows, "balance"),
          "-",
          homeCareTaxTotal,
          sumRows(homeCareReportRows, "settlement"),
          homeCareProfitTotal,
          percent(homeCareProfitTotal, homeCarePaidTotal - homeCareTaxTotal),
        ],
      ];
  const exportName = `${section.replaceAll("_", "-")}-report-${fromDate || "start"}-${toDate || "end"}`;
  const canSendEmail = Boolean(
    apiSession?.tenantId && apiSession?.user && !apiSession.user.is_super_admin,
  );

  const activeSummaryRows = [
    ["Total Billed", reportCardTotals.grandTotal],
    ["Invoices", reportCardTotals.invoiceCount],
    ["Collected", reportCardTotals.paidRevenue],
    ["Due", reportCardTotals.due],
    ["Admin Discount", reportCardTotals.approvedDiscount],
    ["Offer Discount", reportCardTotals.offerDiscount],
    ["Membership Used", reportCardTotals.membershipBenefit],
    [section === "appointments" ? "Doctor Fee" : section === "invoice" ? "Total Cost" : "Settlement / Purchase Cost", reportCardTotals.settlement + reportCardTotals.doctorFee],
    ["Paid GST", reportCardTotals.paidTax],
    ["Profit", reportCardTotals.grossProfit],
    [
      "Profit Margin",
      percent(
        reportCardTotals.grossProfit,
        reportCardTotals.paidRevenue - reportCardTotals.paidTax,
        reportCardTotals.grandTotal,
      ),
    ],
  ];
  const labExportTitle =
    typeFilter === "lab"
      ? "Lab Test Settlement & Profitability"
      : typeFilter === "service"
        ? "Service Settlement & Profitability"
        : "Lab / Service Settlement & Profitability";
  const labExportHeaders = labSettlementHeaders.map((header, index) =>
    index === 2
      ? typeFilter === "lab"
        ? "Lab Test"
        : typeFilter === "service"
          ? "Service"
          : "Lab / Service"
      : header,
  );
  const exportTables: Record<string, { title: string; headers: string[]; rows: any[][] }> = {
    invoice: { title: "Invoice Profit Details", headers: invoiceHeaders, rows: invoiceExportRows },
    appointments: { title: "Doctor Fee & Profitability", headers: settlementHeaders, rows: settlementExportRows },
    lab: { title: labExportTitle, headers: labExportHeaders, rows: labSettlementExportRows },
    pharmacy: { title: "Pharmacy Settlement & Profitability", headers: pharmacySettlementHeaders, rows: pharmacySettlementExportRows },
    home_care: { title: "Home Care / Visit Invoice Report", headers: homeCareHeaders, rows: homeCareExportRows },
  };
  const activeExport = exportTables[section] || exportTables.invoice;
  const activeReportTitle =
    {
      invoice: "Invoice Profit Report",
      appointments: "Consultation Profit Report",
      lab: "Lab / Service Report",
      pharmacy: "Pharmacy Profit Report",
      home_care: "Home Care / Visit Profit Report",
    }[section] || "Healthcare Profit Report";
  const filterDescription = [
    `Period: ${fromDate || "-"} to ${toDate || "-"}`,
    `Doctor: ${
      doctorId === "all"
        ? "All doctors"
        : doctorById.get(doctorId) || publicDisplayValue(doctorId)
    }`,
    `Type: ${humanizeOptionLabel(typeFilter)}`,
    `Supplier: ${
      supplierFilter === "all"
        ? "All suppliers"
        : supplierFilter === "none"
          ? "In-house"
          : supplierById.get(supplierFilter) ||
            publicDisplayValue(supplierFilter)
    }`,
  ].join(" | ");
  const activeReportSection =
    section === "appointments"
      ? "consultation"
      : section === "lab"
        ? typeFilter === "service"
          ? "service"
          : "lab"
        : section === "pharmacy"
          ? "pharmacy"
          : section === "home_care"
            ? typeFilter === "home_visit"
              ? "home_visit"
              : "home_care"
            : typeFilter;

  function exportCsv() {
    const content = [
      activeReportTitle,
      tableToCsv(["Filters"], [[filterDescription]]),
      "",
      tableToCsv(["Metric", "Value"], activeSummaryRows),
      "",
      activeExport.title,
      tableToCsv(activeExport.headers, activeExport.rows),
    ].join("\n");
    downloadBlob(`${exportName}.csv`, "text/csv;charset=utf-8", `\uFEFF${content}`);
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
          <h1 style="font-family:Roboto,Arial,sans-serif;font-size:22px;font-weight:bold;color:#0f172a;margin:0 0 6px;">${activeReportTitle}</h1>
          <p style="font-family:Roboto,Arial,sans-serif;font-size:13px;color:#475569;margin:0 0 18px;">${htmlEscape(filterDescription)}</p>
          ${titledHtmlTable("Filtered Summary", ["Metric", "Value"], activeSummaryRows)}
          ${titledHtmlTable(activeExport.title, activeExport.headers, activeExport.rows)}
        </body>
      </html>
    `;
    downloadBlob(
      `${exportName}.xls`,
      "application/vnd.ms-excel;charset=utf-8",
      html,
    );
  }

  async function exportPdf() {
    const reportElement = document.createElement("div");
    reportElement.setAttribute("aria-hidden", "true");
    reportElement.style.cssText =
      "position:fixed;left:-100000px;top:0;width:1400px;padding:32px;background:#fff;color:#0f172a;font-family:Arial,sans-serif;";
    reportElement.innerHTML = `
      <h1 style="margin:0 0 8px;font-size:26px;">${activeReportTitle}</h1>
      <p style="margin:0 0 20px;color:#475569;">${htmlEscape(filterDescription)}</p>
      <h2 style="margin:0 0 8px;font-size:18px;">Filtered Summary</h2>
      ${htmlTable(["Metric", "Value"], activeSummaryRows)}
      <h2 style="margin:0 0 8px;font-size:18px;">${activeExport.title}</h2>
      ${htmlTable(activeExport.headers, activeExport.rows)}
    `;
    document.body.appendChild(reportElement);
    try {
      await document.fonts?.ready;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(reportElement, {
        backgroundColor: "#ffffff",
        scale: 1.5,
        useCORS: true,
        logging: false,
      });
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const imageWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;
      const imageData = canvas.toDataURL("image/png");
      let offset = 0;
      let page = 0;
      while (offset < imageHeight) {
        if (page > 0) pdf.addPage("a4", "landscape");
        pdf.addImage(
          imageData,
          "PNG",
          margin,
          margin - offset,
          imageWidth,
          imageHeight,
        );
        offset += printableHeight;
        page += 1;
      }
      pdf.save(`${exportName}.pdf`);
    } catch (error) {
      console.error("Could not generate report PDF", error);
      window.alert("Could not generate the PDF. Please try again.");
    } finally {
      reportElement.remove();
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
            onOpenInvoices={openLinkedInvoices}
          />
        );

      case "invoice":
        return (
          <InvoiceReport
            filteredInvoices={filteredInvoices}
            invoicePageRows={invoicePageRows}
            appointmentById={appointmentById}
            patientById={patientById}
            invoiceDoctorStaffName={invoiceDoctorStaffName}
            invoicePaymentMode={invoicePaymentMode}
            invoiceGrossProfit={invoiceGrossProfit}
            invoiceGrossProfitPercent={invoiceGrossProfitPercent}
            invoiceSettlementAmount={invoiceSettlementAmount}
            invoiceDoctorFeeAmount={invoiceDoctorFeeAmount}
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
            onOpenInvoices={openLinkedInvoices}
            loading={invoiceDetailsLoading}
          />
        );

      case "lab":
        return (
          <LabReports
            labSettlementRows={labSettlementRows}
            reportKind={typeFilter}
            openSections={openSections}
            setOpenSections={setOpenSections}
            money={money}
            onOpenInvoices={openLinkedInvoices}
            loading={labSettlementLoading}
          />
        );

      case "pharmacy":
        return (
          <PharmacyReports
            pharmacySettlementRows={pharmacySettlementRows}
            openSections={openSections}
            setOpenSections={setOpenSections}
            money={money}
            onOpenInvoices={openLinkedInvoices}
            loading={pharmacySettlementLoading}
          />
        );

      case "home_care":
        return (
          <HomeCareReports
            homeCareReportRows={homeCareReportRows}
            variant="combined"
            openSections={openSections}
            setOpenSections={setOpenSections}
            money={money}
            onOpenInvoices={openLinkedInvoices}
            loading={homeCareBookingsLoading || homeCareInvoiceDetailsLoading}
          />
        );

      case "metrix":
        return (
          <MetricsReport
            totals={dashboardMetrics?.totals || {}}
            previousTotals={dashboardMetrics?.previous_totals || {}}
            profitSummary={dashboardMetrics?.profit_summary || {}}
            previousProfitSummary={
              dashboardMetrics?.previous_profit_summary || {}
            }
            grossProfit={Number(dashboardMetrics?.gross_profit || 0)}
            finalProfit={Number(dashboardMetrics?.final_profit || 0)}
            previousFinalProfit={Number(
              dashboardMetrics?.previous_final_profit || 0,
            )}
            labSettlementSummary={
              dashboardMetrics?.lab_settlement_summary || {}
            }
            membershipClaimRows={
              dashboardMetrics?.membership_claim_rows || []
            }
            trendRows={dashboardMetrics?.trend_rows || []}
            loading={dashboardMetricsLoading}
            error={dashboardMetricsError}
            snapshots={monthlySnapshots}
            recalculatingSnapshotId={recalculatingSnapshotId}
            snapshotMessage={snapshotMessage}
            onRecalculateSnapshot={recalculateMonthlySnapshot}
            chartPeriod={metricsChartPeriod}
            customStart={metricsCustomStart}
            customEnd={metricsCustomEnd}
            onChartPeriodChange={changeMetricsChartPeriod}
            onCustomRangeChange={changeMetricsCustomRange}
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
      {section !== "metrix" && (
        <Header
          section={section}
          resultCount={
            section === "lab"
              ? labSettlementRows.length
              : section === "appointments"
                ? doctorRows.length
                : section === "pharmacy"
                  ? pharmacySettlementRows.length
                  : section === "home_care"
                    ? homeCareReportRows.length
                    : filteredInvoices.length
          }
          onRefresh={refreshReports}
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
          sendEmailReport={() =>
            sendEmailReport({
              reportTitle: activeReportTitle,
              tableTitle: activeExport.title,
              filterDescription,
              summaryHeaders: ["Metric", "Value"],
              summaryRows: activeSummaryRows,
              tableHeaders: activeExport.headers,
              tableRows: activeExport.rows,
              exportName,
              reportSection: activeReportSection,
            })
          }
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
      )}

      {section !== "metrix" && (
        <ReportTotals totals={reportCardTotals} money={money} section={section} />
      )}

      {/* DYNAMIC CONTENT */}
      {renderReportSection(section)}

      {invoicePickerIds.length > 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">
                  Select linked invoice
                </h3>
                <p className="text-sm text-slate-500">
                  This report row combines {invoicePickerIds.length} invoices.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
                onClick={() => setInvoicePickerIds([])}
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {invoicePickerIds.map((invoiceId) => {
                const invoice: any = invoiceById.get(invoiceId);
                return (
                  <button
                    key={invoiceId}
                    type="button"
                    className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
                    onClick={() => openInvoice(invoiceId)}
                  >
                    <span>
                      <span className="block font-bold text-slate-950">
                        {invoice?.invoice_number || publicDisplayValue(invoiceId)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {invoice ? invoicePaymentMode(invoice) : "-"}
                      </span>
                    </span>
                    <span className="text-right text-sm">
                      <span className="block font-bold">
                        {money(invoice ? reportedInvoiceTotal(invoice) : 0)}
                      </span>
                      <span className="text-xs text-slate-500">
                        Paid {money(invoice?.paid_amount || 0)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
