"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  Badge,
  Button,
  Card,
  RefreshButton,
  StatusToast,
} from "@/app/components/common/ui";
import { apiBlob, apiFetch, apiUpload, uploadAssetUrl } from "@/lib/api";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import { displayDate, displayDateTime, formatPrice } from "@/utils/helper";
import { pageSize } from "./constants";
import {
  downloadBlob,
  isCancelled,
  isReleased,
  splitList,
} from "@/features/lab/helpers";
import { ConsultReferralModal } from "./components/ConsultReferralModal";
import { WorklistDetailModal } from "./components/WorklistDetailModal";
import { Pagination } from "@/app/components/common/Pagination";
import { isActivePatientRecord, patientPickerLabel } from "../patients/helpers";
import { LabOrderForm } from "@/features/lab/forms/LabForms";
import { LabOrderFormValues } from "@/features/lab/lab.schema";
import { DataTable } from "../reports/components/DataTable";
import { Column } from "../reports/types";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "@/app/components/common/CopyIdButton";
import { RowActions } from "../admin/components/RowActions";

const MAX_REPORT_DOCUMENTS = 5;

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
  patients,
  appointments,
  loadLiveData,
  liveInvoices = [],
}: any) {
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [consultationReferrals, setConsultationReferrals] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [availableTests, setAvailableTests] = useState<any[]>([]);
  const [testSearch, setTestSearch] = useState("");
  const [selectedAvailableTestId, setSelectedAvailableTestId] = useState("");
  const [testLoading, setTestLoading] = useState(false);
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
  const [testName, setTestName] = useState("Complete Blood Count");
  const [testCode, setTestCode] = useState("CBC");
  const [sampleType, setSampleType] = useState("Blood");
  const [price, setPrice] = useState("350");
  const [templateName, setTemplateName] = useState("Standard Result Template");
  const [reportDocuments, setReportDocuments] = useState<Record<string, any[]>>(
    {},
  );
  const [replaceDocPicker, setReplaceDocPicker] = useState<{
    order: any;
    docs: any[];
  } | null>(null);
  const [localInvoicedOrderIds, setLocalInvoicedOrderIds] = useState<string[]>(
    [],
  );
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [viewConsult, setViewConsult] = useState<any>(null);
  const [consultDetail, setConsultDetail] = useState<any>(null);

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

  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const labPageRows = orders.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const patientMap = useMemo(
    () => new Map(patients.map((p: any) => [p.id, p])),
    [patients],
  );
  const activePatients = useMemo(
    () => patients.filter(isActivePatientRecord),
    [patients],
  );
  const defaultPatientId = activePatients[0]?.id || "";
  const patientOptions = useMemo(
    () =>
      activePatients.map((p: any) => ({
        value: p.id,
        label: patientPickerLabel(p),
        sublabel: p.mobile || p.patient_number || p.id,
      })),
    [activePatients],
  );

  const invoicedOrderIds = useMemo(
    () =>
      new Set([
        ...(liveInvoices || [])
          .map((invoice: any) => invoice.lab_order_id)
          .filter(Boolean),
        ...localInvoicedOrderIds,
      ]),
    [liveInvoices, localInvoicedOrderIds],
  );

  // Load data
  useEffect(() => {
    load();
  }, [apiSession?.tenantId]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem(
        "medizinhub.labDismissedConsultations",
        JSON.stringify(dismissedConsultations),
      );
  }, [dismissedConsultations]);

  useEffect(() => {
    if (!apiSession?.tenantId) {
      setAvailableTests([]);
      return;
    }
    let alive = true;
    const search = testSearch.trim();
    const timer = window.setTimeout(
      async () => {
        setTestLoading(true);
        try {
          const params = new URLSearchParams();
          if (search) params.set("search", search);
          const rows = await apiFetch(
            `/lab/catalog/available-tests${params.toString() ? `?${params}` : ""}`,
            apiSession,
          );
          if (alive) setAvailableTests(Array.isArray(rows) ? rows : []);
        } catch {
          if (alive) setAvailableTests([]);
        } finally {
          if (alive) setTestLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [apiSession, apiSession?.tenantId, testSearch]);

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

  async function load() {
    if (!apiSession) {
      setOrders([]);
      setConsultationReferrals([]);
      return;
    }
    try {
      const [
        orderRows,
        referralRows,
        testRows,
        packageRows,
        templateRows,
        supplierRows,
        reportRows,
      ] = await Promise.all([
        apiFetch("/lab/orders", apiSession),
        apiFetch("/lab/consultation-referrals", apiSession).catch(() => []),
        apiFetch("/lab/catalog/tests", apiSession),
        apiFetch("/lab/catalog/packages", apiSession),
        apiFetch("/lab/result-templates", apiSession),
        apiFetch("/pharmacy/suppliers", apiSession).catch(() => []),
        apiFetch("/files?category=lab_report&limit=500", apiSession).catch(
          () => [],
        ),
      ]);
      setOrders(orderRows);
      setConsultationReferrals(referralRows || []);
      setTests(testRows);
      setPackages(packageRows);
      setTemplates(templateRows);
      setSuppliers(supplierRows || []);
      const documentsByOrder: Record<string, any[]> = {};
      for (const file of reportRows || []) {
        if (file.attached_to_doctype !== "LabOrder" || !file.attached_to_name)
          continue;
        (documentsByOrder[file.attached_to_name] ||= []).push(file);
      }
      setReportDocuments(documentsByOrder);
    } catch (err: any) {
      setMessage(err.message || "Could not load lab workspace.");
    } finally {
      setOrdersLoaded(true);
    }
  }

  async function createTest(e: any) {
    e.preventDefault();
    if (!apiSession) return;
    setBusy("test");
    setMessage("");
    try {
      await apiFetch("/lab/catalog/tests", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchId,
          code: testCode,
          name: testName,
          sample_type: sampleType,
          default_price: Number(price || 0),
          created_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setMessage("Lab test added to catalog.");
    } catch (err: any) {
      setMessage(err.message || "Could not create lab test.");
    } finally {
      setBusy("");
    }
  }

  async function createPackage() {
    if (!apiSession || selectedTestIds.length === 0) return;
    setBusy("package");
    setMessage("");
    try {
      await apiFetch("/lab/catalog/packages", apiSession, {
        method: "POST",
        body: JSON.stringify({
          code: `PKG-${Date.now().toString().slice(-4)}`,
          name: `Package ${selectedTestIds.length} Tests`,
          package_price: selectedTestIds.reduce(
            (sum, id) =>
              sum +
              Number(tests.find((t: any) => t.id === id)?.default_price || 0),
            0,
          ),
          test_ids: selectedTestIds,
          created_by_user_id: apiSession.user?.id,
        }),
      });
      setSelectedTestIds([]);
      await load();
      setMessage("Lab package created.");
    } catch (err: any) {
      setMessage(err.message || "Could not create package.");
    } finally {
      setBusy("");
    }
  }

  async function createTemplate() {
    if (!apiSession) return;
    setBusy("template");
    setMessage("");
    try {
      await apiFetch("/lab/result-templates", apiSession, {
        method: "POST",
        body: JSON.stringify({
          test_id: selectedTestIds[0] || null,
          name: templateName,
          content: { fields: ["Observed value", "Reference range", "Remarks"] },
          created_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setMessage("Result template created.");
    } catch (err: any) {
      setMessage(err.message || "Could not create result template.");
    } finally {
      setBusy("");
    }
  }

  async function handleCreateOrder(data: LabOrderFormValues) {
    if (!apiSession) return false;
    setBusy("create");
    setMessage("");
    const selectedNames = orderTests.map((t: any) => t.name).filter(Boolean);
    const localTestIds = orderTests
      .filter((t: any) => t.id && t.item_type !== "lab_package")
      .map((t: any) => t.id);
    const packageIds = orderTests
      .filter((t: any) => t.id && t.item_type === "lab_package")
      .map((t: any) => t.id);
    const testsText = selectedNames.filter(Boolean).join(", ");
    if (!testsText) {
      setMessage("Select at least one lab test.");
      setBusy("");
      return false;
    }
    try {
      await apiFetch("/lab/orders", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchId,
          patient_id: data.patient_id,
          source: data.source,
          tests: testsText,
          test_ids: localTestIds,
          package_ids: packageIds,
          external_items: [],
          external_referrer:
            data.source === "external_referral" ? data.external_referrer : null,
          amount: 0,
          ordered_by_user_id: apiSession.user?.id,
        }),
      });
      setOrderTests([]);
      setSelectedAvailableTestId("");
      setTestSearch("");
      await load();
      setMessage("Lab & Service order created.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not create lab / service order.");
      return false;
    } finally {
      setBusy("");
    }
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

  async function createFromConsultation(a: any) {
    setBusy(a.consultationId);
    setMessage("");
    try {
      await apiFetch(
        `/lab/orders/from-consultation/${a.consultationId}`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            amount: 0,
            priority: a.tokenType === "Emergency" ? "urgent" : "routine",
            ordered_by_user_id: apiSession.user?.id,
          }),
        },
      );
      await load();
      setMessage(
        "Lab order created. Release the result before generating invoice.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not create referral order.");
    } finally {
      setBusy("");
    }
  }

  async function collectSample(order: any) {
    setBusy(order.id);
    setMessage("");
    try {
      await apiFetch(`/lab/orders/${order.id}/samples`, apiSession, {
        method: "POST",
        body: JSON.stringify({
          barcode: `${order.id}-S1`,
          sample_type: "Blood",
          collected_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setMessage("Sample collected.");
    } catch (err: any) {
      setMessage(err.message || "Could not collect sample.");
    } finally {
      setBusy("");
    }
  }

  async function updateStatus(order: any, status: string) {
    setBusy(order.id);
    setMessage("");
    try {
      await apiFetch(`/lab/orders/${order.id}/status`, apiSession, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          actor_user_id: apiSession.user?.id,
          reason:
            status === "cancelled" ? "Cancelled from lab screen" : undefined,
        }),
      });
      await load();
    } catch (err: any) {
      setMessage(err.message || "Could not update lab order.");
    } finally {
      setBusy("");
    }
  }

  async function uploadOrderDocument(order: any, file: File) {
    const upload = new FormData();
    upload.append("file", file);
    upload.append("branch_id", order.branch_id || branchId || "");
    upload.append("patient_id", order.patient_id);
    upload.append("category", "lab_report");
    upload.append("source_module", "lab");
    upload.append("attached_to_doctype", "LabOrder");
    upload.append("attached_to_name", order.id);
    upload.append("attached_to_field", "report_url");
    upload.append("attached_to_label", "Lab Report");
    return apiUpload("/files", apiSession, upload);
  }

  async function addReportDocument(order: any, file: File | null) {
    if (!file || !apiSession) return;
    if ((reportDocuments[order.id] || []).length >= MAX_REPORT_DOCUMENTS) {
      setMessage(
        `Maximum ${MAX_REPORT_DOCUMENTS} documents allowed per report.`,
      );
      return;
    }
    setBusy(`report-${order.id}`);
    setMessage("");
    try {
      const document = await uploadOrderDocument(order, file);
      setReportDocuments((current) => ({
        ...current,
        [order.id]: [...(current[order.id] || []), document],
      }));
      setMessage(`Report uploaded: ${document.file_name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not upload report.");
    } finally {
      setBusy("");
    }
  }

  async function replaceReportDocument(
    order: any,
    oldDocument: any,
    file: File | null,
  ) {
    if (!file || !apiSession) return;
    setBusy(`report-${order.id}`);
    setMessage("");
    try {
      const document = await uploadOrderDocument(order, file);
      if (oldDocument?.id) {
        try {
          await apiFetch(`/files/${oldDocument.id}`, apiSession, {
            method: "DELETE",
          });
        } catch (_) {
          // Lab roles may not hold files.delete — the new document still
          // becomes the active one even if the stale file can't be purged.
        }
      }
      setReportDocuments((current) => ({
        ...current,
        [order.id]: (current[order.id] || []).map((doc: any) =>
          doc.id === oldDocument?.id ? document : doc,
        ),
      }));
      setMessage(`Report replaced: ${document.file_name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not replace report.");
    } finally {
      setBusy("");
    }
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

  async function releaseResult(order: any) {
    setBusy(order.id);
    setMessage("");
    const reportDocument = (reportDocuments[order.id] || [])[0];
    try {
      await apiFetch(`/lab/orders/${order.id}/results`, apiSession, {
        method: "POST",
        body: JSON.stringify({
          template_id: templates[0]?.id || null,
          result_summary: "Result released from MedizinHub lab screen.",
          abnormal_flag: false,
          report_url: reportDocument?.file_url || null,
          report_file_name: reportDocument?.file_name || null,
          released_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setMessage(
        "Lab result released and notification queued when provider settings allow.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not release result.");
    } finally {
      setBusy("");
    }
  }

  async function openReport(order: any) {
    setBusy(order.id);
    const docs = reportDocuments[order.id] || [];

    try {
      // Case 1: Single document → direct download
      if (docs.length === 1) {
        const doc = docs[0];
        const blob = await apiBlob(`/files/${doc.id}/download`, apiSession);
        downloadBlob(blob, doc.file_name || `lab-report-${order.id}`);
        return;
      }

      // Case 2: Multiple documents → download as ZIP
      if (docs.length > 1) {
        const zipBlob = await apiBlob(
          `/lab/orders/${order.id}/reports.zip`,
          apiSession,
        );
        downloadBlob(zipBlob, `lab-reports-${order.id}.zip`);
        return;
      }

      // Fallback: No documents → try backend-generated PDF
      const blob = await apiBlob(
        `/lab/orders/${order.id}/report.pdf`,
        apiSession,
      );
      downloadBlob(blob, `lab-report-${order.id}.pdf`);
    } catch (err: any) {
      setMessage(err.message || "Could not download report.");
    } finally {
      setBusy("");
    }
  }

  async function generateInvoice(order: any) {
    setBusy(`invoice-${order.id}`);
    setMessage("");
    try {
      const detail = await apiFetch(
        "/billing/invoices/from-lab-order",
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            lab_order_id: order.id,
            created_by_user_id: apiSession.user?.id,
          }),
        },
      );
      setLocalInvoicedOrderIds((ids) =>
        ids.includes(order.id) ? ids : [...ids, order.id],
      );
      await load();
      await loadLiveData?.(apiSession);
      setMessage(
        `Lab invoice ${detail.invoice?.invoice_number || ""} generated.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not generate lab invoice.");
    } finally {
      setBusy("");
    }
  }

  async function handleOrderAction(order: any, action: string) {
    if (!action) return;
    if (action === "sample") return collectSample(order);
    if (action === "release") return releaseResult(order);
    if (action === "invoice") return generateInvoice(order);
    if (action === "pdf") return openReport(order);
    if (action === "cancel") return updateStatus(order, "cancelled");
  }

  async function loadConsultDetail(a: any) {
    setViewConsult(a);
    if (a.referrals?.length) {
      setConsultDetail({ referrals: a.referrals });
      return;
    }
    setConsultDetail(null);
    setLoadingDetail(true);
    try {
      const detail = await apiFetch(
        `/consultations/${a.consultationId}`,
        apiSession,
      );
      setConsultDetail(detail);
    } catch (err: any) {
      setMessage(err.message || "Could not load consultation.");
    } finally {
      setLoadingDetail(false);
    }
  }
  const worklistColumns: Column<any>[] = [
    {
      key: "index",
      header: "#",
      width: "80px",
      render: (_, index) => <b>{(safePage - 1) * pageSize + index + 1}</b>,
    },

    {
      key: "created_at",
      header: "Date & Time",
      width: "170px",
      render: (o) => (
        <>
          <b>{displayDate(o.created_at)}</b>
          <p className="text-xs text-slate-500">
            {new Date(o.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </>
      ),
    },

    {
      key: "patient",
      header: "Patient",
      width: "130px",
      render: (o) => {
        const p: any = patientMap.get(o.patient_id);

        return (
          <div className="flex items-center gap-2">
            <span>
              {p?.name || publicDisplayValue(o.patient_id, "Patient")}
            </span>
            <CopyIdButton
              value={o.id}
              label="Lab / Service Order ID"
              allowed={canCopyIds}
            />
          </div>
        );
      },
    },

    {
      key: "source",
      header: "Source",
      width: "150px",
      render: (o) => (
        <Badge className="normal-badge w-[70%]">
          {humanizeOptionLabel(o.source)}
        </Badge>
      ),
    },

    {
      key: "status",
      header: "Status",
      width: "150px",
      render: (o) => {
        const released = isReleased(o);
        const cancelled = isCancelled(o);
        const invoiced = invoicedOrderIds.has(o.id);

        const statusLabel = invoiced ? "Billed" : humanizeOptionLabel(o.status);

        const statusTone = invoiced
          ? "green"
          : released
            ? "green"
            : cancelled
              ? "red"
              : "amber";

        return (
          <Badge tone={statusTone as any} className="normal-badge w-[70%]">
            {statusLabel}
          </Badge>
        );
      },
    },

    {
      key: "amount",
      header: "Amount",
      width: "90px",
      render: (o) => <>₹{o.amount}</>,
    },

    {
      key: "report",
      header: "Report",
      className:'text-center',
      width: "170px",
      disableRowClick: true,
      render: (o) => {
        const docs = reportDocuments[o.id] || [];
        const hasDocuments = docs.length > 0;
        const isBusy = busy === `report-${o.id}`;
        const released = isReleased(o);
        const cancelled = isCancelled(o);
        const disabled = released || cancelled;

        return (
          <div className="relative group">
            <label
              className={`flex cursor-pointer items-center justify-center rounded-2xl border px-3 py-3 text-xs font-bold transition-colors ${
                disabled || isBusy
                  ? "cursor-not-allowed bg-slate-50 text-slate-300"
                  : hasDocuments
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <input
                type="file"
                className="hidden"
                accept="application/pdf,image/*"
                disabled={disabled || isBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) addReportDocument(o, file);
                }}
              />
              {isBusy
                ? "Uploading..."
                : hasDocuments
                  ? `File Uploaded (${docs.length})`
                  : "Upload Report"}
            </label>

            {/* Tooltip */}
            {hasDocuments && (
              <div className="absolute hidden group-hover:block bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs z-50 w-64 -top-2 left-1/2 -translate-x-1/2">
                <div className="font-medium mb-2 text-slate-700">
                  Uploaded Documents
                </div>
                <ul className="space-y-1 max-h-48 overflow-auto">
                  {docs.map((doc: any, idx: number) => (
                    <li
                      key={`${doc.id}-${idx}`}
                      className="flex justify-between text-slate-600"
                    >
                      <span>Document {idx + 1}</span>
                      <span className="text-right truncate max-w-[140px]">
                        {doc.file_name}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      },
    },

    {
      key: "action",
      header: "Action",
      className:'text-center',
      width: "140px",
      disableRowClick: true,
      render: (o) => {
        const docs = reportDocuments[o.id] || [];
        const released = isReleased(o);
        const cancelled = isCancelled(o);
        const invoiced = invoicedOrderIds.has(o.id);
        const rowBusy = busy === o.id;
        const invoiceBusy = busy === `invoice-${o.id}`;
        const actionsBusy = rowBusy || invoiceBusy;

        const canAddMore = docs.length < MAX_REPORT_DOCUMENTS;

        return (
          <div className="flex justify-center">
            <RowActions
              actions={[
                {
                  label: invoiceBusy ? "Generating..." : "Generate invoice",
                  onClick: () => handleOrderAction(o, "invoice"),
                  hidden: !canBillLabOrder,
                  disabled: actionsBusy || cancelled || invoiced,
                },
                {
                  label: "Download Report",
                  onClick: () => handleOrderAction(o, "pdf"),
                  disabled: actionsBusy || cancelled,
                },
                {
                  label: "Reupload Report",
                  onClick: () => handleReuploadReport(o),
                  disabled: actionsBusy || released || cancelled,
                  hidden: !canEditLabOrder,
                },
                {
                  label: canAddMore ? "Add Document" : "Max Documents Reached",
                  onClick: () => handleAddDocument(o),
                  disabled: actionsBusy || !canAddMore || released || cancelled,
                  hidden: !canEditLabOrder,
                },
                {
                  label: rowBusy ? "Cancelling..." : "Cancel order",
                  onClick: () => handleOrderAction(o, "cancel"),
                  hidden: !canEditLabOrder,
                  disabled: actionsBusy || cancelled || invoiced,
                  danger: true,
                },
              ]}
              className="right-7 top-0 w-48"
            />
          </div>
        );
      },
    },
  ];
  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">Lab & Diagnostic Integration</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required to view lab data.
        </p>
      </Card>
    );
  return (
    <div className="space-y-6">
      {selectedOrder && (
        <WorklistDetailModal
          title="Lab Test List"
          id={selectedOrder.id}
          patient={
            (patientMap.get(selectedOrder.patient_id) as any)?.name ||
            publicDisplayValue(selectedOrder.patient_id, "Patient")
          }
          createdAt={selectedOrder.created_at}
          items={splitList(selectedOrder.tests)}
          onClose={() => setSelectedOrder(null)}
          apiSession={apiSession}
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
      {canCreateLabOrder && (
        <Card>
          <h3 className="card-title font-bold">Create Lab & Service Order</h3>
          <LabOrderForm
            patientOptions={patientOptions}
            defaultPatientId={defaultPatientId}
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
            onSubmit={handleCreateOrder}
          />
        </Card>
      )}
      <Card>
        <h3 className="card-title font-bold">Consultation Referrals</h3>
        <div className="mt-4 overflow-auto rounded-lg border border-slate-200">
          {(() => {
            const visible = labReady.filter(
              (a: any) => !dismissedConsultations.includes(a.consultationId),
            );
            return (
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Referral</th>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Doctor</th>
                    <th className="px-4 py-3">Date &amp; Time</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-5 text-slate-500">
                        No completed consultation referrals ready.
                      </td>
                    </tr>
                  ) : (
                    visible.slice(0, 6).map((a: any) => (
                      <tr key={a.id}>
                        <td className="px-4 py-3 font-bold">
                          {a.token || "-"}
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
                            <ActionButton
                              onClick={() => loadConsultDetail(a)}
                              className="close-button"
                            >
                              View Tests
                            </ActionButton>
                            {canCreateLabOrder && (
                              <Button
                                disabled={busy === a.consultationId}
                                onClick={() => createFromConsultation(a)}
                                className="rounded-lg px-2 py-2 text-xs lg:px-4"
                              >
                                {busy === a.consultationId
                                  ? "Creating..."
                                  : "Create Order"}
                              </Button>
                            )}
                            <ActionButton
                              onClick={() =>
                                setDismissedConsultations((ids: string[]) => [
                                  ...ids,
                                  a.consultationId,
                                ])
                              }
                              className="close-button"
                            >
                              Remove
                            </ActionButton>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            );
          })()}
        </div>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h3 className="card-title font-bold">Lab / Service Worklist</h3>
          <RefreshButton onRefresh={load} />
        </div>
        <div className="mt-4">
          <DataTable
            columns={worklistColumns}
            data={labPageRows}
            emptyMessage="No lab orders yet."
            onRowClick={setSelectedOrder}
          />
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={orders.length}
          onPage={setPage}
        />
      </Card>
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
    </div>
  );
}
