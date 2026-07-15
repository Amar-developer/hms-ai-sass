"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
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
  isEmail,
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
  allocatedReportValue,
  membershipBenefitUsage,
  realizedGrossProfit,
  recognizedInvoiceRevenue,
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
  setActive,
  loadLiveData,
}: any) {
  const [period, setPeriod] = useState("monthly");
  const [refreshTick, setRefreshTick] = useState(0);
  async function refreshReports() {
    if (loadLiveData && apiSession) await loadLiveData(apiSession);
    setRefreshTick((tick) => tick + 1);
  }
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
    homeCare: true,
  });
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePickerIds, setInvoicePickerIds] = useState<string[]>([]);
  const [monthlySnapshots, setMonthlySnapshots] = useState<any[]>([]);
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
  const [labTests, setLabTests] = useState<any[]>([]);
  const [labPackages, setLabPackages] = useState<any[]>([]);
  const [labOrderDetails, setLabOrderDetails] = useState<any[]>([]);
  const [medicineRows, setMedicineRows] = useState<any[]>([]);
  const [pharmacyIssueDetails, setPharmacyIssueDetails] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [invoiceDetails, setInvoiceDetails] = useState<any[]>([]);
  const [homeCareBookings, setHomeCareBookings] = useState<any[]>([]);
  const [homeCareInvoiceDetails, setHomeCareInvoiceDetails] = useState<any[]>(
    [],
  );
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
  const homeCareInvoiceIds = useMemo(
    () =>
      liveInvoices
        .filter((invoice: any) => invoice.home_care_booking_id)
        .map((invoice: any) => invoice.id)
        .filter(Boolean)
        .sort(),
    [liveInvoices],
  );
  const homeCareInvoiceIdsKey = homeCareInvoiceIds.join("|");
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

  const baseFilteredInvoices = liveInvoices.filter((invoice: any) => {
    const invoiceDate = rowDateKey(invoice);
    const appointment = appointmentById.get(invoice.appointment_id);
    const invoiceDoctorId =
      appointment?.doctorId ||
      appointment?.practitioner_id ||
      invoice.practitioner_id;
    const invoiceBranchId =
      invoice.branch_id || appointment?.branchId || appointment?.branch_id;
    const type = invoiceType(invoice);
    return (
      (!branchId || invoiceBranchId === branchId) &&
      (!fromDate || invoiceDate >= fromDate) &&
      (!toDate || invoiceDate <= toDate) &&
      (doctorId === "all" || invoiceDoctorId === doctorId) &&
      (typeFilter === "overall" || type === typeFilter)
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
  const invoiceById = useMemo(
    () => new Map<string, any>(liveInvoices.map((row: any) => [row.id, row])),
    [liveInvoices],
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
  const filteredInvoiceIdsKey = filteredInvoiceIds.join("|");

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

  useEffect(() => {
    if (!apiSession?.tenantId) return;
    let cancelled = false;
    apiFetch("/identity/users", apiSession)
      .then((rows) => {
        if (!cancelled) setUsers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiSession?.tenantId, refreshTick]);

  useEffect(() => {
    if (!apiSession?.tenantId || filteredInvoiceIds.length === 0) {
      setInvoiceDetails([]);
      return;
    }
    let cancelled = false;
    async function loadInvoiceDetails() {
      const details = await Promise.all(
        filteredInvoiceIds.map((invoiceId: string) =>
          apiFetch(`/billing/invoices/${invoiceId}`, apiSession).catch(
            () => null,
          ),
        ),
      );
      if (!cancelled) setInvoiceDetails(details.filter(Boolean));
    }
    loadInvoiceDetails();
    return () => {
      cancelled = true;
    };
  }, [apiSession?.tenantId, filteredInvoiceIdsKey, refreshTick]);

  useEffect(() => {
    if (!apiSession?.tenantId) return;
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
  }, [apiSession?.tenantId, liveInvoices.length, refreshTick]);

  // Closed-month income snapshots (frozen at month end). Branch-scoped to match
  // the live dashboard's branch filter; no branch = all-branches aggregate.
  useEffect(() => {
    if (!apiSession?.tenantId) {
      setMonthlySnapshots([]);
      return;
    }
    let cancelled = false;
    apiFetch(
      `/reports/monthly-snapshots${branchId ? `?branch_id=${branchId}` : ""}`,
      apiSession,
    )
      .then((rows: any) => {
        if (!cancelled) setMonthlySnapshots(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setMonthlySnapshots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiSession?.tenantId, branchId, refreshTick]);

  async function recalculateMonthlySnapshot(snapshot: any) {
    if (!apiSession?.tenantId || !snapshot) return;
    setSnapshotMessage("");
    setRecalculatingSnapshotId(snapshot.id);
    try {
      await apiFetch("/reports/monthly-snapshots/archive", apiSession, {
        method: "POST",
        body: JSON.stringify({
          year: snapshot.period_year,
          month: snapshot.period_month,
          overwrite: true,
        }),
      });
      setSnapshotMessage(`${snapshot.period_label} recalculated`);
      await refreshReports();
    } catch (error: any) {
      setSnapshotMessage(error?.message || "Recalculate failed");
    } finally {
      setRecalculatingSnapshotId(null);
    }
  }

  useEffect(() => {
    if (!apiSession?.tenantId) return;
    let cancelled = false;
    async function loadHomeCareBookings() {
      const rows = await apiFetch(
        `/home-care/bookings${branchId ? `?branch_id=${branchId}` : ""}`,
        apiSession,
      ).catch(() => []);
      if (!cancelled) setHomeCareBookings(Array.isArray(rows) ? rows : []);
    }
    loadHomeCareBookings();
    return () => {
      cancelled = true;
    };
  }, [apiSession?.tenantId, branchId, refreshTick]);

  useEffect(() => {
    if (!apiSession?.tenantId || homeCareInvoiceIds.length === 0) {
      setHomeCareInvoiceDetails([]);
      return;
    }
    let cancelled = false;
    async function loadHomeCareInvoiceDetails() {
      const details = await Promise.all(
        homeCareInvoiceIds.map((invoiceId: string) =>
          apiFetch(`/billing/invoices/${invoiceId}`, apiSession).catch(
            () => null,
          ),
        ),
      );
      if (!cancelled) setHomeCareInvoiceDetails(details.filter(Boolean));
    }
    loadHomeCareInvoiceDetails();
    return () => {
      cancelled = true;
    };
  }, [apiSession?.tenantId, homeCareInvoiceIdsKey, refreshTick]);

  useEffect(() => {
    if (!apiSession?.tenantId) return;
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
  }, [apiSession?.tenantId, liveInvoices.length, refreshTick]);

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

  const totals = aggregateInvoiceMetrics(
    filteredInvoices,
    homeVisitBookingIds,
    homeVisitInvoiceIds,
  );
  const membershipClaimRows = Object.values(totals.membershipClaims).sort(
    (a: any, b: any) => b.claimedAmount - a.claimedAmount,
  );

  const chargeableGrossRevenue = Math.max(
    totals.grossRevenue - totals.membershipDiscount,
    0,
  );
  const grossProfit = Math.max(chargeableGrossRevenue - totals.doctorFee, 0);
  const finalProfit = Math.max(totals.paidRevenue - totals.settlement, 0);

  // Previous calendar month aggregation, used only for the Metrics dashboard
  // month-over-month comparison lines. Branch-scoped but independent of the
  // active filters (the Metrics tab always reflects the current month).
  const previousTotals = useMemo(() => {
    const now = new Date();
    const startKey = toInputDate(
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
    );
    const endKey = toInputDate(new Date(now.getFullYear(), now.getMonth(), 0));
    const previousMonthInvoices = liveInvoices.filter((invoice: any) => {
      if (!isPaidInvoice(invoice)) return false;
      const appointment = appointmentById.get(invoice.appointment_id);
      const invoiceBranchId =
        invoice.branch_id || appointment?.branchId || appointment?.branch_id;
      if (branchId && invoiceBranchId !== branchId) return false;
      const invoiceDate = rowDateKey(invoice);
      return invoiceDate >= startKey && invoiceDate <= endKey;
    });
    return aggregateInvoiceMetrics(
      previousMonthInvoices,
      homeVisitBookingIds,
      homeVisitInvoiceIds,
    );
  }, [
    liveInvoices,
    branchId,
    appointmentById,
    homeVisitBookingIds,
    homeVisitInvoiceIds,
  ]);
  const previousFinalProfit = Math.max(
    previousTotals.paidRevenue - previousTotals.settlement,
    0,
  );
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
          balance: 0,
          doctorFee: 0,
          membershipBenefit: 0,
          settlement: 0,
          clinicFee: 0,
          finalProfit: 0,
        };
        const total = reportedInvoiceTotal(invoice);
        const paid = recognizedInvoiceRevenue(invoice);
        const doctorFee = numberValue(invoice.doctor_share_amount);
        const settlement = settlementPaidBasis(invoice);
        row.invoices += 1;
        row.invoiceIds.add(invoice.id);
        row.paymentModes.add(invoicePaymentMode(invoice));
        row.consultationIds.add(
          invoice.appointment_id || invoice.consultation_id || invoice.id,
        );
        row.grossRevenue += total;
        row.paidRevenue += paid;
        row.balance += numberValue(invoice.balance_amount);
        row.doctorFee += doctorFee;
        row.membershipBenefit += membershipBenefitUsage(invoice);
        row.settlement += settlement;
        row.clinicFee +=
          numberValue(invoice.clinic_share_amount) ||
          Math.max(total - membershipBenefitUsage(invoice) - doctorFee, 0);
        row.finalProfit += realizedGrossProfit(invoice, settlement);
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
        settlementPercent: percent(row.settlement, row.paidRevenue),
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
    row.membershipBenefit,
    row.paymentMode,
    row.settlement,
    row.settlementPercent,
    row.clinicFee,
    percent(row.finalProfit, row.paidRevenue),
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
            (sum: number, row: any) =>
              sum + numberValue(row.membershipBenefit),
            0,
          ),
          "Multiple",
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.settlement),
            0,
          ),
          percent(
            doctorRows.reduce(
              (sum: number, row: any) => sum + numberValue(row.settlement),
              0,
            ),
            totals.paidRevenue,
          ),
          doctorRows.reduce(
            (sum: number, row: any) => sum + numberValue(row.clinicFee),
            0,
          ),
          percent(grossProfit, chargeableGrossRevenue),
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
        for (const item of items) {
          if (item.package_id || !item.test_id) continue;
          const catalogItem = labTestById.get(item.test_id);
          const supplierId =
            item.supplier_id || catalogItem?.supplier_id || "none";
          const purchaseCost =
            supplierId === "none"
              ? 0
              : numberValue(item.buying_price || catalogItem?.purchase_price);
          const key = `${supplierId}:${item.test_name || item.id}`;
          const lineAmount = numberValue(item.price);
          const invoiceSubtotal = numberValue(invoice.subtotal_amount);
          const allocatedRevenue = allocatedReportValue(
            lineAmount,
            invoiceSubtotal,
            recognizedInvoiceRevenue(invoice),
          );
          const allocatedMembership = allocatedReportValue(
            lineAmount,
            invoiceSubtotal,
            membershipBenefitUsage(invoice),
          );
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
            purchaseCost: 0,
          };
          row.orders.add(invoice.lab_order_id);
          row.invoices.add(invoice.id);
          row.paymentModes.add(invoicePaymentMode(invoice));
          row.total += lineAmount;
          row.revenue += allocatedRevenue;
          row.balance += allocatedReportValue(
            lineAmount,
            invoiceSubtotal,
            numberValue(invoice.balance_amount),
          );
          row.membershipBenefit += allocatedMembership;
          row.purchaseCost += purchaseCost;
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
      paymentMode:
        Array.from(row.paymentModes)
          .filter((value: any) => value && value !== "-")
          .join(" + ") || "-",
      settlementPercent: percent(row.purchaseCost, row.revenue),
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
                unit_price: invoice.subtotal_amount,
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
          const invoiceSubtotal = numberValue(invoice.subtotal_amount);
          const allocatedRevenue = allocatedReportValue(
            revenue,
            invoiceSubtotal,
            recognizedInvoiceRevenue(invoice),
          );
          const allocatedMembership = allocatedReportValue(
            revenue,
            invoiceSubtotal,
            membershipBenefitUsage(invoice),
          );
          const purchaseCost = numberValue(medicine?.purchase_price) * quantity;
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
            purchaseCost: 0,
          };
          row.issues.add(invoice.pharmacy_issue_id);
          row.invoices.add(invoice.id);
          row.paymentModes.add(invoicePaymentMode(invoice));
          row.quantity += quantity;
          row.total += revenue;
          row.revenue += allocatedRevenue;
          row.balance += allocatedReportValue(
            revenue,
            invoiceSubtotal,
            numberValue(invoice.balance_amount),
          );
          row.membershipBenefit += allocatedMembership;
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
      paymentMode:
        Array.from(row.paymentModes)
          .filter((value: any) => value && value !== "-")
          .join(" + ") || "-",
      settlementPercent: percent(row.purchaseCost, row.revenue),
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
    row.membershipBenefit,
    row.paymentMode,
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
      row.membershipBenefit,
      row.paymentMode,
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
    profit: Math.max(labSettlementRevenue - labSettlementPurchaseCost, 0),
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
    return realizedGrossProfit(invoice, invoiceSettlementAmount(invoice));
  }

  function invoiceGrossProfitPercent(invoice: any) {
    return percent(
      invoiceGrossProfit(invoice),
      numberValue(invoice.paid_amount),
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
  const reportCardTotals = {
    grandTotal: sectionReportInvoices.reduce(
      (sum: number, invoice: any) => sum + reportedInvoiceTotal(invoice),
      0,
    ),
    invoiceCount: sectionReportInvoices.length,
    settlement: sectionPaidInvoices.reduce(
      (sum: number, invoice: any) => sum + invoiceSettlementAmount(invoice),
      0,
    ),
    due: sectionReportInvoices.reduce(
      (sum: number, invoice: any) => sum + numberValue(invoice.balance_amount),
      0,
    ),
    grossProfit: sectionPaidInvoices.reduce(
      (sum: number, invoice: any) => sum + invoiceGrossProfit(invoice),
      0,
    ),
    membershipBenefit: sectionReportInvoices.reduce(
      (sum: number, invoice: any) =>
        sum + membershipBenefitUsage(invoice),
      0,
    ),
  };

  const invoiceSettlementTotal = filteredInvoices.reduce(
    (sum: number, invoice: any) => sum + invoiceSettlementAmount(invoice),
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
      membershipBenefitUsage(invoice),
      invoicePaymentMode(invoice),
      settlement,
      percent(settlement, paid),
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
        membershipBenefit: membershipBenefitUsage(invoice),
        paymentMode: invoicePaymentMode(invoice),
        settlement: invoiceSettlementAmount(invoice),
        settlementPercent: percent(
          invoiceSettlementAmount(invoice),
          numberValue(invoice.paid_amount),
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
          totals.membershipDiscount,
          "",
          invoiceSettlementTotal,
          percent(invoiceSettlementTotal, totals.paidRevenue),
          invoiceClinicProfitTotal,
          percent(invoiceClinicProfitTotal, totals.paidRevenue),
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
    ["Consultation Revenue", totals.consultationRevenue],
    ["Lab Revenue", totals.labRevenue],
    ["Pharmacy Revenue", totals.pharmacyRevenue],
    ["Membership Purchases", totals.membershipPurchases],
    ["Membership Discounts Used", totals.membershipDiscount],
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
    ["Final Profit", invoiceClinicProfitTotal],
    ["Final Profit %", percent(invoiceClinicProfitTotal, totals.paidRevenue)],
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
          supplier_ids: emailLabSupplierIds.includes("all")
            ? []
            : emailLabSupplierIds,
          report_sections: emailReportSections,
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
          apiSession={apiSession}
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

      <ReportTotals totals={reportCardTotals} money={money} />

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
