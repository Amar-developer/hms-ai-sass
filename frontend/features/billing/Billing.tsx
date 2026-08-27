"use client";

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  CircleDollarSign,
  Clock3,
  Landmark,
  Percent,
  ReceiptText,
  RotateCcw,
} from "lucide-react";
import { Card, RefreshButton } from "@/app/components/common/ui";
import { AdaptiveFilterTrigger } from "@/app/components/common/AdaptiveFilterTrigger";
import { AdaptiveSortTrigger } from "@/app/components/common/AdaptiveSortTrigger";
import { AdaptiveResultCount } from "@/app/components/common/AdaptiveResultCount";
import { BreadcrumbSlot } from "@/features/shell/AppShell";
import { readNotificationTarget } from "@/lib/notificationTarget";
import { Pagination } from "@/app/components/common/Pagination";
import { pageSize } from "@/utils/constants";
import { InvoiceDetailPage } from "./components/InvoiceDetailPage";
import { money } from "@/utils/helper";
import { canCopyDatabaseIds } from "@/app/components/common/CopyIdButton";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";
import {
  useBillingActions,
  useInvoiceDeliveryStatuses,
  usePaymentMethods,
} from "./api";
import {
  fetchInvoiceFilterOptions,
  fetchInvoicePage,
  fetchInvoiceSummary,
} from "./api/billing.api";
import { DataTable } from "@/app/components/common/DataTable";
import { getInvoiceColumns } from "./Column";
import { getBillingTableSchema, getBillingQueryFields } from "./filterSchema";
import { type QueryFieldOption, type QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";
import { status_options } from "./contants";

// "Paid Status" filters on computed due/paid/partially_paid/unpaid logic
// (status combined with balance/paid amounts) that the backend's generic
// list-filter mechanism can't express — so it's carried as the dedicated
// `payment_state` query param instead of the generic `filters` JSON blob,
// and must be pulled out of the Add Filter rows before those are sent.
function splitPaidStatusFilter(queryFilters: QueryFilterRow[]) {
  const paidStatusRow = queryFilters.find((row) => row.field === "paidStatus");
  const restFilters = queryFilters.filter((row) => row.field !== "paidStatus");
  return { paidStatus: paidStatusRow?.value, restFilters };
}

export function Billing({
  apiSession,
  loadLiveData,
  liveInvoices,
  branchId,
}: any) {
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [creditNotePrompt, setCreditNotePrompt] = useState<any>(null);
  const [adjustmentPrompt, setAdjustmentPrompt] = useState<{
    invoice: any;
    type: string;
  } | null>(null);
  const [invoiceActionPrompt, setInvoiceActionPrompt] = useState<{
    kind: "cancel" | "amend";
    invoice: any;
  } | null>(null);
  const [regeneratePrompt, setRegeneratePrompt] = useState<any>(null);
  const [requestActionPrompt, setRequestActionPrompt] = useState<{
    kind: "approve" | "reject" | "execute";
    row: any;
  } | null>(null);
  const [filters, setFilters] = useState({
    query: "",
    fromDate: "",
    toDate: "",
  });
  const [sort, setSort] = useState<SortState | null>({
    key: "updated_at",
    dir: "desc",
  });
  const [queryFilters, setQueryFilters] = useState<QueryFilterRow[]>([]);
  const [filterOptions, setFilterOptions] = useState<
    Record<string, QueryFieldOption[]>
  >({});
  const [page, setPage] = useState(1);
  const [invoiceRows, setInvoiceRows] = useState<any[]>([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [paidStatusCounts, setPaidStatusCounts] = useState<Record<string, number>>({});
  const [invoiceSummary, setInvoiceSummary] = useState<any>(null);
  const [invoiceListLoading, setInvoiceListLoading] = useState(false);
  const invoiceLoadSequence = useRef(0);
  const invoiceSummaryLoadSequence = useRef(0);
  const userPermissions = apiSession?.user?.permissions || [];
  const hasPermission = (...keys: string[]) =>
    Boolean(
      apiSession?.user?.is_super_admin ||
      userPermissions.includes("*") ||
      keys.some((key) => userPermissions.includes(key)),
    );
  const canViewRevenueSummary = hasPermission(
    "billing.manage",
    "reports.revenue.read",
  );
  const canViewSettlementSummary = hasPermission(
    "billing.manage",
    "settlements.read",
  );
  const { patientMap } = usePatientReferencesQuery(
    apiSession,
    invoiceRows.map((invoice: any) => invoice.patient_id),
  );

  async function loadInvoicePage(
    nextPage = page,
    filterOverrides: Partial<typeof filters> = {},
    nextQueryFilters = queryFilters,
    nextSort = sort,
  ) {
    if (!apiSession) return;
    const requestSequence = ++invoiceLoadSequence.current;
    const effectiveFilters = { ...filters, ...filterOverrides };
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((nextPage - 1) * pageSize),
    });
    if (branchId) params.set("branch_id", branchId);
    if (effectiveFilters.query.trim())
      params.set("q", effectiveFilters.query.trim());
    const { paidStatus, restFilters } = splitPaidStatusFilter(nextQueryFilters);
    if (paidStatus) params.set("payment_state", paidStatus);
    if (effectiveFilters.fromDate)
      params.set("from_date", effectiveFilters.fromDate);
    if (effectiveFilters.toDate) params.set("to_date", effectiveFilters.toDate);
    if (restFilters.length) params.set("filters", JSON.stringify(restFilters));
    if (nextSort) params.set("sort", JSON.stringify(nextSort));
    setInvoiceListLoading(true);
    try {
      const result = await fetchInvoicePage(apiSession, params);
      if (requestSequence !== invoiceLoadSequence.current) return;
      setInvoiceRows(Array.isArray(result?.items) ? result.items : []);
      setInvoiceTotal(Number(result?.total || 0));
    } catch (err: any) {
      if (requestSequence !== invoiceLoadSequence.current) return;
      setMessage(err.message || "Could not load invoices.");
    } finally {
      if (requestSequence === invoiceLoadSequence.current)
        setInvoiceListLoading(false);
    }
  }

  async function loadPaidStatusCounts(
    filterOverrides: Partial<typeof filters> = {},
    nextQueryFilters = queryFilters,
  ) {
    if (!apiSession) return;
    const effectiveFilters = { ...filters, ...filterOverrides };
    const countStatuses = status_options.map((option) => option.value);
    const { restFilters } = splitPaidStatusFilter(nextQueryFilters);
    const entries = await Promise.all(
      countStatuses.map(async (status) => {
        const params = new URLSearchParams({ limit: "1", offset: "0" });
        if (branchId) params.set("branch_id", branchId);
        if (effectiveFilters.query.trim())
          params.set("q", effectiveFilters.query.trim());
        if (status !== "all") params.set("payment_state", status);
        if (effectiveFilters.fromDate)
          params.set("from_date", effectiveFilters.fromDate);
        if (effectiveFilters.toDate)
          params.set("to_date", effectiveFilters.toDate);
        if (restFilters.length) params.set("filters", JSON.stringify(restFilters));
        const result = await fetchInvoicePage(apiSession, params).catch(
          () => ({ total: 0 }),
        );
        return [status, Number(result?.total || 0)] as const;
      }),
    );
    setPaidStatusCounts(Object.fromEntries(entries));
  }

  async function loadInvoiceSummary(
    filterOverrides: Partial<typeof filters> = {},
    nextQueryFilters = queryFilters,
  ) {
    if (!apiSession) return;
    const requestSequence = ++invoiceSummaryLoadSequence.current;
    const effectiveFilters = { ...filters, ...filterOverrides };
    const params = new URLSearchParams();
    if (branchId) params.set("branch_id", branchId);
    if (effectiveFilters.query.trim())
      params.set("q", effectiveFilters.query.trim());
    const { paidStatus, restFilters } = splitPaidStatusFilter(nextQueryFilters);
    if (paidStatus && paidStatus !== "all")
      params.set("payment_state", paidStatus);
    if (effectiveFilters.fromDate)
      params.set("from_date", effectiveFilters.fromDate);
    if (effectiveFilters.toDate) params.set("to_date", effectiveFilters.toDate);
    if (restFilters.length) params.set("filters", JSON.stringify(restFilters));
    const summary = await fetchInvoiceSummary(apiSession, params).catch(
      () => null,
    );
    if (requestSequence === invoiceSummaryLoadSequence.current) {
      setInvoiceSummary(summary);
    }
  }

  async function loadInvoiceFilterOptions() {
    if (!apiSession) return;
    const params = new URLSearchParams();
    if (branchId) params.set("branch_id", branchId);
    const result = await fetchInvoiceFilterOptions(apiSession, params).catch(
      () => ({}),
    );
    setFilterOptions(result || {});
  }

  const { invoicePaymentOptions, defaultPaymentMethod } =
    usePaymentMethods(apiSession);

  const invoiceDeliveryStatus = useInvoiceDeliveryStatuses(
    apiSession,
    invoiceRows,
  );

  const {
    busy,
    message,
    setMessage,
    detail,
    setDetail,
    supplierOptions,
    detailLoading,
    sendInvoice,
    regenerateInvoiceDocument: regenerateInvoiceDocumentAction,
    openInvoiceDetail,
    collectPayment: collectPaymentAction,
    collectSplitPayment: collectSplitPaymentAction,
    applyMembershipBenefit,
    applyOffer,
    removeOffer,
    submitCreditNote: submitCreditNoteAction,
    openReceipt,
    updateInvoiceItemSupplier,
    submitInvoiceAction: runInvoiceAction,
    submitAdjustmentRequest: runAdjustmentRequest,
    submitRequestAction: runRequestAction,
  } = useBillingActions(apiSession, {
    refreshInvoices: () => loadInvoicePage(page),
    loadReports: loadInvoiceSummary,
    setSettlement: () => undefined,
    branchId,
  });

  const invoices = invoiceRows;
  const totalPages = Math.max(1, Math.ceil(invoiceTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const billingQueryFields = getBillingQueryFields({
    rows: invoices,
    filterOptions,
  });
  const invoicePageRows = invoices;

  const billingSchema = getBillingTableSchema({ filterOptions });

  const payableSettlement = Number(invoiceSummary?.settlement_amount || 0);
  const activePaymentState =
    splitPaidStatusFilter(queryFilters).paidStatus || "all";

  function selectPaymentState(paymentState: string) {
    const otherFilters = queryFilters.filter(
      (row) => row.field !== "paidStatus",
    );
    handleQueryFiltersChange(
      paymentState === "all"
        ? otherFilters
        : [
            ...otherFilters,
            {
              id: "invoice-payment-state-tab",
              field: "paidStatus",
              operator: "equals",
              value: paymentState,
            },
          ],
    );
  }

  useEffect(() => {
    setPage(1);
  }, [filters.query, filters.fromDate, filters.toDate, queryFilters]);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  useEffect(() => {
    if (!apiSession) return;
    const timer = window.setTimeout(() => {
      void loadInvoicePage(page);
      void loadPaidStatusCounts();
      void loadInvoiceSummary();
      void loadInvoiceFilterOptions();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    apiSession?.tenantId,
    branchId,
    page,
    filters.query,
    filters.fromDate,
    filters.toDate,
    queryFilters,
    sort,
  ]);
  useEffect(() => {
    if (!apiSession || typeof window === "undefined") return;
    const invoiceId =
      window.sessionStorage.getItem("medizinhub.billingInvoiceId") ||
      readNotificationTarget("invoice")?.resourceId;
    if (!invoiceId) return;
    window.sessionStorage.removeItem("medizinhub.billingInvoiceId");
    openInvoiceDetail({ id: invoiceId });
  }, [apiSession?.tenantId]);

  function updateFilter(key: string, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters({
      query: "",
      fromDate: "",
      toDate: "",
    });
    setQueryFilters([]);
    setSort(null);
    setPage(1);
  }

  function handleQueryFiltersChange(nextFilters: QueryFilterRow[]) {
    setQueryFilters(nextFilters);
    setPage(1);
    setMessage("");
  }

  function handleSortChange(nextSort: SortState | null) {
    setSort(nextSort);
    setPage(1);
    setMessage("");
  }

  async function refreshBillingData() {
    if (!apiSession) return;
    setMessage("");
    try {
      await Promise.all([
        loadLiveData(apiSession),
        loadInvoicePage(page),
        loadInvoiceSummary(),
        loadPaidStatusCounts(),
      ]);
      setMessage("Invoices refreshed.");
    } catch (err: any) {
      setMessage(err.message || "Could not refresh invoices.");
    }
  }

  function issueCreditNote(invoice: any) {
    setCreditNotePrompt(invoice);
  }

  async function submitCreditNote(reason: string) {
    const invoice = creditNotePrompt;
    if (!invoice || !reason) return;
    const ok = await submitCreditNoteAction(invoice, reason);
    if (ok) setCreditNotePrompt(null);
  }

  function cancelInvoice(invoice: any) {
    setInvoiceActionPrompt({ kind: "cancel", invoice });
  }

  function amendInvoice(invoice: any) {
    setInvoiceActionPrompt({ kind: "amend", invoice });
  }

  async function submitInvoiceAction(reason: string) {
    if (!invoiceActionPrompt || !reason) return;
    const { kind, invoice } = invoiceActionPrompt;
    const ok = await runInvoiceAction(invoice, kind, reason);
    if (ok) setInvoiceActionPrompt(null);
  }

  function requestAdjustment(invoice: any, type: string) {
    setAdjustmentPrompt({ invoice, type });
  }

  async function submitAdjustmentRequest(
    reason: string,
    amount: number | null,
  ) {
    if (!adjustmentPrompt || !reason) return;
    const { invoice, type } = adjustmentPrompt;
    const ok = await runAdjustmentRequest(invoice, type, reason, amount);
    if (ok) setAdjustmentPrompt(null);
  }

  function approveAdjustment(row: any) {
    setRequestActionPrompt({ kind: "approve", row });
  }

  function rejectAdjustment(row: any) {
    setRequestActionPrompt({ kind: "reject", row });
  }

  function executeAdjustment(row: any) {
    setRequestActionPrompt({ kind: "execute", row });
  }

  async function submitRequestAction(reason: string) {
    if (!requestActionPrompt) return;
    const { kind, row } = requestActionPrompt;
    if (kind === "reject" && !reason) return;
    const ok = await runRequestAction(row, kind, reason);
    if (ok) setRequestActionPrompt(null);
  }

  async function regenerateInvoiceDocument(reason: string) {
    const invoice = regeneratePrompt;
    if (!invoice) return;
    const ok = await regenerateInvoiceDocumentAction(invoice, reason);
    if (ok) setRegeneratePrompt(null);
  }

  async function collectPayment(invoice: any) {
    await collectPaymentAction(
      invoice,
      {
        amount: amounts[invoice.id],
        method: methods[invoice.id],
        reference: references[invoice.id],
      },
      defaultPaymentMethod,
    );
    setAmounts((current) => ({ ...current, [invoice.id]: "" }));
    setReferences((current) => ({ ...current, [invoice.id]: "" }));
  }

  async function collectSplitPayment(invoice: any, rows: any[]) {
    await collectSplitPaymentAction(invoice, rows, defaultPaymentMethod);
  }
  const invoiceColumns = getInvoiceColumns({
    safePage,
    patientMap,
    canCopyIds,
    openInvoiceDetail,
    detailLoading,
    invoiceDeliveryStatus,
  });

  if (!apiSession) {
    return (
      <Card>
        <h3 className="text-lg font-bold">Invoices / Billing</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required to view billing data.
        </p>
      </Card>
    );
  }

  if (detail) {
    return (
      <>
        <InvoiceDetailPage
          detail={detail}
          patient={patientMap.get(detail.invoice?.patient_id)}
          onClose={() => setDetail(null)}
          methods={methods}
          setMethods={setMethods}
          amounts={amounts}
          setAmounts={setAmounts}
          references={references}
          setReferences={setReferences}
          invoicePaymentOptions={invoicePaymentOptions}
          defaultPaymentMethod={defaultPaymentMethod}
          busy={busy}
          collectPayment={async (invoice: any) => {
            await collectPayment(invoice);
            await openInvoiceDetail(invoice);
          }}
          collectSplitPayment={collectSplitPayment}
          sendInvoice={sendInvoice}
          regenerateInvoice={() => setRegeneratePrompt(detail.invoice)}
          applyMembershipBenefit={applyMembershipBenefit}
          applyOffer={applyOffer}
          removeOffer={removeOffer}
          openReceipt={openReceipt}
          issueCreditNote={issueCreditNote}
          cancelInvoice={cancelInvoice}
          amendInvoice={amendInvoice}
          requestAdjustment={requestAdjustment}
          approveAdjustment={approveAdjustment}
          rejectAdjustment={rejectAdjustment}
          executeAdjustment={executeAdjustment}
          userPermissions={apiSession.user?.permissions || []}
          currentUser={apiSession.user}
          supplierOptions={supplierOptions}
          updateInvoiceItemSupplier={updateInvoiceItemSupplier}
          apiSession={apiSession}
        />
        {creditNotePrompt && (
          <ConfirmModal
            title={`Credit Note - ${creditNotePrompt.invoice_number}`}
            message="This will issue a credit note against this invoice for the outstanding balance."
            confirmLabel="Issue Credit Note"
            requireReason
            reasonLabel="Credit note reason"
            busy={busy === creditNotePrompt.id}
            onCancel={() => setCreditNotePrompt(null)}
            onConfirm={({ reason }) => submitCreditNote(reason)}
          />
        )}
        {adjustmentPrompt && (
          <ConfirmModal
            title={`Request ${adjustmentPrompt.type.replaceAll("_", " ")} - ${adjustmentPrompt.invoice.invoice_number}`}
            message={`Provide a reason for this ${adjustmentPrompt.type.replaceAll("_", " ")} request${
              adjustmentPrompt.type === "partial_refund" ||
              adjustmentPrompt.type === "discount"
                ? " and an amount"
                : ""
            }.`}
            confirmLabel="Submit Request"
            requireReason
            reasonLabel="Reason"
            requireAmount={
              adjustmentPrompt.type === "partial_refund" ||
              adjustmentPrompt.type === "discount"
            }
            amountLabel={
              adjustmentPrompt.type === "discount"
                ? "Discount amount"
                : "Refund amount"
            }
            busy={busy === `request-${adjustmentPrompt.invoice.id}`}
            onCancel={() => setAdjustmentPrompt(null)}
            onConfirm={({ reason, amount }) =>
              submitAdjustmentRequest(reason, amount)
            }
          />
        )}
        {regeneratePrompt && (
          <ConfirmModal
            title={`Regenerate Invoice PDF - ${regeneratePrompt.invoice_number}`}
            message="This creates a new permanent PDF version. Previously queued deliveries remain pinned to their original version."
            confirmLabel="Regenerate PDF"
            requireReason
            reasonLabel="Reason for regeneration"
            busy={busy === `regenerate-invoice-${regeneratePrompt.id}`}
            onCancel={() => setRegeneratePrompt(null)}
            onConfirm={({ reason }) => regenerateInvoiceDocument(reason)}
          />
        )}
        {invoiceActionPrompt && (
          <ConfirmModal
            title={
              invoiceActionPrompt.kind === "cancel"
                ? `Cancel Invoice - ${invoiceActionPrompt.invoice.invoice_number}`
                : `Amend Invoice - ${invoiceActionPrompt.invoice.invoice_number}`
            }
            message={
              invoiceActionPrompt.kind === "cancel"
                ? "This reverses the ledger and, for home care/visit bills, reopens the booking for editing."
                : "This reopens the invoice for editing."
            }
            confirmLabel={
              invoiceActionPrompt.kind === "cancel"
                ? "Cancel Invoice"
                : "Amend Invoice"
            }
            requireReason
            reasonLabel={
              invoiceActionPrompt.kind === "cancel"
                ? "Cancel reason"
                : "Amend reason"
            }
            busy={
              busy ===
              `${invoiceActionPrompt.kind}-${invoiceActionPrompt.invoice.id}`
            }
            onCancel={() => setInvoiceActionPrompt(null)}
            onConfirm={({ reason }) => submitInvoiceAction(reason)}
          />
        )}
        {requestActionPrompt && (
          <ConfirmModal
            title={
              requestActionPrompt.kind === "approve"
                ? "Approve Request"
                : requestActionPrompt.kind === "reject"
                  ? "Reject Request"
                  : "Execute Request"
            }
            message={
              requestActionPrompt.kind === "execute"
                ? `Execute ${String(requestActionPrompt.row.request_type).replaceAll("_", " ")} request?`
                : requestActionPrompt.kind === "approve"
                  ? "Approve this adjustment request? You may add an optional note."
                  : "Reject this adjustment request. A reason is required."
            }
            confirmLabel={
              requestActionPrompt.kind === "approve"
                ? "Approve"
                : requestActionPrompt.kind === "reject"
                  ? "Reject"
                  : "Execute"
            }
            requireReason={requestActionPrompt.kind === "reject"}
            showReason={requestActionPrompt.kind !== "execute"}
            reasonLabel={
              requestActionPrompt.kind === "approve"
                ? "Approval note (optional)"
                : "Reason"
            }
            busy={
              busy ===
              `${requestActionPrompt.kind}-${requestActionPrompt.row.id}`
            }
            onCancel={() => setRequestActionPrompt(null)}
            onConfirm={({ reason }) => submitRequestAction(reason)}
          />
        )}
      </>
    );
  }

  return (
    <div className="">
      <BreadcrumbSlot>
        <div className="flex items-center gap-2">
          <AdaptiveResultCount
            shown={invoicePageRows.length}
            total={invoiceTotal}
            noun="invoices"
          />
          <RefreshButton
            onRefresh={refreshBillingData}
            className="h-auto rounded-md px-2.5 py-1 text-[11px]"
          />
          <AdaptiveFilterTrigger
            schema={billingSchema}
            query={filters.query}
            setQuery={(value: string) => updateFilter("query", value)}
            filterValues={filters}
            onFilterChange={updateFilter}
            sort={sort}
            onSortChange={handleSortChange}
            showSort={false}
            onReset={clearFilters}
            queryFields={billingQueryFields}
            queryFilters={queryFilters}
            onQueryFiltersChange={handleQueryFiltersChange}
          >
            {/* <FormField label="From">
              <Input
                type="date"
                value={filters.fromDate}
                onChange={(event: any) =>
                  updateFilter("fromDate", event.target.value)
                }
              />
            </FormField>
            <FormField label="To">
              <Input
                type="date"
                value={filters.toDate}
                onChange={(event: any) =>
                  updateFilter("toDate", event.target.value)
                }
              />
            </FormField> */}
          </AdaptiveFilterTrigger>
          <AdaptiveSortTrigger
            fields={billingSchema.sortFields}
            sort={sort}
            onSortChange={handleSortChange}
          />
        </div>
      </BreadcrumbSlot>
      <div className="flex flex-col gap-3">
        <section className="order-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-brand">
              <ReceiptText className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-950">
                Invoice Workspace
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Invoices, collections and payment status in one workspace
              </p>
            </div>
          </div>
          <nav
            className="scrollbar-hidden flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
            aria-label="Invoice list sections"
          >
            {[
              {
                id: "all",
                label: "All Invoices",
                icon: ReceiptText,
              },
              { id: "due", label: "Due", icon: Clock3 },
              { id: "paid", label: "Paid", icon: BadgeCheck },
              {
                id: "partially_paid",
                label: "Partially Paid",
                icon: CircleDollarSign,
              },
              { id: "refunded", label: "Refunded", icon: RotateCcw },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activePaymentState === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => selectPaymentState(tab.id)}
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
                    {paidStatusCounts[tab.id] ?? 0}
                  </span>
                </button>
              );
            })}
          </nav>
        </section>

        {(canViewRevenueSummary || canViewSettlementSummary) && (
          <section className="order-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {canViewRevenueSummary && (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
                  <Clock3 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Due Collection</p>
                  <p className="text-xl font-black text-slate-950">{money(invoiceSummary?.due_amount)}</p>
                </div>
              </div>
            )}
            {canViewRevenueSummary && (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600">
                  <Percent className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Billing Discounts</p>
                  <p className="text-xl font-black text-slate-950">{money(invoiceSummary?.discount_amount)}</p>
                </div>
              </div>
            )}
            {canViewRevenueSummary && (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-600">
                  <CircleDollarSign className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Revenue</p>
                  <p className="text-xl font-black text-slate-950">{money(invoiceSummary?.revenue_amount)}</p>
                </div>
              </div>
            )}
            {canViewRevenueSummary && (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                  <BadgeCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Paid</p>
                  <p className="text-xl font-black text-slate-950">{money(invoiceSummary?.paid_amount)}</p>
                </div>
              </div>
            )}
            {canViewSettlementSummary && (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Landmark className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Settlement</p>
                  <p className="text-xl font-black text-slate-950">{money(payableSettlement)}</p>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="scrollbar-hidden order-3 overflow-auto rounded-lg border border-slate-200 bg-white">
          <DataTable
            columns={invoiceColumns}
            data={invoicePageRows}
            emptyMessage={
              invoiceListLoading
                ? "Loading invoices..."
                : invoiceTotal === 0
                  ? "No invoices yet."
                  : "No invoices match the selected filters."
            }
            emptyDescription="Invoices raised for consultations, lab, pharmacy, and home care will show up here."
            emptyIcon={ReceiptText}
            minBodyHeight={`${invoicePageRows.length > 0 ?'':'220px'}`}
            onRowClick={openInvoiceDetail}
            sort={sort ?? undefined}
            onSortChange={handleSortChange}
          />
        </div>
        <div className="order-4">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={invoiceTotal}
            onPage={setPage}
          />
        </div>
      </div>
    </div>
  );
}
