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
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import { displayDate, displayDateTime, formatPrice } from "@/utils/helper";
import { pageSize } from "./constants";
import {
  downloadBlob,
  invoicedLabOrderIds,
  isCancelled,
  isReleased,
  splitList,
} from "@/features/lab/helpers";
import { ConsultReferralModal } from "./components/ConsultReferralModal";
import { WorklistDetailModal } from "./components/WorklistDetailModal";
import { Pagination } from "@/app/components/common/Pagination";
import { LabOrderForm } from "@/features/lab/forms/LabForms";
import { LabOrderFormValues } from "@/features/lab/lab.schema";
import type { LabOrderSummary } from "@/lib/contracts";
import { DataTable } from "../reports/components/DataTable";
import { Column } from "../reports/types";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "@/app/components/common/CopyIdButton";
import { RowActions } from "../admin/components/RowActions";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";
import {
  useLabActions,
  useLabAvailableTestSearch,
  useLabWorkspaceData,
} from "./api";

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
  appointments,
  loadLiveData,
  setActive,
}: any) {
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

  const { patients, patientMap } = usePatientReferencesQuery(
    apiSession,
    orders.map((o: any) => o.patient_id),
  );

  const invoicedOrderIds = useMemo(
    () =>
      new Set([
        ...invoicedLabOrderIds(orders),
        ...localInvoicedOrderIds,
      ]),
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
    const serverOrderIds = new Set(
      invoicedLabOrderIds(orders),
    );
    if (!serverOrderIds.size) return;
    setLocalInvoicedOrderIds((ids) =>
      ids.filter((orderId) => !serverOrderIds.has(orderId)),
    );
  }, [orders]);

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
    openReport,
    generateInvoice,
    loadConsultDetail,
    removeReportDocument
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
    if (action === "cancel") return updateStatus(order, "cancelled");
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
      width: "150px",
      render: (o) => {
        const p: any = patientMap.get(o.patient_id);

        return (
          <div className="flex items-center gap-2">
            <span>
              {o.patient_name ||
                p?.name ||
                publicDisplayValue(o.patient_id, "Patient")}
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
          {humanizeOptionLabel(o.acquisition_source || o.source)}
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
      className: "text-center",
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
              className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border px-3 py-3 text-xs font-bold transition-colors ${
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

              {isBusy ? (
                <div className="flex w-full flex-col items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Uploading...
                  </span>
                  {/* Indeterminate progress bar */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full w-1/2 animate-[progress_1.2s_ease-in-out_infinite] rounded-full bg-blue-500" />
                  </div>
                </div>
              ) : hasDocuments ? (
                `File Uploaded (${docs.length})`
              ) : (
                "Upload Report"
              )}
            </label>

            {/* Tooltip */}
            {hasDocuments && !isBusy && (
              <div className="absolute -top-2 left-1/2 z-50 hidden w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg group-hover:block">
                <div className="mb-2 font-medium text-slate-700">
                  Uploaded Documents
                </div>
                <ul className="max-h-48 space-y-1 overflow-auto">
                  {docs.map((doc: any, idx: number) => (
                    <li
                      key={`${doc.id}-${idx}`}
                      className="flex justify-between text-slate-600"
                    >
                      <span>Document {idx + 1}</span>
                      <span className="max-w-[140px] truncate text-right">
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
      className: "text-center",
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
                  label: invoiced
                    ? "View Invoice"
                    : invoiceBusy
                      ? "Generating..."
                      : "Generate invoice",
                  onClick: () =>
                    handleOrderAction(o, invoiced ? "view-invoice" : "invoice"),
                  hidden: !canBillLabOrder,
                  disabled: actionsBusy || (!invoiced && cancelled),
                },
                {
                  label: "Remove Document",
                  onClick: () => handleRemoveDocument(o),
                  disabled:
                    actionsBusy ||
                    released ||
                    cancelled ||
                    (reportDocuments[o.id] || []).length === 0,
                  hidden: !canEditLabOrder,
                  danger: true,
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
      {canCreateLabOrder && (
        <Card>
          <h3 className="card-title font-bold">Create Lab & Service Order</h3>
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
            onSubmit={handleCreateOrder}
          />
        </Card>
      )}
      <Card className="mt-3">
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
      <Card className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="card-title font-bold">Lab / Service Worklist</h3>
          <RefreshButton onRefresh={load} />
        </div>
        <div className="mt-4">
          {!ordersLoaded ? (
            <div className="overflow-auto rounded-lg border">
              <TableSkeleton rows={8} />
            </div>
          ) : (
            <DataTable
              columns={worklistColumns}
              data={labPageRows}
              emptyMessage="No lab orders yet."
              onRowClick={setSelectedOrder}
            />
          )}
        </div>
        {ordersLoaded && (
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={orders.length}
            onPage={setPage}
          />
        )}
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
