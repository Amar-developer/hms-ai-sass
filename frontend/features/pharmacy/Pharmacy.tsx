"use client";

import { useEffect, useMemo, useState } from "react";
import {
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
import { today } from "@/utils/helper";
import { Pagination } from "@/app/components/common/Pagination";
import { DataTable } from "@/app/components/common/DataTable";
import { AdaptiveFilterTrigger } from "@/app/components/common/AdaptiveFilterTrigger";
import { AdaptiveSortTrigger } from "@/app/components/common/AdaptiveSortTrigger";
import { AdaptiveResultCount } from "@/app/components/common/AdaptiveResultCount";
import { BreadcrumbSlot } from "@/features/shell/AppShell";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";
import { ConsultPrescriptionModal } from "./components/ConsultPrescriptionModal";
import { MedicineDetailModal } from "./components/MedicineDetailModal";
import { PatientSearchSelect } from "../patients/components/PatientSearchSelect";
import { canCopyDatabaseIds } from "@/app/components/common/CopyIdButton";
import type { PharmacyIssueSummary } from "@/lib/contracts";
import {
  useAvailableMedicines,
  useMedicineDetail,
  usePharmacyActions,
  usePharmacyWorkspace,
} from "./api";
import {
  fetchPharmacyIssueFilterOptions,
  fetchPharmacyIssuePage,
} from "./api/pharmacy.api";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";
import { getPharmacyColumns, getPrescriptionColumns } from "./Column";
import { getPharmacyTableSchema, getPharmacyQueryFields } from "./filterSchema";
import { type QueryFieldOption, type QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";

const pageSize = 10;

export function Pharmacy({
  apiSession,
  branchId,
  appointments,
  loadLiveData,
  numberingRules,
  onConsultationPendingCountChange,
  workspaceMode = "direct",
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
  const [worklistQuery, setWorklistQuery] = useState("");
  const [worklistSort, setWorklistSort] = useState<SortState | null>(null);
  const [worklistQueryFilters, setWorklistQueryFilters] = useState<
    QueryFilterRow[]
  >([]);
  const [issuePageRows, setIssuePageRows] = useState<PharmacyIssueSummary[]>(
    [],
  );
  const [issueTotal, setIssueTotal] = useState(0);
  const [issueLoading, setIssueLoading] = useState(false);
  const [filterOptions, setFilterOptions] = useState<
    Record<string, QueryFieldOption[]>
  >({});
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [worklistFromDate, setWorklistFromDate] = useState("");
  const [worklistToDate, setWorklistToDate] = useState("");

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
  const visibleConsultationPrescriptions = useMemo(
    () =>
      prescriptionReady.filter(
        (a: any) => !dismissedConsultations.includes(a.consultationId),
      ),
    [prescriptionReady, dismissedConsultations],
  );

  useEffect(() => {
    if (workspaceMode !== "consultation") return;
    onConsultationPendingCountChange?.(visibleConsultationPrescriptions.length);
  }, [
    workspaceMode,
    visibleConsultationPrescriptions.length,
    onConsultationPendingCountChange,
  ]);

  const invoicedIssueIds = useMemo(
    () =>
      new Set([
        ...issues
          .filter((issue: any) => Boolean(issue.billing_invoice_id))
          .map((issue: any) => issue.id),
        ...localInvoicedIssueIds,
      ]),
    [issues, localInvoicedIssueIds],
  );
  const worklistSourceOptions = useMemo(() => {
    const set = new Set<string>();
    issues.forEach((issue: any) => {
      if (issue.source) set.add(String(issue.source));
    });
    return [
      { value: "all", label: "All Sources" },
      ...Array.from(set).map((source) => ({
        value: source,
        label: humanizeOptionLabel(source),
      })),
    ];
  }, [issues]);

  const worklistStatusOptions = useMemo(() => {
    const set = new Set<string>();
    issues.forEach((issue: any) => {
      if (issue.status) set.add(String(issue.status));
    });
    return [
      { value: "all", label: "All Status" },
      ...Array.from(set).map((status) => ({
        value: status,
        label: humanizeOptionLabel(status),
      })),
    ];
  }, [issues]);

  const pharmacySchema = getPharmacyTableSchema();
  const pharmacyQueryFields = useMemo(
    () =>
      getPharmacyQueryFields({
        sourceOptions: worklistSourceOptions,
        statusOptions: worklistStatusOptions,
        rows: issuePageRows,
        filterOptions,
      }),
    [worklistSourceOptions, worklistStatusOptions, issuePageRows, filterOptions],
  );


  const { patients, patientMap } = usePatientReferencesQuery(
    apiSession,
    [...issues, ...issuePageRows].map((issue: any) => issue.patient_id),
  );

  async function loadPharmacyIssuePage(nextPage = page) {
    if (!apiSession) return;
    setIssueLoading(true);
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
      const result = await fetchPharmacyIssuePage(apiSession, params);
      setIssuePageRows(result?.items || []);
      setIssueTotal(Number(result?.total || 0));
    } catch (err: any) {
      setMessage(err.message || "Could not load pharmacy issues.");
    } finally {
      setIssueLoading(false);
    }
  }

  async function loadPharmacyFilterOptions() {
    if (!apiSession) return;
    const params = new URLSearchParams();
    if (branchId) params.set("branch_id", branchId);
    const result = await fetchPharmacyIssueFilterOptions(
      apiSession,
      params,
    ).catch(() => ({}));
    setFilterOptions(result || {});
  }

  const totalPages = Math.max(1, Math.ceil(issueTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const pharmacyPageRows = issuePageRows;
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
      void loadPharmacyIssuePage(page);
      void loadPharmacyFilterOptions();
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

  function refreshPharmacyWorkspace() {
    void load();
    void loadPharmacyIssuePage(page);
    void loadPharmacyFilterOptions();
  }

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
      setPage(1);
      void loadPharmacyIssuePage(1);
      void loadPharmacyFilterOptions();
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
    if (Number(issue?.amount || 0) <= 0) {
      setMessage("Enter pharmacy issue amount before generating invoice.");
      return;
    }
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

  function isAmountBusy(issue: any) {
    return busy === `amount-${issue.id}`;
  }

  const prescriptionColumns = getPrescriptionColumns({
    busy,
    canCreatePharmacyIssue,
    numberingRules,
    onCreate: (a: any) => createFromConsultation(a),
    onDismiss: (a: any) =>
      setDismissedConsultations((ids: string[]) => [...ids, a.consultationId]),
  });

  const pharmacyColumns = getPharmacyColumns({
    pageSize,
    safePage,
    patientMap,
    canCopyIds,
    invoicedIssueIds,
    editingAmountId,
    editingAmountValue,
    setEditingAmountValue,
    startEditAmount,
    cancelEditAmount,
    saveIssueAmount,
    amountBusy: isAmountBusy,
    canEditPharmacyIssue,
    canDispensePharmacyIssue,
    canBillPharmacyIssue,
    busy,
    handleIssueAction,
  });

  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">Electronic Prescriptions</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required to view pharmacy data.
        </p>
      </Card>
    );

  if (workspaceMode === "consultation") {
    const visiblePrescriptions = visibleConsultationPrescriptions;
    return (
      <div className="space-y-3">
        {viewConsult && (
          <ConsultPrescriptionModal
            a={viewConsult}
            detail={consultDetail}
            loading={loadingDetail}
            busy={busy}
            onClose={() => setViewConsult(null)}
            onCreate={(a: any, pricePayload?: any) => {
              setViewConsult(null);
              createFromConsultation(a, pricePayload);
            }}
          />
        )}
        <StatusToast message={message} onClose={() => setMessage("")} />
        <Card>
          <div className="border-b border-slate-200 pb-3">
            <h3 className="card-title font-bold">Consultation Prescriptions</h3>
            <p className="card-desc text-slate-500">
              Doctor prescriptions created from signed OPD consultations.
            </p>
          </div>
          <div className="mt-4">
            <DataTable
              columns={prescriptionColumns}
              data={visiblePrescriptions}
              emptyMessage="No consultation prescriptions are waiting."
              rowClassName="hover:bg-emerald-50/30"
              onRowClick={(row: any) => setViewConsult(row)}
            />
          </div>
        </Card>
      </div>
    );
  }

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
            onCreate={(a: any, pricePayload?: any) => {
              setViewConsult(null);
              createFromConsultation(a, pricePayload);
            }}
        />
      )}
      <StatusToast message={message} onClose={() => setMessage("")} />
      <BreadcrumbSlot>
        <div className="flex items-center gap-2">
          <AdaptiveResultCount
            shown={pharmacyPageRows.length}
            total={issueTotal}
            noun="issues"
          />
          <RefreshButton
            onRefresh={refreshPharmacyWorkspace}
            className="h-auto rounded-md px-2.5 py-1 text-[11px]"
          />
          <AdaptiveFilterTrigger
            schema={pharmacySchema}
            query={worklistQuery}
            setQuery={setWorklistQuery}
            filterValues={{}}
            sort={worklistSort}
            onSortChange={setWorklistSort}
            showSort={false}
            onReset={resetWorklistFilters}
            queryFields={pharmacyQueryFields}
            queryFilters={worklistQueryFilters}
            onQueryFiltersChange={setWorklistQueryFilters}
          >
            <FormField label="Price Min">
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
            </FormField>
          </AdaptiveFilterTrigger>
          <AdaptiveSortTrigger
            fields={pharmacySchema.sortFields}
            sort={worklistSort}
            onSortChange={setWorklistSort}
          />
        </div>
      </BreadcrumbSlot>
      {canCreatePharmacyIssue && (
        <Card className="p-0">
          <h3 className="card-title font-bold">
            Create Direct Prescription Order
          </h3>
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
                className="save-button"
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
      <Card className="p-0 mt-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="card-title font-bold">Pharmacy Worklist</h3>
        </div>
        <div className="mt-4">
          {!issuesLoaded || issueLoading ? (
            <div className="overflow-auto rounded-lg border">
              <TableSkeleton rows={8} />
            </div>
          ) : (
            <DataTable
              columns={pharmacyColumns}
              data={pharmacyPageRows}
              emptyMessage="No pharmacy issues match your filters."
              onRowClick={setSelectedIssue}
              sort={worklistSort ?? undefined}
              onSortChange={setWorklistSort}
            />
          )}
        </div>
        {issuesLoaded && (
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={issueTotal}
            onPage={setPage}
          />
        )}
      </Card>
    </div>
  );
}
