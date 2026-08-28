"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Ban,
  Clock3,
  FileCheck2,
  FlaskConical,
  PlusCircle,
  TestTube2,
  Trash2,
} from "lucide-react";
import { newSegment } from "@/lib/routeSlugs";
import {
  ActionButton,
  Button,
  Card,
  RefreshButton,
  StatusToast,
} from "@/app/components/common/ui";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import { displayDateTime, formatPrice, money } from "@/utils/helper";
import { pageSize } from "./constants";
import {
  downloadBlob,
  invoicedLabOrderIds,
  isCancelled,
  splitList,
} from "@/features/lab/helpers";
import { ConsultReferralModal } from "./components/ConsultReferralModal";
import { WorklistDetailModal } from "./components/WorklistDetailModal";
import { Pagination } from "@/app/components/common/Pagination";
import { LabOrderForm } from "@/features/lab/forms/LabForms";
import type { LabOrderSummary } from "@/lib/contracts";
import { canCopyDatabaseIds } from "@/app/components/common/CopyIdButton";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";
import { AdaptiveFilterTrigger } from "@/app/components/common/AdaptiveFilterTrigger";
import { AdaptiveSortTrigger } from "@/app/components/common/AdaptiveSortTrigger";
import { AdaptiveResultCount } from "@/app/components/common/AdaptiveResultCount";
import { BreadcrumbSlot } from "@/features/shell/AppShell";
import {
  useLabActions,
  useLabAvailableTestSearch,
  useLabWorkspaceData,
} from "./api";
import { listOrderFilterOptions, listOrderPage } from "./api/lab.api";
import { DataTable } from "@/app/components/common/DataTable";
import { getLabColumns } from "./Column";
import { getLabTableSchema, getLabQueryFields } from "./filterSchema";
import { type QueryFieldOption, type QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";
import { displayDocumentNumber } from "@/lib/documentNumbers";

const MAX_REPORT_DOCUMENTS = 5;
const LAB_STATUS_TAB_ID = "lab-worklist-status-tab";

const labStatusTabs = [
  { id: "all", label: "All Orders", icon: FlaskConical },
  { id: "ordered", label: "Ordered", icon: Clock3 },
  { id: "sample_collected", label: "Sample Collected", icon: TestTube2 },
  { id: "result_ready", label: "Result Ready", icon: FileCheck2 },
  { id: "report_delivered", label: "Delivered", icon: BadgeCheck },
  { id: "cancelled", label: "Cancelled", icon: Ban },
];

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const format = (date: Date) =>
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  return { fromDate: format(from), toDate: format(to) };
}

function pickReportFile(onPick: (file: File) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,image/*";
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) onPick(file);
  };
  input.click();
}

export function Lab({
  apiSession,
  branchId,
  appointments,
  loadLiveData,
  setActive,
  numberingRules,
  onConsultationPendingCountChange,
  workspaceMode = "direct",
  view = "list",
}: any) {
  const router = useRouter();
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const {
    orders,
    ordersLoaded,
    consultationReferrals,
    tests,
    packages,
    suppliers,
    templates,
    reportDocuments,
    setReportDocuments,
    loadError,
    load,
  } = useLabWorkspaceData({ apiSession });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [selectedAvailableTestId, setSelectedAvailableTestId] = useState("");
  const { availableTests, testLoading } = useLabAvailableTestSearch({
    apiSession,
    testSearch,
  });
  const [orderTests, setOrderTests] = useState<any[]>([]);
  const [dismissedConsultations, setDismissedConsultations] = useState<
    string[]
  >(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(
        localStorage.getItem("medizinhub.labDismissedConsultations") || "[]",
      );
    } catch {
      return [];
    }
  });
  const [replaceDocPicker, setReplaceDocPicker] = useState<{
    order: any;
    docs: any[];
  } | null>(null);
  const [localInvoicedOrderIds, setLocalInvoicedOrderIds] = useState<string[]>(
    [],
  );
  const [localInvoiceIdsByOrder, setLocalInvoiceIdsByOrder] = useState<
    Record<string, string>
  >({});
  const [selectedOrder, setSelectedOrder] = useState<LabOrderSummary | null>(
    null,
  );
  const [viewConsult, setViewConsult] = useState<any>(null);
  const [consultDetail, setConsultDetail] = useState<any>(null);
  const [removeDocPicker, setRemoveDocPicker] = useState<{
    order: any;
    docs: any[];
  } | null>(null);

  function handleRemoveDocument(order: any) {
    const docs = reportDocuments[order.id] || [];
    if (docs.length === 0) return;

    if (docs.length === 1) {
      // Single document → remove directly
      removeReportDocument(order, docs[0]);
      return;
    }

    // Multiple documents → show picker
    setRemoveDocPicker({ order, docs });
  }
  const userPermissions = apiSession?.user?.permissions || [];
  const hasPermission = (...keys: string[]) =>
    Boolean(
      apiSession?.user?.is_super_admin ||
      userPermissions.includes("*") ||
      keys.some((key) => userPermissions.includes(key)),
    );

  const canCreateLabOrder = hasPermission("lab.manage", "lab.create");
  const canEditLabOrder = hasPermission("lab.manage", "lab.edit");
  const canBillLabOrder = hasPermission(
    "billing.manage",
    "billing.create",
    "invoices.create",
    "lab.manage",
    "lab.edit",
  );

  const [loadingDetail, setLoadingDetail] = useState(false);
  const [page, setPage] = useState(1);
  const [worklistQuery, setWorklistQuery] = useState("");
  const [worklistSort, setWorklistSort] = useState<SortState | null>({
    key: "updated_at",
    dir: "desc",
  });
  const [worklistQueryFilters, setWorklistQueryFilters] = useState<
    QueryFilterRow[]
  >([]);
  const [labOrderRows, setLabOrderRows] = useState<LabOrderSummary[]>([]);
  const [labOrderTotal, setLabOrderTotal] = useState(0);
  const [labOrderLoading, setLabOrderLoading] = useState(false);
  const [labSummaryRows, setLabSummaryRows] = useState<LabOrderSummary[]>([]);
  const [labSummaryTotal, setLabSummaryTotal] = useState(0);
  const [labTabCountRows, setLabTabCountRows] = useState<LabOrderSummary[]>([]);
  const [labTabCountTotal, setLabTabCountTotal] = useState(0);
  const [filterOptions, setFilterOptions] = useState<
    Record<string, QueryFieldOption[]>
  >({});
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [worklistFromDate, setWorklistFromDate] = useState("");
  const [worklistToDate, setWorklistToDate] = useState("");

  const orderedConsultationIds = useMemo(
    () =>
      new Set(
        orders.map((order: any) => order.consultation_id).filter(Boolean),
      ),
    [orders],
  );

  const labReady = useMemo(() => {
    if (!ordersLoaded) return [];
    return (
      consultationReferrals.length
        ? consultationReferrals.map((row: any) => ({
            id: row.appointment_id || row.id,
            consultationId: row.consultation_id,
            consultationStatus: row.status,
            labReferralText: row.lab_referral_text,
            appointmentNumber: row.appointment_number || "",
            appointment_number: row.appointment_number || "",
            token: row.token_number || "",
            tokenType: "Normal",
            patient: row.patient_name || row.patient_id,
            doctor: row.practitioner_name || "Unassigned",
            referrals: row.referrals || [],
            referralDate: row.signed_at || row.created_at,
          }))
        : appointments
    ).filter(
      (a: any) =>
        a.consultationId &&
        a.consultationStatus === "signed" &&
        String(a.labReferralText || "").trim() &&
        !orderedConsultationIds.has(a.consultationId),
    );
  }, [
    appointments,
    consultationReferrals,
    orderedConsultationIds,
    ordersLoaded,
  ]);
  const visibleConsultationReferrals = useMemo(
    () =>
      labReady.filter(
        (a: any) => !dismissedConsultations.includes(a.consultationId),
      ),
    [labReady, dismissedConsultations],
  );

  useEffect(() => {
    if (workspaceMode !== "consultation") return;
    onConsultationPendingCountChange?.(visibleConsultationReferrals.length);
  }, [
    workspaceMode,
    visibleConsultationReferrals.length,
    onConsultationPendingCountChange,
  ]);

  const { patients, patientMap } = usePatientReferencesQuery(
    apiSession,
    orders.map((o: any) => o.patient_id),
  );

  const worklistSourceOptions = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o: any) => {
      const source = o.acquisition_source || o.source;
      if (source) set.add(String(source));
    });
    return [
      { value: "all", label: "All Sources" },
      ...Array.from(set).map((source) => ({
        value: source,
        label: humanizeOptionLabel(source),
      })),
    ];
  }, [orders]);

  const worklistStatusOptions = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o: any) => {
      if (o.status) set.add(String(o.status));
    });
    return [
      { value: "all", label: "All Status" },
      ...Array.from(set).map((status) => ({
        value: status,
        label: humanizeOptionLabel(status),
      })),
    ];
  }, [orders]);

  const labSchema = getLabTableSchema();
  const labQueryFields = useMemo(
    () =>
      getLabQueryFields({
        sourceOptions: worklistSourceOptions,
        statusOptions: worklistStatusOptions,
        rows: labOrderRows,
        filterOptions,
      }),
    [worklistSourceOptions, worklistStatusOptions, labOrderRows, filterOptions],
  );

  async function loadLabOrderPage(nextPage = page) {
    if (!apiSession) return;
    setLabOrderLoading(true);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((nextPage - 1) * pageSize),
    });
    if (branchId) params.set("branch_id", branchId);
    if (worklistQuery.trim()) params.set("q", worklistQuery.trim());
    if (worklistFromDate) params.set("from_date", worklistFromDate);
    if (worklistToDate) params.set("to_date", worklistToDate);
    const filters = [...worklistQueryFilters];
    if (amountMin.trim()) {
      filters.push({
        id: "amount-min",
        field: "amount",
        operator: "gte",
        value: amountMin.trim(),
      });
    }
    if (amountMax.trim()) {
      filters.push({
        id: "amount-max",
        field: "amount",
        operator: "lte",
        value: amountMax.trim(),
      });
    }
    if (filters.length) params.set("filters", JSON.stringify(filters));
    if (worklistSort) params.set("sort", JSON.stringify(worklistSort));
    try {
      const result = await listOrderPage(apiSession, params);
      setLabOrderRows(result?.items || []);
      setLabOrderTotal(Number(result?.total || 0));
    } catch (err: any) {
      setMessage(err.message || "Could not load lab orders.");
    } finally {
      setLabOrderLoading(false);
    }
  }

  function buildLabSummaryParams(offset: number) {
    const params = new URLSearchParams({
      limit: "100",
      offset: String(offset),
    });
    if (branchId) params.set("branch_id", branchId);
    if (worklistQuery.trim()) params.set("q", worklistQuery.trim());

    const hasActiveFilters = Boolean(
      worklistQuery.trim() ||
        worklistQueryFilters.length ||
        amountMin.trim() ||
        amountMax.trim() ||
        worklistFromDate ||
        worklistToDate,
    );
    const defaultMonth = currentMonthRange();
    const fromDate = hasActiveFilters ? worklistFromDate : defaultMonth.fromDate;
    const toDate = hasActiveFilters ? worklistToDate : defaultMonth.toDate;
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);

    const filters = [...worklistQueryFilters];
    if (amountMin.trim()) {
      filters.push({
        id: "amount-min",
        field: "amount",
        operator: "gte",
        value: amountMin.trim(),
      });
    }
    if (amountMax.trim()) {
      filters.push({
        id: "amount-max",
        field: "amount",
        operator: "lte",
        value: amountMax.trim(),
      });
    }
    if (filters.length) params.set("filters", JSON.stringify(filters));
    return params;
  }

  function buildLabTabCountParams(offset: number) {
    const params = new URLSearchParams({
      limit: "100",
      offset: String(offset),
    });
    if (branchId) params.set("branch_id", branchId);
    if (worklistQuery.trim()) params.set("q", worklistQuery.trim());
    if (worklistFromDate) params.set("from_date", worklistFromDate);
    if (worklistToDate) params.set("to_date", worklistToDate);

    const filters = worklistQueryFilters.filter(
      (row) => row.id !== LAB_STATUS_TAB_ID,
    );
    if (amountMin.trim()) {
      filters.push({
        id: "amount-min",
        field: "amount",
        operator: "gte",
        value: amountMin.trim(),
      });
    }
    if (amountMax.trim()) {
      filters.push({
        id: "amount-max",
        field: "amount",
        operator: "lte",
        value: amountMax.trim(),
      });
    }
    if (filters.length) params.set("filters", JSON.stringify(filters));
    return params;
  }

  async function loadLabSummary() {
    if (!apiSession) return;
    try {
      const first = await listOrderPage(apiSession, buildLabSummaryParams(0));
      const total = Number(first?.total || 0);
      const rows = Array.isArray(first?.items) ? [...first.items] : [];
      for (let offset = rows.length; offset < total; offset += 100) {
        const next = await listOrderPage(
          apiSession,
          buildLabSummaryParams(offset),
        );
        rows.push(...(Array.isArray(next?.items) ? next.items : []));
      }
      setLabSummaryRows(rows);
      setLabSummaryTotal(total);
    } catch {
      setLabSummaryRows([]);
      setLabSummaryTotal(0);
    }
  }

  async function loadLabTabCounts() {
    if (!apiSession) return;
    try {
      const first = await listOrderPage(apiSession, buildLabTabCountParams(0));
      const total = Number(first?.total || 0);
      const rows = Array.isArray(first?.items) ? [...first.items] : [];
      for (let offset = rows.length; offset < total; offset += 100) {
        const next = await listOrderPage(
          apiSession,
          buildLabTabCountParams(offset),
        );
        rows.push(...(Array.isArray(next?.items) ? next.items : []));
      }
      setLabTabCountRows(rows);
      setLabTabCountTotal(total);
    } catch {
      setLabTabCountRows([]);
      setLabTabCountTotal(0);
    }
  }

  async function loadLabFilterOptions() {
    if (!apiSession) return;
    const params = new URLSearchParams();
    if (branchId) params.set("branch_id", branchId);
    const result = await listOrderFilterOptions(apiSession, params).catch(
      () => ({}),
    );
    setFilterOptions(result || {});
  }

  const totalPages = Math.max(1, Math.ceil(labOrderTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const labPageRows = labOrderRows;
  const activeLabStatus =
    worklistQueryFilters.find((row) => row.id === LAB_STATUS_TAB_ID)?.value ||
    "all";
  const labStatusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    labTabCountRows.forEach((order: any) => {
      const status = String(order.status || "");
      if (status) counts.set(status, (counts.get(status) || 0) + 1);
    });
    return counts;
  }, [labTabCountRows]);
  const labSummaryAmount = useMemo(
    () =>
      labSummaryRows.reduce(
        (total: number, order: any) => total + Number(order.amount || 0),
        0,
      ),
    [labSummaryRows],
  );
  const labUploadedReports = useMemo(
    () =>
      labSummaryRows.filter((order: any) => (reportDocuments[order.id] || []).length > 0)
        .length,
    [labSummaryRows, reportDocuments],
  );

  function selectLabStatus(status: string) {
    const otherFilters = worklistQueryFilters.filter(
      (row) => row.id !== LAB_STATUS_TAB_ID,
    );
    setWorklistQueryFilters(
      status === "all"
        ? otherFilters
        : [
            ...otherFilters,
            {
              id: LAB_STATUS_TAB_ID,
              field: "status",
              operator: "equals",
              value: status,
            },
          ],
    );
    setPage(1);
  }

  const invoicedOrderIds = useMemo(
    () => new Set([...invoicedLabOrderIds(orders), ...localInvoicedOrderIds]),
    [orders, localInvoicedOrderIds],
  );
  const invoiceIdsByOrder = useMemo(() => {
    const rows: Record<string, string> = { ...localInvoiceIdsByOrder };
    orders.forEach((order: any) => {
      if (order?.id && order?.billing_invoice_id) {
        rows[order.id] = order.billing_invoice_id;
      }
    });
    return rows;
  }, [orders, localInvoiceIdsByOrder]);

  useEffect(() => {
    const serverOrderIds = new Set(invoicedLabOrderIds(orders));
    if (!serverOrderIds.size) return;
    setLocalInvoicedOrderIds((ids) =>
      ids.filter((orderId) => !serverOrderIds.has(orderId)),
    );
  }, [orders]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    setPage(1);
  }, [
    worklistQuery,
    worklistQueryFilters,
    worklistSort,
    amountMin,
    amountMax,
    worklistFromDate,
    worklistToDate,
  ]);

  useEffect(() => {
    if (!apiSession) return;
    const timer = window.setTimeout(() => {
      void loadLabOrderPage(page);
      void loadLabSummary();
      void loadLabTabCounts();
      void loadLabFilterOptions();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    apiSession?.tenantId,
    branchId,
    page,
    worklistQuery,
    worklistQueryFilters,
    worklistSort,
    amountMin,
    amountMax,
    worklistFromDate,
    worklistToDate,
  ]);

  function resetWorklistFilters() {
    setWorklistQuery("");
    setWorklistQueryFilters([]);
    setWorklistSort(null);
    setAmountMin("");
    setAmountMax("");
    setWorklistFromDate("");
    setWorklistToDate("");
    setPage(1);
  }

  function refreshLabWorkspace() {
    void load();
    void loadLabOrderPage(page);
    void loadLabSummary();
    void loadLabTabCounts();
    void loadLabFilterOptions();
  }

  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem(
        "medizinhub.labDismissedConsultations",
        JSON.stringify(dismissedConsultations),
      );
  }, [dismissedConsultations]);

  useEffect(() => {
    if (loadError) setMessage(loadError);
  }, [loadError]);

  const localAvailableTests = useMemo(
    () => [
      ...tests.map((row: any) => ({
        ...row,
        item_name: row.name,
        slug: row.code || row.id,
        source: "local",
        item_type: "lab_test",
        kind: "Lab Test",
        category: "Lab Test",
        selling_price: row.default_price,
        price: row.default_price,
        buying_price: row.purchase_price,
        supplier_id: row.supplier_id,
      })),
      ...packages.map((row: any) => ({
        ...row,
        item_name: row.name,
        slug: row.code || row.id,
        source: "local",
        item_type: "lab_package",
        kind: "Service",
        category: "Service",
        selling_price: row.package_price,
        price: row.package_price,
        buying_price: row.purchase_price,
        supplier_id: row.supplier_id,
      })),
    ],
    [tests, packages],
  );
  const activeAvailableTests = useMemo(() => {
    const byKey = new Map<string, any>();
    [...localAvailableTests, ...availableTests].forEach((row: any) => {
      const key = String(row.id || row.slug || row.name || "").trim();
      if (key) byKey.set(key, row);
    });
    return Array.from(byKey.values());
  }, [availableTests, localAvailableTests]);

  const testOptions = activeAvailableTests.map((t: any) => ({
    value: t.id || t.slug || t.name,
    label: t.item_name || t.name,
    item: t,
  }));
  const selectedAvailableTest = activeAvailableTests.find(
    (t: any) => (t.id || t.slug || t.name) === selectedAvailableTestId,
  );
  const selectedTestMrp = Number(
    selectedAvailableTest?.mrp_price || selectedAvailableTest?.mrp || 0,
  );
  const selectedTestSelling = Number(
    selectedAvailableTest?.selling_price ||
      selectedAvailableTest?.default_price ||
      selectedAvailableTest?.price ||
      0,
  );
  const supplierById = useMemo(
    () =>
      new Map(suppliers.map((supplier: any) => [supplier.id, supplier.name])),
    [suppliers],
  );
  const selectedSupplierId = selectedAvailableTest?.supplier_id || "";
  const selectedSupplierName = selectedSupplierId
    ? supplierById.get(selectedSupplierId) || selectedSupplierId
    : "-";
  const selectedSupplierPrice = Number(
    selectedAvailableTest?.buying_price ||
      selectedAvailableTest?.purchase_price ||
      0,
  );

  const {
    handleCreateOrder,
    createFromConsultation,
    collectSample,
    updateStatus,
    addReportDocument,
    replaceReportDocument,
    releaseResult,
    sendReport,
    openReport,
    generateInvoice,
    loadConsultDetail,
    removeReportDocument,
  } = useLabActions({
    apiSession,
    branchId,
    loadLiveData,
    templates,
    orderTests,
    reportDocuments,
    setReportDocuments,
    setBusy,
    setMessage,
    setOrderTests,
    setSelectedAvailableTestId,
    setTestSearch,
    setLocalInvoicedOrderIds,
    setLocalInvoiceIdsByOrder,
    setViewConsult,
    setConsultDetail,
    setLoadingDetail,
    load,
  });

  async function submitLabOrder(data: any) {
    const ok = await handleCreateOrder(data);
    if (ok) router.push("/lab");
    return ok;
  }

  function addOrderTest() {
    const t = selectedAvailableTest;
    const name = t?.item_name || t?.name || testSearch.trim();
    if (!name) return;
    setOrderTests((rows: any[]) =>
      rows.some((r: any) => r.name.toLowerCase() === name.toLowerCase())
        ? rows
        : [
            ...rows,
            {
              id: t?.source === "local" ? t.id || "" : "",
              name,
              source: t?.source || "typed",
              item_type: t?.item_type || "typed",
            },
          ],
    );
    setSelectedAvailableTestId("");
    setTestSearch("");
  }

  function removeOrderTest(index: number) {
    setOrderTests((rows: any[]) =>
      rows.filter((_: any, i: number) => i !== index),
    );
  }

  function handleReuploadReport(order: any) {
    const docs = reportDocuments[order.id] || [];
    if (docs.length > 1) {
      setReplaceDocPicker({ order, docs });
      return;
    }
    pickReportFile((file) => replaceReportDocument(order, docs[0], file));
  }

  function handleAddDocument(order: any) {
    if ((reportDocuments[order.id] || []).length >= MAX_REPORT_DOCUMENTS)
      return;
    pickReportFile((file) => addReportDocument(order, file));
  }

  function viewInvoice(order: any) {
    const invoiceId = invoiceIdsByOrder[order.id];
    if (!invoiceId || typeof window === "undefined") return;
    window.sessionStorage.setItem("medizinhub.billingInvoiceId", invoiceId);
    setSelectedOrder(null);
    setActive?.("billing");
  }

  async function handleOrderAction(order: any, action: string) {
    if (!action) return;
    if (action === "sample") return collectSample(order);
    if (action === "release") return releaseResult(order);
    if (action === "invoice") return generateInvoice(order);
    if (action === "view-invoice") return viewInvoice(order);
    if (action === "pdf") return openReport(order, downloadBlob);
    if (action === "send-report") return sendReport(order);
    if (action === "cancel") return updateStatus(order, "cancelled");
  }

  const worklistColumns = useMemo(
    () =>
      getLabColumns({
        safePage,
        patientMap,
        canCopyIds,
        invoicedOrderIds,
        reportDocuments,
        busy,
        addReportDocument,
        canBillLabOrder,
        canEditLabOrder,
        handleOrderAction,
        handleRemoveDocument,
        handleReuploadReport,
      }),
    [
      safePage,
      patientMap,
      canCopyIds,
      invoicedOrderIds,
      reportDocuments,
      busy,
      addReportDocument,
      canBillLabOrder,
      canEditLabOrder,
      handleOrderAction,
      handleRemoveDocument,
      handleReuploadReport,
    ],
  );


  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">Lab & Diagnostic Integration</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required to view lab data.
        </p>
      </Card>
    );

  if (workspaceMode === "consultation") {
    const visibleReferrals = visibleConsultationReferrals;
    return (
      <div className="space-y-3">
        {viewConsult && (
          <ConsultReferralModal
            a={viewConsult}
            detail={consultDetail}
            loading={loadingDetail}
            busy={busy}
            onClose={() => setViewConsult(null)}
            onCreate={(a: any) => {
              setViewConsult(null);
              createFromConsultation(a);
            }}
          />
        )}
        <StatusToast message={message} onClose={() => setMessage("")} />
        <Card className="pt-2">
          <div className="mt-2 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Appointment ID</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Date &amp; Time</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {visibleReferrals.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-slate-500"
                    >
                      No consultation lab or service referrals are waiting.
                    </td>
                  </tr>
                ) : (
                  visibleReferrals.map((a: any) => (
                    <tr
                      key={a.id}
                      onClick={() => loadConsultDetail(a)}
                      className="cursor-pointer transition-colors hover:bg-emerald-50/30"
                    >
                      <td className="px-4 py-3 font-bold">
                        {displayDocumentNumber(
                          a.appointmentNumber || a.appointment_number,
                          numberingRules,
                          "appointment",
                        ) || "-"}
                      </td>
                      <td className="px-4 py-3 font-semibold">{a.patient}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {a.doctor && a.doctor !== "Unassigned"
                          ? a.doctor
                          : "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {displayDateTime(
                          a.referralDate ||
                            a.consultationSignedAt ||
                            a.consultationCreatedAt ||
                            a.appointmentDate,
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {canCreateLabOrder && (
                            <Button
                              disabled={busy === a.consultationId}
                              onClick={(event: any) => {
                                event.stopPropagation();
                                createFromConsultation(a);
                              }}
                              className="rounded-lg px-4 py-2 text-xs"
                            >
                              {busy === a.consultationId
                                ? "Creating..."
                                : "Create Order"}
                            </Button>
                          )}
                          <ActionButton
                            onClick={(event: any) => {
                              event.stopPropagation();
                              setDismissedConsultations((ids: string[]) => [
                                ...ids,
                                a.consultationId,
                              ]);
                            }}
                            className="close-button"
                            aria-label="Remove"
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  if (view === "create" && canCreateLabOrder) {
    return (
      <div className="space-y-4">
        <StatusToast message={message} onClose={() => setMessage("")} />
        <button
          type="button"
          onClick={() => router.push("/lab")}
          className="close-button font-bold bg-white"
        >
          Back to Worklist
        </button>
        <Card className="p-3 bg-white">
          <h3 className="card-title font-bold">
            Create Direct Lab &amp; Service Order
          </h3>
          <LabOrderForm
            apiSession={apiSession}
            patients={patients}
            busy={busy === "create"}
            testOptions={testOptions}
            testSearch={testSearch}
            selectedAvailableTestId={selectedAvailableTestId}
            onTestSearchChange={(text: string) => {
              setTestSearch(text);
              if (!text) setSelectedAvailableTestId("");
            }}
            onTestSelect={(id: string, test: any) => {
              setSelectedAvailableTestId(id);
              setTestSearch(test?.item_name || test?.name || "");
            }}
            onUseTypedTest={(text: string) => {
              setSelectedAvailableTestId("");
              setTestSearch(text);
            }}
            getTestSearchText={(test: any) =>
              [
                test?.item_name,
                test?.name,
                test?.sample_type,
                test?.category,
                test?.kind,
                test?.description,
                test?.code,
                test?.slug,
              ]
                .filter(Boolean)
                .join(" ")
            }
            testLoading={testLoading}
            selectedSupplierName={selectedSupplierName}
            selectedSupplierPrice={formatPrice(selectedSupplierPrice)}
            selectedTestMrp={formatPrice(selectedTestMrp)}
            selectedTestSelling={formatPrice(selectedTestSelling)}
            onAddTest={addOrderTest}
            orderTests={orderTests}
            onRemoveTest={removeOrderTest}
            onSubmit={submitLabOrder}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="">
      {selectedOrder && (
        <WorklistDetailModal
          title="Lab Test List"
          id={selectedOrder.id}
          patient={
            selectedOrder.patient_name ||
            (patientMap.get(selectedOrder.patient_id) as any)?.name ||
            publicDisplayValue(selectedOrder.patient_id, "Patient")
          }
          createdAt={selectedOrder.created_at}
          items={splitList(selectedOrder.tests)}
          onClose={() => setSelectedOrder(null)}
          apiSession={apiSession}
          canGenerateInvoice={canBillLabOrder}
          invoiceDisabled={isCancelled(selectedOrder)}
          invoiceBusy={busy === `invoice-${selectedOrder.id}`}
          invoiceGenerated={invoicedOrderIds.has(selectedOrder.id)}
          packages={packages}
          onGenerateInvoice={() => handleOrderAction(selectedOrder, "invoice")}
          onViewInvoice={() => handleOrderAction(selectedOrder, "view-invoice")}
        />
      )}
      {viewConsult && (
        <ConsultReferralModal
          a={viewConsult}
          detail={consultDetail}
          loading={loadingDetail}
          busy={busy}
          onClose={() => setViewConsult(null)}
          onCreate={(a: any) => {
            setViewConsult(null);
            createFromConsultation(a);
          }}
        />
      )}
      <StatusToast message={message} onClose={() => setMessage("")} />
      <BreadcrumbSlot>
        <div className="flex items-center gap-2">
          <AdaptiveResultCount
            shown={labPageRows.length}
            total={labOrderTotal}
            noun="orders"
          />
          <RefreshButton
            onRefresh={refreshLabWorkspace}
            className="h-auto rounded-md px-2.5 py-1 text-[11px]"
          />
          <AdaptiveFilterTrigger
            schema={labSchema}
            query={worklistQuery}
            setQuery={setWorklistQuery}
            filterValues={{}}
            sort={worklistSort}
            onSortChange={setWorklistSort}
            showSort={false}
            onReset={resetWorklistFilters}
            queryFields={labQueryFields}
            queryFilters={worklistQueryFilters}
            onQueryFiltersChange={setWorklistQueryFilters}
          >
            {/* <FormField label="Price Min">
              <Input
                type="number"
                value={amountMin}
                onChange={(e: any) => setAmountMin(e.target.value)}
                placeholder="Min amount"
              />
            </FormField>
            <FormField label="Price Max">
              <Input
                type="number"
                value={amountMax}
                onChange={(e: any) => setAmountMax(e.target.value)}
                placeholder="Max amount"
              />
            </FormField>
            <FormField label="From">
              <Input
                type="date"
                value={worklistFromDate}
                onChange={(e: any) => setWorklistFromDate(e.target.value)}
              />
            </FormField>
            <FormField label="To">
              <Input
                type="date"
                value={worklistToDate}
                onChange={(e: any) => setWorklistToDate(e.target.value)}
              />
            </FormField> */}
          </AdaptiveFilterTrigger>
          <AdaptiveSortTrigger
            fields={labSchema.sortFields}
            sort={worklistSort}
            onSortChange={setWorklistSort}
          />
        </div>
      </BreadcrumbSlot>
      <div className="mt-3 space-y-3">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <FlaskConical className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Orders
              </p>
              <p className="text-xl font-black text-slate-950">
                {labSummaryTotal}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-600">
              <FileCheck2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Reports Uploaded
              </p>
              <p className="text-xl font-black text-slate-950">
                {labUploadedReports}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
              <BadgeCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Amount
              </p>
              <p className="text-xl font-black text-slate-950">
                {money(labSummaryAmount)}
              </p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-brand">
                <FlaskConical className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-black tracking-tight text-slate-950">
                  Lab / Service Workspace
                </h2>
                <p className="text-xs font-medium text-slate-500">
                  Lab orders, services, reports and billing in one workspace
                </p>
              </div>
            </div>
            {canCreateLabOrder && (
              <button
                type="button"
                onClick={() => router.push(`/lab/${newSegment("lab-order")}`)}
                className="primary-action h-9 gap-2 whitespace-nowrap px-4 text-xs"
              >
                <PlusCircle size={16} />
                Create Lab Order
              </button>
            )}
          </div>
          <nav
            className="scrollbar-hidden flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
            aria-label="Lab and service worklist sections"
          >
            {labStatusTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeLabStatus === tab.id;
              const count =
                tab.id === "all"
                  ? labTabCountTotal
                  : labStatusCounts.get(tab.id) || 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => selectLabStatus(tab.id)}
                  className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold transition-colors ${
                    active
                      ? "bg-brand text-brand-fg"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  <span
                    className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] ${
                      active
                        ? "bg-white/20 text-brand-fg"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </nav>
        </section>

        {!ordersLoaded || labOrderLoading ? (
          <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
            <TableSkeleton rows={8} />
          </div>
        ) : (
          <DataTable
            className="scrollbar-hidden overflow-auto rounded-lg bg-white"
            columns={worklistColumns}
            data={labPageRows}
            emptyMessage="No lab orders match your filters."
            emptyDescription="Lab and service orders created for patients will show up here."
            emptyIcon={FlaskConical}
            minBodyHeight={`${labPageRows.length > 0 ? "" : "220px"}`}
            onRowClick={setSelectedOrder}
            sort={worklistSort ?? undefined}
            onSortChange={setWorklistSort}
          />
        )}
        {ordersLoaded && (
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={labOrderTotal}
            onPage={setPage}
          />
        )}
      </div>
      {replaceDocPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold mb-4">Choose document to replace</h3>
            <div className="space-y-2 max-h-80 overflow-auto">
              {replaceDocPicker.docs.map((doc: any, idx: number) => (
                <button
                  key={`${doc.id}-${idx}`}
                  onClick={() => {
                    pickReportFile((file) => {
                      replaceReportDocument(replaceDocPicker.order, doc, file);
                      setReplaceDocPicker(null);
                    });
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 rounded-lg border flex justify-between items-center"
                >
                  <span>Document {idx + 1}</span>
                  <span className="text-sm text-slate-500 truncate">
                    {doc.file_name}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-6">
              <Button
                onClick={() => setReplaceDocPicker(null)}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      {removeDocPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h3 className="mb-4 font-semibold">Choose document to remove</h3>
            <div className="max-h-80 space-y-2 overflow-auto">
              {removeDocPicker.docs.map((doc: any, idx: number) => (
                <button
                  key={`${doc.id}-${idx}`}
                  type="button"
                  onClick={() => {
                    removeReportDocument(removeDocPicker.order, doc);
                    setRemoveDocPicker(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-red-50"
                >
                  <span>Document {idx + 1}</span>
                  <span className="truncate text-sm text-slate-500">
                    {doc.file_name}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                onClick={() => setRemoveDocPicker(null)}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
