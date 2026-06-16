"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  Badge,
  Button,
  Card,
  RefreshButton,
  StatusToast,
} from "@/components/common/ui";
import { apiFetch } from "@/lib/api";
import {
  FormField,
  NumberField,
  SelectField,
  SearchableSelectField,
  TextField,
  DateField,
} from "@/components/FormElements";
import { SearchPicker } from "@/components/clinicalRows";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import { Column, DataTable } from "@/components/reports/DataTable";
import { displayDate, displayDateTime } from "@/utils/helper";
import { Pagination } from "@/components/common/Pagination";
import { isBilledIssue, isCancelledIssue, isDispensed } from "@/utils/pharmacy/helpers";
import { ConsultPrescriptionModal, MedicineDetailModal } from "@/components/pharmacy/Shared";

const pageSize = 10;

export function Pharmacy({
  apiSession,
  branchId,
  patients,
  appointments,
  loadLiveData,
  liveInvoices = [],
}: any) {
  const [issues, setIssues] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [patientId, setPatientId] = useState(patients[0]?.id || "");
  const [source, setSource] = useState("op_direct");
  const [externalPrescriber, setExternalPrescriber] = useState("");
  const [medicineText, setMedicineText] = useState("Paracetamol 500mg");
  const [medicineId, setMedicineId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [issueItems, setIssueItems] = useState<any[]>([]);
  const [availableMedicines, setAvailableMedicines] = useState<any[]>([]);
  const [medicineSearch, setMedicineSearch] = useState("");
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [medicineLoading, setMedicineLoading] = useState(false);
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
    new Date().toISOString().slice(0, 10),
  );
  const [purchaseDiscount, setPurchaseDiscount] = useState("0");
  const [lineDiscount, setLineDiscount] = useState("0");
  const [cgst, setCgst] = useState("6");
  const [sgst, setSgst] = useState("6");
  const [returnQty, setReturnQty] = useState("1");
  const [localInvoicedIssueIds, setLocalInvoicedIssueIds] = useState<string[]>(
    [],
  );
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [viewConsult, setViewConsult] = useState<any>(null);
  const [consultDetail, setConsultDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [page, setPage] = useState(1);
  const issuedConsultationIds = useMemo(
    () =>
      new Set(
        issues.map((issue: any) => issue.consultation_id).filter(Boolean),
      ),
    [issues],
  );
  const prescriptionReady = useMemo(
    () =>
      appointments.filter(
        (a: any) =>
          a.consultationId &&
          a.consultationStatus === "signed" &&
          !issuedConsultationIds.has(a.consultationId),
      ),
    [appointments, issuedConsultationIds],
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
  const patientMap = useMemo(
    () => new Map(patients.map((p: any) => [p.id, p])),
    [patients],
  );

  useEffect(() => {
    if (!patientId && patients[0]?.id) setPatientId(patients[0].id);
  }, [patients, patientId]);
  useEffect(() => {
    load();
  }, [apiSession?.token, apiSession?.tenantId]);
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
    if (!apiSession?.token) {
      setAvailableMedicines([]);
      return;
    }
    let alive = true;
    const search = medicineSearch.trim();
    const timer = window.setTimeout(
      async () => {
        setMedicineLoading(true);
        try {
          const params = new URLSearchParams();
          if (branchId) params.set("branch_id", branchId);
          if (search) params.set("search", search);
          const rows = await apiFetch(
            `/pharmacy/catalog/available-medicines${params.toString() ? `?${params}` : ""}`,
            apiSession,
          );
          if (alive) setAvailableMedicines(Array.isArray(rows) ? rows : []);
        } catch {
          if (alive) setAvailableMedicines([]);
        } finally {
          if (alive) setMedicineLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [apiSession?.token, apiSession?.tenantId, branchId, medicineSearch]);

  const medicineOptions = availableMedicines.map((m: any) => ({
    value: m.id || m.slug || m.name,
    label: m.item_name || m.name,
    item: m,
  }));
  const selectedMedicine = availableMedicines.find(
    (m: any) => (m.id || m.slug || m.name) === selectedMedicineId,
  );

  async function load() {
    if (!apiSession) {
      setIssues([]);
      return;
    }
    try {
      const [issueRows, medicineRows, batchRows, supplierRows, lowRows] =
        await Promise.all([
          apiFetch("/pharmacy/issues", apiSession),
          apiFetch("/pharmacy/medicines", apiSession),
          apiFetch("/pharmacy/batches", apiSession),
          apiFetch("/pharmacy/suppliers", apiSession),
          apiFetch(`/pharmacy/low-stock?branch_id=${branchId}`, apiSession),
        ]);
      setIssues(issueRows);
      setMedicines(medicineRows);
      setBatches(batchRows);
      setSuppliers(supplierRows);
      setLowStock(lowRows);
    } catch (err: any) {
      setMessage(err.message || "Could not load pharmacy workspace.");
    }
  }

  async function createMedicine(e: any) {
    e.preventDefault();
    if (!apiSession) return;
    setBusy("medicine");
    setMessage("");
    try {
      await apiFetch("/pharmacy/medicines", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchId,
          code,
          name,
          generic_name: generic,
          form: "Tablet",
          default_sale_price: Number(salePrice || 0),
          reorder_level: Number(reorder || 0),
          created_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setMessage("Medicine added to catalog.");
    } catch (err: any) {
      setMessage(err.message || "Could not create medicine.");
    } finally {
      setBusy("");
    }
  }

  async function createSupplier() {
    if (!apiSession) return;
    setBusy("supplier");
    setMessage("");
    try {
      await apiFetch("/pharmacy/suppliers", apiSession, {
        method: "POST",
        body: JSON.stringify({
          name: supplierName,
          created_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setMessage("Supplier created.");
    } catch (err: any) {
      setMessage(err.message || "Could not create supplier.");
    } finally {
      setBusy("");
    }
  }

  async function createPurchase() {
    if (!apiSession || !medicineId) return;
    setBusy("purchase");
    setMessage("");
    try {
      const med = medicines.find((m: any) => m.id === medicineId);
      await apiFetch("/pharmacy/purchases", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchId,
          supplier_id: suppliers[0]?.id || null,
          purchase_order_id: purchaseOrderId,
          invoice_number: `PINV-${Date.now().toString().slice(-5)}`,
          purchase_date: new Date(`${purchaseDate}T00:00:00`).toISOString(),
          discount_percentage: Number(purchaseDiscount || 0),
          items: [
            {
              medicine_id: medicineId,
              batch_number: `B-${Date.now().toString().slice(-4)}`,
              quantity: Number(purchaseQty || 0),
              cost_price: Math.max(1, Number(med?.default_sale_price || 0) - 2),
              sale_price: Number(med?.default_sale_price || 0),
              discount_percentage: Number(lineDiscount || 0),
              cgst_percentage: Number(cgst || 0),
              sgst_percentage: Number(sgst || 0),
            },
          ],
          purchased_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setMessage("Purchase added with discount/GST and stock ledger updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not create purchase.");
    } finally {
      setBusy("");
    }
  }

  async function returnExpiredStock() {
    if (!apiSession || !medicineId || !batchId) return;
    setBusy("return");
    setMessage("");
    try {
      const batch = batches.find((b: any) => b.id === batchId);
      await apiFetch("/pharmacy/returns", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchId,
          supplier_id: suppliers[0]?.id || null,
          purchase_id: batch?.purchase_id || null,
          reason: "Expired medicine returned to supplier",
          items: [
            {
              medicine_id: medicineId,
              batch_id: batchId,
              quantity: Number(returnQty || 1),
              amount: Number(returnQty || 1) * Number(batch?.cost_price || 0),
            },
          ],
          returned_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setMessage("Expired medicine returned and stock ledger updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not return expired stock.");
    } finally {
      setBusy("");
    }
  }

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

  async function createDirect(e: any) {
    e.preventDefault();
    if (!apiSession) return;
    setBusy("create");
    setMessage("");
    const fallback = buildIssueItem();
    const itemRows = issueItems.length
      ? issueItems
      : fallback
        ? [fallback]
        : [];
    const names = itemRows
      .map((item: any) => item.medicine_name)
      .filter(Boolean);
    if (!names.length) {
      setMessage("Add at least one medicine.");
      setBusy("");
      return;
    }
    try {
      await apiFetch("/pharmacy/issues", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchId,
          patient_id: patientId,
          source,
          medicine_text: names.join(", "),
          external_prescriber:
            source === "external_prescription" ? externalPrescriber : null,
          items: itemRows,
          issued_by_user_id: apiSession.user?.id,
        }),
      });
      setIssueItems([]);
      setSelectedMedicineId("");
      setMedicineSearch("");
      await load();
      setMessage("Pharmacy issue created.");
    } catch (err: any) {
      setMessage(err.message || "Could not create pharmacy issue.");
    } finally {
      setBusy("");
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

  async function createFromConsultation(a: any) {
    setBusy(a.consultationId);
    setMessage("");
    try {
      await apiFetch(
        `/pharmacy/issues/from-consultation/${a.consultationId}`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            amount: 0,
            issued_by_user_id: apiSession.user?.id,
          }),
        },
      );
      await load();
      setMessage(
        "Pharmacy issue created. Set amount manually before marking billed.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not create prescription issue.");
    } finally {
      setBusy("");
    }
  }

  async function updateStatus(issue: any, status: string) {
    setBusy(issue.id);
    setMessage("");
    try {
      await apiFetch(`/pharmacy/issues/${issue.id}/status`, apiSession, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          actor_user_id: apiSession.user?.id,
          reason:
            status === "cancelled"
              ? "Cancelled from pharmacy screen"
              : undefined,
        }),
      });
      await load();
    } catch (err: any) {
      setMessage(err.message || "Could not update pharmacy issue.");
    } finally {
      setBusy("");
    }
  }

  async function generateInvoice(issue: any) {
    setBusy(`invoice-${issue.id}`);
    setMessage("");
    try {
      const detail = await apiFetch(
        "/billing/invoices/from-pharmacy-issue",
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            pharmacy_issue_id: issue.id,
            created_by_user_id: apiSession.user?.id,
          }),
        },
      );
      setLocalInvoicedIssueIds((ids) =>
        ids.includes(issue.id) ? ids : [...ids, issue.id],
      );
      await load();
      await loadLiveData?.(apiSession);
      setMessage(
        `Pharmacy invoice ${detail.invoice?.invoice_number || ""} generated.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not generate pharmacy invoice.");
    } finally {
      setBusy("");
    }
  }

  async function handleIssueAction(issue: any, action: string) {
    if (!action) return;
    if (action === "partial") return updateStatus(issue, "partially_dispensed");
    if (action === "dispense") return updateStatus(issue, "dispensed");
    if (action === "invoice") return generateInvoice(issue);
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
    if (Number.isNaN(amount) || amount < 0) {
      setMessage("Enter a valid amount.");
      return;
    }
    setBusy(`amount-${issue.id}`);
    setMessage("");
    try {
      await apiFetch(`/pharmacy/issues/${issue.id}/amount`, apiSession, {
        method: "PATCH",
        body: JSON.stringify({ amount, actor_user_id: apiSession.user?.id }),
      });
      setEditingAmountId("");
      setEditingAmountValue("");
      await load();
      setMessage("Pharmacy amount updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update amount.");
    } finally {
      setBusy("");
    }
  }

  async function loadConsultDetail(a: any) {
    setViewConsult(a);
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
      <Card>
        <h3 className="card-title font-bold">Create Pharmacy Issue</h3>
        <form
          onSubmit={createDirect}
          className="mt-4 grid gap-3 md:grid-cols-4"
        >
          <SearchableSelectField
            label="Patient"
            value={patientId}
            onChange={setPatientId}
            options={patients.map((p: any) => ({ value: p.id, label: p.name }))}
            placeholder="Select patient"
            searchPlaceholder="Search patient by name"
          />
          <SelectField
            label="Source"
            value={source}
            onChange={setSource}
            options={[
              { value: "op_direct", label: "OP Direct" },
              {
                value: "external_prescription",
                label: "External Prescription",
              },
            ]}
          />
          <FormField label="Medicine">
            <SearchPicker
              value={selectedMedicineId}
              inputValue={medicineSearch}
              onInputValueChange={(text: string) => {
                setMedicineSearch(text);
                if (!text) setSelectedMedicineId("");
              }}
              onChange={(id: string, medicine: any) => {
                setSelectedMedicineId(id);
                setMedicineSearch(medicine?.item_name || medicine?.name || "");
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
          <div className="md:col-span-2">
            <TextField
              label="External Prescriber"
              value={externalPrescriber}
              onChange={setExternalPrescriber}
              disabled={source !== "external_prescription"}
              className="search-input"
            />
          </div>
          <div className="flex items-end gap-2">
            <ActionButton type="button" onClick={addIssueItem} className='close-button'>
              Add
            </ActionButton>
            <Button disabled={busy === "create"} className='rounded-lg px-2 py-2.5 lg:px-4 lg:py-2 text-xs lg:text-sm'>
              {busy === "create" ? "Saving..." : "Create Issue"}
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
      <Card>
        <h3 className="card-title font-bold">Doctor Prescriptions</h3>
        <div className="mt-4 grid gap-3">
          {(() => {
            const visible = prescriptionReady.filter(
              (a: any) => !dismissedConsultations.includes(a.consultationId),
            );
            return (
              <>
                {visible.length === 0 && (
                  <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                    No signed prescriptions ready.
                  </div>
                )}
                {visible.slice(0, 6).map((a: any) => (
                  <div
                    key={a.id}
                    className="flex flex-col justify-between gap-3 rounded-lg border p-4 md:flex-row md:items-center"
                  >
                    <div>
                      <b className="card-title">
                        {a.token} · {a.patient}
                      </b>
                      <p className="table-data text-slate-500">
                        Signed prescription ready
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <ActionButton onClick={() => loadConsultDetail(a)} className='close-button'>
                        View Rx
                      </ActionButton>
                      <Button
                        disabled={busy === a.consultationId}
                        onClick={() => createFromConsultation(a)}
                        className='rounded-lg px-2 py-2.5 lg:px-4 lg:py-2 text-xs lg:text-sm'
                      >
                        {busy === a.consultationId
                          ? "Creating..."
                          : "Create Pharmacy Issue"}
                      </Button>
                      <ActionButton
                        onClick={() =>
                          setDismissedConsultations((ids: string[]) => [
                            ...ids,
                            a.consultationId,
                          ])
                        }
                        className='close-button'
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
          <h3 className="card-title font-bold">Pharmacy Worklist</h3>
          <RefreshButton onRefresh={load} />
        </div>
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full min-w-[1060px] table-fixed text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-[80px] px-4 py-3">#</th>
                <th className="w-[170px]">Date & Time</th>
                <th className="w-[190px]">Patient</th>
                <th className="w-[150px]">Source</th>
                <th className="w-[150px]">Status</th>
                <th className="w-[180px]">Amount</th>
                <th className="w-[210px] pr-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {issues.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-data px-4 py-4 text-slate-500">
                    No pharmacy issues yet.
                  </td>
                </tr>
              )}
              {pharmacyPageRows.map((issue: any, index: number) => {
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
                      <b>{displayDate(issue.created_at)}</b>
                      <p className="text-xs text-slate-500">
                        {new Date(issue.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </td>
                    <td>
                      {p?.name ||
                        publicDisplayValue(issue.patient_id, "Patient")}
                    </td>
                    <td>
                      <Badge className="table-status">{humanizeOptionLabel(issue.source)}</Badge>
                    </td>
                    <td>
                      <Badge tone={statusTone as any} className="table-status">{statusLabel}</Badge>
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
                          <button
                            type="button"
                            disabled={cancelled || billed}
                            onClick={() => startEditAmount(issue)}
                            className="rounded-xl border px-2 py-1 text-xs font-bold disabled:bg-slate-50 disabled:text-slate-300"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </td>
                    <td
                      className="pr-4"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="ml-auto w-[190px]">
                        <select
                          value=""
                          disabled={rowBusy || invoiceBusy || cancelled || invoiced}
                          onChange={(event: any) =>
                            handleIssueAction(issue, event.target.value)
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <option value="">
                            {rowBusy || invoiceBusy
                              ? "Updating..."
                              : "Select action"}
                          </option>
                          <option
                            value="partial"
                            disabled={dispensed || cancelled || invoiced}
                          >
                            Partial dispense
                          </option>
                          <option
                            value="dispense"
                            disabled={dispensed || cancelled || invoiced}
                          >
                            Dispense
                          </option>
                          {!invoiced && (
                            <option value="invoice">Generate invoice</option>
                          )}
                          <option
                            value="cancel"
                            disabled={dispensed || cancelled || invoiced}
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
          total={issues.length}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}





