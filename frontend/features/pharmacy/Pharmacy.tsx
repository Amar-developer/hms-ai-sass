"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  Badge,
  Button,
  Card,
  Input,
  RefreshButton,
  SearchableSelect,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField, NumberField } from "@/app/components/FormElements";
import { SearchPicker } from "@/app/components/clinicalRows";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import { displayDate, displayDateTime, today } from "@/utils/helper";
import { Pagination } from "@/app/components/common/Pagination";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";
import {
  isBilledIssue,
  isCancelledIssue,
  isDispensed,
} from "@/features/pharmacy/helpers";
import { ConsultPrescriptionModal } from "./components/ConsultPrescriptionModal";
import { MedicineDetailModal } from "./components/MedicineDetailModal";
import { PatientSearchSelect } from "../patients/components/PatientSearchSelect";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "@/app/components/common/CopyIdButton";
import { RowActions } from "../admin/components/RowActions";
import type { PharmacyIssueSummary } from "@/lib/contracts";
import {
  useAvailableMedicines,
  useMedicineDetail,
  usePharmacyActions,
  usePharmacyWorkspace,
} from "./api";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";

const pageSize = 10;

export function Pharmacy({
  apiSession,
  branchId,
  appointments,
  loadLiveData,
  liveInvoices = [],
}: any) {
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const [patientId, setPatientId] = useState("");
  const [source, setSource] = useState("op_direct");
  const [externalPrescriber, setExternalPrescriber] = useState("");
  const [medicineText, setMedicineText] = useState("Paracetamol 500mg");
  const [medicineId, setMedicineId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [issueItems, setIssueItems] = useState<any[]>([]);
  const [medicineSearch, setMedicineSearch] = useState("");
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [editingAmountId, setEditingAmountId] = useState("");
  const [editingAmountValue, setEditingAmountValue] = useState("");
  const [dismissedConsultations, setDismissedConsultations] = useState<
    string[]
  >(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(
        localStorage.getItem("medizinhub.pharmacyDismissedConsultations") ||
          "[]",
      );
    } catch {
      return [];
    }
  });
  const [code, setCode] = useState("PCM500");
  const [name, setName] = useState("Paracetamol 500mg");
  const [generic, setGeneric] = useState("Paracetamol");
  const [salePrice, setSalePrice] = useState("5");
  const [reorder, setReorder] = useState("10");
  const [supplierName, setSupplierName] = useState("Demo Pharma Supplier");
  const [purchaseQty, setPurchaseQty] = useState("50");
  const [purchaseOrderId, setPurchaseOrderId] = useState("PO-001");
  const [purchaseDate, setPurchaseDate] = useState(() =>
    today(),
  );
  const [purchaseDiscount, setPurchaseDiscount] = useState("0");
  const [lineDiscount, setLineDiscount] = useState("0");
  const [cgst, setCgst] = useState("6");
  const [sgst, setSgst] = useState("6");
  const [returnQty, setReturnQty] = useState("1");
  const [localInvoicedIssueIds, setLocalInvoicedIssueIds] = useState<string[]>(
    [],
  );
  const [selectedIssue, setSelectedIssue] =
    useState<PharmacyIssueSummary | null>(null);
  const [viewConsult, setViewConsult] = useState<any>(null);
  const [page, setPage] = useState(1);

  const { issues, issuesLoaded, medicines, batches, suppliers, load } =
    usePharmacyWorkspace(apiSession, branchId, {
      setMessage: (value: string) => setMessage(value),
    });
  const { availableMedicines, medicineLoading } = useAvailableMedicines(
    apiSession,
    branchId,
    medicineSearch,
  );
  const {
    detail: consultDetail,
    loading: loadingDetail,
    error: consultDetailError,
  } = useMedicineDetail(apiSession, viewConsult?.consultationId);
  const {
    busy,
    message,
    setMessage,
    createMedicine,
    createSupplier,
    createPurchase,
    returnExpiredStock,
    createDirect,
    createFromConsultation,
    updateStatus,
    generateInvoice,
    updateIssueAmount,
  } = usePharmacyActions(apiSession, { load, loadLiveData });

  const issuedConsultationIds = useMemo(
    () =>
      new Set(
        issues.map((issue: any) => issue.consultation_id).filter(Boolean),
      ),
    [issues],
  );
  const prescriptionReady = useMemo(
    () =>
      // Wait until existing issues have loaded; otherwise already-issued
      // prescriptions briefly pass the filter and flash before being hidden.
      !issuesLoaded
        ? []
        : appointments.filter(
            (a: any) =>
              a.consultationId &&
              a.consultationStatus === "signed" &&
              // Only surface consultations that actually carry a prescription —
              // issue creation requires prescription_text, so an empty one
              // would be non-actionable.
              String(a.prescriptionText || "").trim() &&
              !issuedConsultationIds.has(a.consultationId),
          ),
    [appointments, issuedConsultationIds, issuesLoaded],
  );
  const invoicedIssueIds = useMemo(
    () =>
      new Set([
        ...(liveInvoices || [])
          .map((inv: any) => inv.pharmacy_issue_id)
          .filter(Boolean),
        ...localInvoicedIssueIds,
      ]),
    [liveInvoices, localInvoicedIssueIds],
  );
  const totalPages = Math.max(1, Math.ceil(issues.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pharmacyPageRows = issues.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const { patients, patientMap } = usePatientReferencesQuery(
    apiSession,
    issues.map((issue: any) => issue.patient_id),
  );
  useEffect(() => {
    if (!medicineId && medicines[0]?.id) setMedicineId(medicines[0].id);
  }, [medicines, medicineId]);
  useEffect(() => {
    const first = batches.find((b: any) => b.medicine_id === medicineId);
    setBatchId(first?.id || "");
  }, [medicineId, batches]);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem(
        "medizinhub.pharmacyDismissedConsultations",
        JSON.stringify(dismissedConsultations),
      );
  }, [dismissedConsultations]);
  useEffect(() => {
    if (consultDetailError) setMessage(consultDetailError);
  }, [consultDetailError]);

  const userPermissions = apiSession?.user?.permissions || [];
  const hasPermission = (...keys: string[]) =>
    Boolean(
      apiSession?.user?.is_super_admin ||
      userPermissions.includes("*") ||
      keys.some((key) => userPermissions.includes(key)),
    );
  const canCreatePharmacyIssue = hasPermission(
    "pharmacy.manage",
    "pharmacy.create",
  );
  const canDispensePharmacyIssue = hasPermission(
    "pharmacy.manage",
    "pharmacy.dispense",
  );
  const canEditPharmacyIssue = hasPermission(
    "pharmacy.manage",
    "pharmacy.edit",
  );
  const canBillPharmacyIssue = hasPermission(
    "billing.manage",
    "billing.create",
    "invoices.create",
  );

  const medicineOptions = availableMedicines.map((m: any) => ({
    value: m.id || m.slug || m.name,
    label: m.item_name || m.name,
    item: m,
  }));
  const selectedMedicine = availableMedicines.find(
    (m: any) => (m.id || m.slug || m.name) === selectedMedicineId,
  );

  function buildIssueItem() {
    const name =
      selectedMedicine?.item_name ||
      selectedMedicine?.name ||
      medicineSearch.trim();
    if (!name) return null;
    return {
      medicine_id:
        selectedMedicine?.source === "local"
          ? selectedMedicine.id || null
          : null,
      batch_id: null,
      medicine_name: name,
      quantity: Number(quantity || 1),
      unit_price: 0,
    };
  }

  async function handleCreateDirect(e: any) {
    e.preventDefault();
    const fallback = buildIssueItem();
    const itemRows = issueItems.length
      ? issueItems
      : fallback
        ? [fallback]
        : [];
    const ok = await createDirect({
      branchId,
      patientId,
      source,
      externalPrescriber,
      itemRows,
    });
    if (ok) {
      setIssueItems([]);
      setSelectedMedicineId("");
      setMedicineSearch("");
    }
  }

  function addIssueItem() {
    const item = buildIssueItem();
    if (!item) return;
    setIssueItems((rows: any[]) => [...rows, item]);
    setSelectedMedicineId("");
    setMedicineSearch("");
  }

  function removeIssueItem(index: number) {
    setIssueItems((rows: any[]) =>
      rows.filter((_: any, rowIndex: number) => rowIndex !== index),
    );
  }

  async function handleGenerateInvoice(issue: any) {
    const detail = await generateInvoice(issue);
    if (detail) {
      setLocalInvoicedIssueIds((ids) =>
        ids.includes(issue.id) ? ids : [...ids, issue.id],
      );
    }
  }

  async function handleIssueAction(issue: any, action: string) {
    if (!action) return;
    if (action === "partial") return updateStatus(issue, "partially_dispensed");
    if (action === "dispense") return updateStatus(issue, "dispensed");
    if (action === "invoice") return handleGenerateInvoice(issue);
    if (action === "cancel") return updateStatus(issue, "cancelled");
  }

  function startEditAmount(issue: any) {
    setEditingAmountId(issue.id);
    setEditingAmountValue(String(issue.amount || 0));
  }

  function cancelEditAmount() {
    setEditingAmountId("");
    setEditingAmountValue("");
  }

  async function saveIssueAmount(issue: any) {
    const amount = Number(editingAmountValue || 0);
    const ok = await updateIssueAmount(issue, amount);
    if (ok) {
      setEditingAmountId("");
      setEditingAmountValue("");
    }
  }

  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">Electronic Prescriptions</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required to view pharmacy data.
        </p>
      </Card>
    );
  return (
    <div className="space-y-6">
      {selectedIssue && (
        <MedicineDetailModal
          issue={selectedIssue}
          apiSession={apiSession}
          patient={
            selectedIssue.patient_name ||
            (patientMap.get(selectedIssue.patient_id) as any)?.name ||
            publicDisplayValue(selectedIssue.patient_id, "Patient")
          }
          onClose={() => setSelectedIssue(null)}
        />
      )}
      {viewConsult && (
        <ConsultPrescriptionModal
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
      {canCreatePharmacyIssue && (
        <Card>
          <h3 className="card-title font-bold">Create Pharmacy Issue</h3>
          <form
            onSubmit={handleCreateDirect}
            className="mt-4 grid gap-3 md:grid-cols-4"
          >
            <FormField label="Patient" required>
              <PatientSearchSelect
                apiSession={apiSession}
                initialPatients={patients}
                required
                value={patientId}
                onChange={setPatientId}
                placeholder="Select patient"
                searchPlaceholder="Search patient by name, mobile, or number"
              />
            </FormField>

            <FormField label="Source">
              <SearchableSelect
                name="source"
                value={source}
                onChange={setSource}
                options={[
                  { value: "op_direct", label: "OP Direct" },
                  {
                    value: "external_prescription",
                    label: "External Prescription",
                  },
                ]}
                placeholder="Select source"
                searchable={false}
              />
            </FormField>
            {source === "external_prescription" && (
              <FormField label="External Prescriber" required>
                <Input
                  value={externalPrescriber}
                  onChange={(event: any) =>
                    setExternalPrescriber(event.target.value)
                  }
                  required
                  placeholder="Enter prescriber name"
                />
              </FormField>
            )}
            <FormField label="Medicine" required>
              <SearchPicker
                value={selectedMedicineId}
                inputValue={medicineSearch}
                onInputValueChange={(text: string) => {
                  setMedicineSearch(text);
                  if (!text) setSelectedMedicineId("");
                }}
                onChange={(id: string, medicine: any) => {
                  setSelectedMedicineId(id);
                  setMedicineSearch(
                    medicine?.item_name || medicine?.name || "",
                  );
                }}
                options={medicineOptions}
                placeholder="Type medicine name"
                onUseTyped={(text: string) => {
                  setSelectedMedicineId("");
                  setMedicineSearch(text);
                }}
                getSearchText={(medicine: any) =>
                  [
                    medicine?.name,
                    medicine?.item_name,
                    medicine?.strength,
                    medicine?.generic_name,
                    medicine?.brand_name,
                    medicine?.slug,
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
                loading={medicineLoading}
              />
            </FormField>
            <NumberField
              label="Qty"
              value={quantity}
              onChange={setQuantity}
              min={1}
            />
            <div className="flex items-end gap-2 w-full lg:w-[80%]">
              <button
                type="button"
                onClick={addIssueItem}
                className="close-button font-bold"
              >
                Add
              </button>
              <Button
                disabled={busy === "create"}
                className="w-[130px] px-1 lg:px-2 py-2.5"
              >
                {busy === "create" ? "Saving..." : "Create Order"}
              </Button>
            </div>
            {issueItems.length > 0 && (
              <div className="md:col-span-4 flex flex-wrap gap-2">
                {issueItems.map((item: any, index: number) => (
                  <button
                    key={`${item.medicine_id}-${index}`}
                    type="button"
                    onClick={() => removeIssueItem(index)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                  >
                    {item.medicine_name} x {item.quantity} · ₹
                    {item.quantity * item.unit_price} ×
                  </button>
                ))}
              </div>
            )}
          </form>
        </Card>
      )}
      <Card>
        <h3 className="card-title font-bold">Doctor Prescriptions</h3>
        <div className="mt-4 overflow-auto rounded-lg border border-slate-200">
          {(() => {
            const visible = prescriptionReady.filter(
              (a: any) => !dismissedConsultations.includes(a.consultationId),
            );
            return (
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Prescription</th>
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
                        No completed prescriptions ready.
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
                            a.consultationSignedAt ||
                              a.consultationCreatedAt ||
                              a.appointmentDate,
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <ActionButton
                              onClick={() => setViewConsult(a)}
                              className="close-button"
                            >
                              View
                            </ActionButton>
                            {canCreatePharmacyIssue && (
                              <Button
                                disabled={busy === a.consultationId}
                                onClick={() => createFromConsultation(a)}
                                className="rounded-lg px-2 py-2 text-xs lg:px-4"
                              >
                                {busy === a.consultationId
                                  ? "Creating..."
                                  : "Create Issue"}
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
          <h3 className="card-title font-bold">Pharmacy Worklist</h3>
          <RefreshButton onRefresh={load} />
        </div>
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full min-w-[1060px] table-fixed text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-[80px] px-4 py-3">#</th>
                <th className="w-[150px]">Date & Time</th>
                <th className="w-[150px]">Patient</th>
                <th className="w-[140px]">Source</th>
                <th className="w-[150px]">Status</th>
                <th className="w-[100px]">Amount</th>
                <th className="w-[80px] pr-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!issuesLoaded && (
                <tr>
                  <td colSpan={7} className="p-0">
                    <TableSkeleton />
                  </td>
                </tr>
              )}
              {issuesLoaded && issues.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="card-desc px-4 py-4 text-slate-500"
                  >
                    No pharmacy issues yet.
                  </td>
                </tr>
              )}
              {issuesLoaded && pharmacyPageRows.map((issue: any, index: number) => {
                const p: any = patientMap.get(issue.patient_id);
                const selected = selectedIssue?.id === issue.id;
                const dispensed = isDispensed(issue);
                const cancelled = isCancelledIssue(issue);
                const invoiced = invoicedIssueIds.has(issue.id);
                const billed = isBilledIssue(issue) || invoiced;
                const rowBusy = busy === issue.id;
                const invoiceBusy = busy === `invoice-${issue.id}`;
                const amountBusy = busy === `amount-${issue.id}`;
                const statusLabel = billed
                  ? "Billed"
                  : humanizeOptionLabel(issue.status);
                const statusTone = billed
                  ? "green"
                  : dispensed
                    ? "green"
                    : cancelled
                      ? "red"
                      : "amber";
                return (
                  <tr
                    key={issue.id}
                    onClick={() => setSelectedIssue(issue)}
                    className={`cursor-pointer transition hover:bg-slate-50 ${selected ? "bg-slate-50" : ""}`}
                  >
                    <td className="px-4 py-4">
                      <b>{(safePage - 1) * pageSize + index + 1}</b>
                    </td>
                    <td>
                      <b className="text-xs">{displayDate(issue.created_at)}</b>
                      <p className="text-xs text-slate-500">
                        {new Date(issue.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </td>
                    <td className="text-xs">
                      <div className="flex items-center gap-2">
                        <span>
                          {issue.patient_name ||
                            p?.name ||
                            publicDisplayValue(issue.patient_id, "Patient")}
                        </span>
                        <CopyIdButton
                          value={issue.id}
                          label="Pharmacy Issue ID"
                          allowed={canCopyIds}
                        />
                      </div>
                    </td>
                    <td>
                      <Badge className="table-status w-[70%] text-xs px-2">
                        {humanizeOptionLabel(issue.source)}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        tone={statusTone as any}
                        className="table-status w-[60%] text-xs"
                      >
                        {statusLabel}
                      </Badge>
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      {editingAmountId === issue.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            autoFocus
                            value={editingAmountValue}
                            onChange={(event: any) =>
                              setEditingAmountValue(event.target.value)
                            }
                            onKeyDown={(event: any) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                saveIssueAmount(issue);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelEditAmount();
                              }
                            }}
                            className="w-20 rounded-xl border px-2 py-1 text-sm outline-none focus:border-slate-500"
                          />
                          <button
                            type="button"
                            disabled={amountBusy}
                            onClick={() => saveIssueAmount(issue)}
                            className="rounded-xl border px-2 py-1 text-xs font-bold disabled:bg-slate-50 disabled:text-slate-300"
                          >
                            {amountBusy ? "Saving" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditAmount}
                            className="rounded-xl border px-2 py-1 text-xs font-bold"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <b>₹{issue.amount}</b>
                          {canEditPharmacyIssue && (
                            <button
                              type="button"
                              disabled={cancelled || billed}
                              onClick={() => startEditAmount(issue)}
                              className="rounded-xl border px-2 py-1 text-xs font-bold disabled:bg-slate-50 disabled:text-slate-300"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td
                      className="pr-4"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="ml-auto flex justify-center">
                        <RowActions
                          className="right-8 top-0"
                          width="w-48"
                          actions={[
                            {
                              label: "Partial dispense",
                              hidden: !canDispensePharmacyIssue,
                              disabled:
                                dispensed ||
                                cancelled ||
                                invoiced ||
                                rowBusy ||
                                invoiceBusy,
                              onClick: () =>
                                handleIssueAction(issue, "partial"),
                            },
                            {
                              label: "Dispense",
                              hidden: !canDispensePharmacyIssue,
                              disabled:
                                dispensed ||
                                cancelled ||
                                invoiced ||
                                rowBusy ||
                                invoiceBusy,
                              onClick: () =>
                                handleIssueAction(issue, "dispense"),
                            },
                            {
                              label: "Generate invoice",
                              hidden: invoiced || !canBillPharmacyIssue,
                              disabled: rowBusy || invoiceBusy,
                              onClick: () =>
                                handleIssueAction(issue, "invoice"),
                            },
                            {
                              label: "Cancel order",
                              hidden: !canDispensePharmacyIssue,
                              disabled:
                                dispensed ||
                                cancelled ||
                                invoiced ||
                                rowBusy ||
                                invoiceBusy,
                              danger: true,
                              onClick: () => handleIssueAction(issue, "cancel"),
                            },
                          ]}
                        />
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
          total={issues.length}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
