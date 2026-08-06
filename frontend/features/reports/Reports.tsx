"use client";

import { useEffect, useMemo, useState } from "react";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import {
  numberValue,
  dateKey,
  normalized,
  isCompleted,
  currentRange,
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
  htmlTable,
  titledHtmlTable,
  parseEmailList,
  aggregateInvoiceMetrics,
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
  defaultEmailReportSections,
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
  useInvoiceDetailsBatch,
  useInvoiceDetailsBatchEffect,
  useLabSettlementData,
  useMonthlySnapshots,
  usePharmacySettlementData,
  useReportInvoices,
  useReportsActions,
  useReportsUsers,
} from "./api";

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
    const allocations = allocateReportValues(
      lines.map((line: any) => line.amount),
      numberValue(invoice.subtotal_amount),
      recognizedInvoiceRevenue(invoice),
    );
    return (
      sum +
      lines.reduce(
        (itemSum: number, line: any, index: number) =>
          itemSum + (line.isService ? allocations[index] || 0 : 0),
        0,
      )
    );
  }, 0);
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
  const [refreshTick, setRefreshTick] = useState(0);
  async function refreshReports() {
    if (loadLiveData && apiSession) await loadLiveData(apiSession);
    setRefreshTick((tick) => tick + 1);
  }
  const [rangeStart, rangeEnd] = currentRange(period);
  const [fromDate, setFromDate] = useState(rangeStart);
  const [toDate, setToDate] = useState(rangeEnd);
  const reportNow = new Date();
  const previousMonthStart = toInputDate(
    new Date(reportNow.getFullYear(), reportNow.getMonth() - 1, 1),
  );
  const previousMonthEnd = toInputDate(
    new Date(reportNow.getFullYear(), reportNow.getMonth(), 0),
  );
  const serverReportInvoices = useReportInvoices({
    apiSession,
    branchId,
    ranges: [
      [fromDate, toDate],
      [previousMonthStart, previousMonthEnd],
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
  const [emailReportSections, setEmailReportSections] = useState<string[]>(
    defaultEmailReportSections,
  );
  const [emailLabSupplierIds, setEmailLabSupplierIds] = useState<string[]>([
    "all",
  ]);
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
    emailLabSupplierIds,
    emailReportSections,
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
        return items.some((item: any) => Boolean(item.package_id));
      }
      return (
        items.length === 0 ||
        items.some((item: any) => !item.package_id && item.test_id)
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
  const reportInvoices = baseFilteredInvoices.filter(invoiceMatchesSupplier);
  const filteredInvoices = reportInvoices.filter(isPaidInvoice);

  const totalInvoicePages = Math.max(
    1,
    Math.ceil(filteredInvoices.length / pageSize),
  );

  const safeInvoicePage = Math.min(invoicePage, totalInvoicePages);

  const invoicePageRows = filteredInvoices.slice(
    (safeInvoicePage - 1) * pageSize,
    safeInvoicePage * pageSize,
  );
  const filteredInvoiceIds = useMemo(
    () => baseFilteredInvoices.map((invoice: any) => invoice.id).filter(Boolean),
    [baseFilteredInvoices],
  );
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
  }, [fromDate, toDate, doctorId, typeFilter, supplierFilter, branchId]);

  // The Metrics tab hides the shared filter/export header and always shows a
  // current-month snapshot, so reset the range/filters to this month on entry.
  useEffect(() => {
    if (section !== "metrix") return;
    const [start, end] = currentRange("monthly");
    setPeriod("monthly");
    setFromDate(start);
    setToDate(end);
    setDoctorId("all");
    setTypeFilter("overall");
    setSupplierFilter("all");
  }, [section]);

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
  };
  const membershipClaimRows = Object.values(totals.membershipClaims).sort(
    (a: any, b: any) => b.claimedAmount - a.claimedAmount,
  );

  const chargeableGrossRevenue = Math.max(
    totals.grossRevenue - totals.membershipDiscount,
    0,
  );
  const grossProfit =
    chargeableGrossRevenue - totals.tax - totals.doctorFee - totals.settlement;
  const finalProfit =
    totals.paidRevenue - totals.paidTax - totals.doctorFee - totals.settlement;

  // Previous calendar month aggregation, used only for the Metrics dashboard
  // month-over-month comparison lines. Branch-scoped but independent of the
  // active filters (the Metrics tab always reflects the current month).
  const previousTotals = useMemo(() => {
    const now = new Date();
    const startKey = toInputDate(
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
    );
    const endKey = toInputDate(new Date(now.getFullYear(), now.getMonth(), 0));
    const previousMonthInvoices = reportInvoiceRows.filter((invoice: any) => {
      if (!isPaidInvoice(invoice)) return false;
      const appointment = appointmentById.get(invoice.appointment_id);
      const invoiceBranchId =
        invoice.branch_id || appointment?.branchId || appointment?.branch_id;
      if (branchId && invoiceBranchId !== branchId) return false;
      const invoiceDate = rowDateKey(invoice);
      return invoiceDate >= startKey && invoiceDate <= endKey;
    });
    return {
      ...aggregateInvoiceMetrics(
        previousMonthInvoices,
        homeVisitBookingIds,
        homeVisitInvoiceIds,
        invoiceSettlementAmount,
      ),
      serviceRevenue: serviceCategoryRevenue(
        previousMonthInvoices,
        labOrderDetailById,
        labPackageById,
      ),
    };
  }, [
    reportInvoiceRows,
    branchId,
    appointmentById,
    homeVisitBookingIds,
    homeVisitInvoiceIds,
    labOrderDetailById,
    labPackageById,
  ]);
  const previousFinalProfit =
    previousTotals.paidRevenue -
    previousTotals.paidTax -
    previousTotals.doctorFee -
    previousTotals.settlement;
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
        row.balance += numberValue(invoice.balance_amount);
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

  const settlementRows = doctorRows.map((row: any) => [
    row.doctor,
    row.consultations,
    row.invoices,
    row.grossRevenue,
    row.paidRevenue,
    row.balance,
    row.approvedDiscount,
    row.offerDiscount,
    row.membershipBenefit,
    row.billingDiscount,
    row.paymentMode,
    row.paidTax,
    row.doctorFee,
    row.doctorFeePercent,
    row.clinicFee,
    percent(
      row.finalProfit,
      row.paidRevenue - row.paidTax,
      row.grossRevenue,
    ),
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
            (sum: number, row: any) => sum + numberValue(row.balance),
            0,
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.approvedDiscount),
            0,
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.offerDiscount),
            0,
          ),
          doctorRows.reduce(
            (sum: number, row: any) =>
              sum + numberValue(row.membershipBenefit),
            0,
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.billingDiscount),
            0,
          ),
          "Multiple",
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.paidTax),
            0,
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.doctorFee),
            0,
          ),
          percent(
            doctorRows.reduce(
              (sum: number, row: any) => sum + numberValue(row.doctorFee),
              0,
            ),
            doctorRows.reduce(
              (sum: number, row: any) =>
                sum + numberValue(row.paidRevenue) - numberValue(row.paidTax),
              0,
            ),
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.clinicFee),
            0,
          ),
          percent(
            doctorRows.reduce(
              (sum: number, row: any) => sum + numberValue(row.finalProfit),
              0,
            ),
            doctorRows.reduce(
              (sum: number, row: any) =>
                sum + numberValue(row.paidRevenue) - numberValue(row.paidTax),
              0,
            ),
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.finalProfit),
            0,
          ),
        ],
      ]
    : settlementRows;

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
        const reportItems = items.flatMap((item: any) => {
          if (!item.package_id) return item.test_id ? [item] : [];
          if (seenPackageIds.has(item.package_id)) return [];
          seenPackageIds.add(item.package_id);
          const service: any = labPackageById.get(item.package_id);
          return [
            {
              ...item,
              test_id: null,
              test_name: service?.name || item.test_name || "Service package",
              price: numberValue(service?.package_price),
              mrp_price: numberValue(service?.mrp_price),
              buying_price: numberValue(service?.purchase_price),
              supplier_id: service?.supplier_id || item.supplier_id,
            },
          ];
        });
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
          numberValue(invoice.balance_amount),
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
          numberValue(invoice.balance_amount),
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

  const labSettlementExportRows = labSettlementRows.map((row: any) => [
    row.supplier,
    row.item,
    row.orderCount,
    row.invoiceCount,
    row.total,
    row.revenue,
    row.balance,
    row.approvedDiscount,
    row.offerDiscount,
    row.membershipBenefit,
    row.billingDiscount,
    row.paymentMode,
    row.tax,
    row.purchaseCost,
    row.settlementPercent,
    row.profit,
  ]);

  const pharmacySettlementExportRows = pharmacySettlementRows.map(
    (row: any) => [
      row.supplier,
      row.item,
      row.issueCount,
      row.invoiceCount,
      row.quantity,
      row.total,
      row.revenue,
      row.balance,
      row.approvedDiscount,
      row.offerDiscount,
      row.membershipBenefit,
      row.billingDiscount,
      row.paymentMode,
      row.tax,
      row.purchaseCost,
      row.settlementPercent,
      row.profit,
    ],
  );
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
      return items.reduce((sum: number, item: any) => {
        if (item.package_id || !item.test_id) return sum;
        const catalogItem = labTestById.get(item.test_id);
        const supplierId = item.supplier_id || catalogItem?.supplier_id;
        if (!supplierId) return sum;
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

  const activeReportInvoices = reportInvoices.filter(
    (invoice: any) =>
      !["cancelled", "refunded"].includes(
        String(invoice.status || "").toLowerCase(),
      ),
  );
  const sectionReportInvoices = activeReportInvoices.filter((invoice: any) => {
    const type = invoiceType(invoice);
    if (section === "lab") return type === "lab";
    if (section === "pharmacy") return type === "pharmacy";
    if (section === "home_care") return type === "home_care";
    if (section === "appointments") return type === "consultation";
    return true;
  });
  const sectionPaidInvoices = sectionReportInvoices.filter(isPaidInvoice);
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
      (sum: number, invoice: any) => sum + numberValue(invoice.balance_amount),
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

  const invoiceRows = filteredInvoices.map((invoice: any) => {
    const patient: any = patientById.get(invoice.patient_id);
    const settlement = invoiceSettlementAmount(invoice);
    const paid = numberValue(invoice.paid_amount);
    return [
      invoice.invoice_number,
      rowDate(invoice),
      invoiceTypeLabel(invoiceType(invoice)),
      patient?.name ||
        patient?.full_name ||
        invoice.patient_name ||
        publicDisplayValue(invoice.patient_id),
      invoiceDoctorStaffName(invoice),
      humanizeOptionLabel(invoice.status),
      reportedInvoiceTotal(invoice),
      paid,
      numberValue(invoice.balance_amount),
      approvedDiscountUsage(invoice),
      offerDiscountUsage(invoice),
      membershipBenefitUsage(invoice),
      invoicePaymentMode(invoice),
      recognizedInvoiceTax(invoice),
      invoiceDoctorFeeAmount(invoice),
      settlement,
      invoiceGrossProfit(invoice),
      invoiceGrossProfitPercent(invoice),
    ];
  });
  const homeCareReportRows = filteredInvoices
    .filter((invoice: any) => invoiceType(invoice) === "home_care")
    .map((invoice: any) => {
      const patient: any = patientById.get(invoice.patient_id);
      const isHomeVisit =
        homeVisitInvoiceIds.has(invoice.id) ||
        homeVisitBookingIds.has(invoice.home_care_booking_id);
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
        staff: invoiceDoctorStaffName(invoice),
        invoiceIds: new Set([invoice.id]),
        totalAmount: reportedInvoiceTotal(invoice),
        paidAmount: numberValue(invoice.paid_amount),
        balance: numberValue(invoice.balance_amount),
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
          totals.approvedDiscount,
          totals.offerDiscount,
          totals.membershipDiscount,
          totals.billingDiscount,
          "",
          totals.paidTax,
          invoiceDoctorFeeTotal,
          invoiceSettlementTotal,
          percent(invoiceSettlementTotal, totals.paidRevenue),
          invoiceClinicProfitTotal,
          percent(
            invoiceClinicProfitTotal,
            totals.paidRevenue - totals.paidTax,
          ),
        ],
      ]
    : invoiceRows;
  const reportedConsultationIds = new Set(
    completedAppointments.map(
      (appointment: any) => appointment.id || appointment.appointment_id,
    ),
  );
  consultationSettlementInvoices.forEach((invoice: any) =>
    reportedConsultationIds.add(
      invoice.appointment_id || invoice.consultation_id || invoice.id,
    ),
  );
  reportedConsultationIds.delete(undefined);

  const summaryRows = [
    ["Gross Revenue", totals.grossRevenue],
    ["Paid Revenue", totals.paidRevenue],
    ["GST from Paid Revenue", totals.paidTax],
    ["Consultation Revenue", totals.consultationRevenue],
    ["Lab Revenue", totals.labRevenue],
    ["Pharmacy Revenue", totals.pharmacyRevenue],
    ["Membership Purchases", totals.membershipPurchases],
    ["Membership Discounts Used", totals.membershipDiscount],
    ["Admin Approved Discounts", totals.approvedDiscount],
    ["Offer Discounts", totals.offerDiscount],
    ["Total Billing Discounts", totals.billingDiscount],
    ...membershipClaimRows.map((row: any) => [
      `Membership Claimed - ${row.label}`,
      row.claimedAmount,
    ]),
    ["Balance", totals.balance],
    ["Doctor Fee", totals.doctorFee],
    ["Settlement", invoiceSettlementTotal],
    ["Clinic Fee", totals.clinicFee],
    ["Gross Profit", grossProfit],
    ["Gross Profit %", percent(grossProfit, chargeableGrossRevenue)],
    ["Final Profit", finalProfit],
    ["Final Profit %", percent(finalProfit, totals.paidRevenue)],
    ["Completed Consultations", reportedConsultationIds.size],
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
            totals={totals}
            previousTotals={previousTotals}
            grossProfit={grossProfit}
            finalProfit={finalProfit}
            previousFinalProfit={previousFinalProfit}
            labSettlementSummary={labSettlementSummary}
            membershipClaimRows={membershipClaimRows}
            snapshots={monthlySnapshots}
            recalculatingSnapshotId={recalculatingSnapshotId}
            snapshotMessage={snapshotMessage}
            onRecalculateSnapshot={recalculateMonthlySnapshot}
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
          emailReportSections={emailReportSections}
          setEmailReportSections={setEmailReportSections}
          emailLabSupplierIds={emailLabSupplierIds}
          setEmailLabSupplierIds={setEmailLabSupplierIds}
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
