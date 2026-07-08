"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  Badge,
  Button,
  Card,
  Input,
  RefreshButton,
  StatusToast,
} from "@/app/components/common/ui";
import { apiBlob, apiFetch } from "@/lib/api";
import {
  SelectField,
  SearchableSelectField,
  TextField,
} from "@/app/components/FormElements";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import { displayDate } from "@/utils/helper";
import { pageSize } from "@/utils/lab/constants";
import {
  downloadBlob,
  isCancelled,
  isReleased,
  splitList,
} from "@/utils/lab/helpers";
import {
  ConsultReferralModal,
  WorklistDetailModal,
} from "@/app/components/lab/Shared";
import { Pagination } from "@/app/components/common/Pagination";
import {
  isActivePatientRecord,
  patientPickerLabel,
} from "@/utils/patient/helpers";
import { LabOrderForm } from "@/app/forms/LabForms";
import { LabOrderFormValues } from "@/app/validations/lab.schema";

export function Lab({
  apiSession,
  branchId,
  patients,
  appointments,
  loadLiveData,
  liveInvoices = [],
}: any) {
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
  const [reportUrl, setReportUrl] = useState<Record<string, string>>({});
  const [reportFiles, setReportFiles] = useState<Record<string, File | null>>(
    {},
  );
  const [localInvoicedOrderIds, setLocalInvoicedOrderIds] = useState<string[]>(
    [],
  );
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [viewConsult, setViewConsult] = useState<any>(null);
  const [consultDetail, setConsultDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [page, setPage] = useState(1);
  const orderedConsultationIds = useMemo(
    () =>
      new Set(
        orders.map((order: any) => order.consultation_id).filter(Boolean),
      ),
    [orders],
  );
  const labReady = useMemo(
    () =>
      // Wait until existing orders have loaded; otherwise already-ordered
      // referrals briefly pass the filter and flash before being hidden.
      !ordersLoaded
        ? []
        : (consultationReferrals.length
            ? consultationReferrals.map((row: any) => ({
                id: row.appointment_id || row.id,
                consultationId: row.consultation_id,
                consultationStatus: row.status,
                labReferralText: row.lab_referral_text,
                token: row.token_number || "",
                tokenType: "Normal",
                patient: row.patient_name || row.patient_id,
                referrals: row.referrals || [],
              }))
            : appointments
          ).filter(
            (a: any) =>
              a.consultationId &&
              a.consultationStatus === "signed" &&
              // Only surface consultations that actually carry a lab/service
              // referral — order creation requires lab_referral_text, so an
              // empty referral would be non-actionable.
              String(a.labReferralText || "").trim() &&
              !orderedConsultationIds.has(a.consultationId),
          ),
    [appointments, consultationReferrals, orderedConsultationIds, ordersLoaded],
  );
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
  const formatPrice = (value: number) =>
    value > 0 ? `₹${value.toLocaleString("en-IN")}` : "";

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
      ] = await Promise.all([
        apiFetch("/lab/orders", apiSession),
        apiFetch("/lab/consultation-referrals", apiSession).catch(() => []),
        apiFetch("/lab/catalog/tests", apiSession),
        apiFetch("/lab/catalog/packages", apiSession),
        apiFetch("/lab/result-templates", apiSession),
        apiFetch("/pharmacy/suppliers", apiSession).catch(() => []),
      ]);
      setOrders(orderRows);
      setConsultationReferrals(referralRows || []);
      setTests(testRows);
      setPackages(packageRows);
      setTemplates(templateRows);
      setSuppliers(supplierRows || []);
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
            data.source === "external_referral"
              ? data.external_referrer
              : null,
          amount: 0,
          ordered_by_user_id: apiSession.user?.id,
        }),
      });
      setOrderTests([]);
      setSelectedAvailableTestId("");
      setTestSearch("");
      await load();
      setMessage("Lab / Service order created.");
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

  async function releaseResult(order: any) {
    setBusy(order.id);
    setMessage("");
    const reportFile = reportFiles[order.id];
    try {
      await apiFetch(`/lab/orders/${order.id}/results`, apiSession, {
        method: "POST",
        body: JSON.stringify({
          template_id: templates[0]?.id || null,
          result_summary: "Result released from MedizinHub lab screen.",
          abnormal_flag: false,
          report_url: reportUrl[order.id] || null,
          report_file_name: reportFile?.name || null,
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
    // Open synchronously, in the same tick as the click, then navigate it once
    // the report URL is known. Popup blockers (Brave in particular) drop new
    // tabs opened after an awaited fetch, leaving a blank tab.
    const win = window.open("", "_blank", "noopener,noreferrer");
    try {
      // 1. If user uploaded a file in this session, download it directly
      const localFile = reportFiles[order.id];
      if (localFile) {
        win?.close();
        downloadBlob(localFile, localFile.name);
        return;
      }
      // 2. Check if a report_url was stored on the released result
      try {
        const detail = await apiFetch(`/lab/orders/${order.id}`, apiSession);
        const resultWithUrl = (detail?.results || []).find(
          (r: any) => r.report_url,
        );
        if (resultWithUrl?.report_url) {
          if (win) {
            win.location.href = resultWithUrl.report_url;
          } else {
            window.open(resultWithUrl.report_url, "_blank");
          }
          return;
        }
      } catch (_) {
        /* fall through to generated PDF */
      }
      // 3. Fallback: download backend-generated PDF
      win?.close();
      const blob = await apiBlob(
        `/lab/orders/${order.id}/report.pdf`,
        apiSession,
      );
      downloadBlob(blob, `lab-report-${order.id}.pdf`);
    } catch (err: any) {
      win?.close();
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
      <Card>
        <h3 className="card-title font-bold">Create Lab / Service Order</h3>
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
      <Card>
        <h3 className="card-title font-bold">Consultation Referrals</h3>
        <div className="mt-4 grid gap-3">
          {(() => {
            const visible = labReady.filter(
              (a: any) => !dismissedConsultations.includes(a.consultationId),
            );
            return (
              <>
                {visible.length === 0 && (
                  <div className="rounded-lg  bg-slate-50 p-4 card-desc text-slate-500">
                    No signed consultation referrals ready.
                  </div>
                )}
                {visible.slice(0, 6).map((a: any) => (
                  <div
                    key={a.id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border p-4 md:flex-row md:items-center"
                  >
                    <div>
                      <b className="text-base lg:text-lg">
                        {a.token} · {a.patient}
                      </b>
                      <p className="text-xs text-slate-500">
                        Signed consultation referral
                        {a.doctor && a.doctor !== "Unassigned" ? (
                          <>
                            {" · Signed by "}
                            <span className="font-semibold text-slate-700">
                              {a.doctor}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <ActionButton
                        onClick={() => loadConsultDetail(a)}
                        className="close-button"
                      >
                        View Tests
                      </ActionButton>
                      <Button
                        disabled={busy === a.consultationId}
                        onClick={() => createFromConsultation(a)}
                        className="rounded-lg px-2 py-2 lg:px-4 lg:py-2 text-xs"
                      >
                        {busy === a.consultationId
                          ? "Creating..."
                          : "Create Lab / Service Order"}
                      </Button>
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
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h3 className="card-title font-bold">Lab / Service Worklist</h3>
          <RefreshButton onRefresh={load} />
        </div>
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full min-w-[1180px] table-fixed text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-[80px] px-4 py-3">#</th>
                <th className="w-[170px]">Date & Time</th>
                <th className="w-[130px]">Patient</th>
                <th className="w-[150px]">Source</th>
                <th className="w-[150px]">Status</th>
                <th className="w-[90px]">Amount</th>
                <th className="w-[150px] text-center pr-4">Report</th>
                <th className="w-[210px] pr-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-4 card-desc text-slate-500"
                  >
                    No lab orders yet.
                  </td>
                </tr>
              )}
              {labPageRows.map((o: any, index: number) => {
                const p: any = patientMap.get(o.patient_id);
                const selected = selectedOrder?.id === o.id;
                const released = isReleased(o);
                const cancelled = isCancelled(o);
                const invoiced = invoicedOrderIds.has(o.id);
                const rowBusy = busy === o.id;
                const invoiceBusy = busy === `invoice-${o.id}`;
                const statusLabel = invoiced
                  ? "Billed"
                  : humanizeOptionLabel(o.status);
                const statusTone = invoiced
                  ? "green"
                  : released
                    ? "green"
                    : cancelled
                      ? "red"
                      : "amber";
                return (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedOrder(o)}
                    className={`cursor-pointer transition hover:bg-slate-50 ${selected ? "bg-slate-50" : ""} h-20`}
                  >
                    <td className="px-4 py-4">
                      <b>{(safePage - 1) * pageSize + index + 1}</b>
                    </td>
                    <td>
                      <b>{displayDate(o.created_at)}</b>
                      <p className="text-xs text-slate-500">
                        {new Date(o.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </td>
                    <td>
                      {p?.name || publicDisplayValue(o.patient_id, "Patient")}
                    </td>
                    <td>
                      <Badge className="normal-badge w-[70%]">
                        {humanizeOptionLabel(o.source)}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        tone={statusTone as any}
                        className="normal-badge w-[70%]"
                      >
                        {statusLabel}
                      </Badge>
                    </td>
                    <td>₹{o.amount}</td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="flex min-w-[230px] items-center gap-2">
                        <label
                          className={`flex min-w-[120px] cursor-pointer items-center justify-center rounded-2xl border px-3 py-3 text-xs font-bold ${released || cancelled ? "cursor-not-allowed bg-slate-50 text-slate-300" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                        >
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            className="hidden file:rounded-lg "
                            disabled={released || cancelled}
                            onChange={(event: any) =>
                              setReportFiles({
                                ...reportFiles,
                                [o.id]: event.target.files?.[0] || null,
                              })
                            }
                          />
                          {reportFiles[o.id]?.name || "Upload report"}
                        </label>
                      </div>
                    </td>
                    <td
                      className="pr-4"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="ml-auto w-[190px]">
                        <select
                          value=""
                          disabled={rowBusy || invoiceBusy}
                          onChange={(event: any) =>
                            handleOrderAction(o, event.target.value)
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <option value="">
                            {rowBusy || invoiceBusy
                              ? "Updating..."
                              : "Select action"}
                          </option>
                          <option
                            value="invoice"
                            disabled={cancelled || invoiced}
                          >
                            Generate invoice
                          </option>
                          <option value="pdf" disabled={cancelled}>
                            Download PDF
                          </option>
                          <option
                            value="cancel"
                            disabled={cancelled || invoiced}
                          >
                            Cancel order
                          </option>
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={orders.length}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
