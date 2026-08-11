"use client";

import { useEffect, useRef, useState } from "react";
import {
  ActionButton,
  Badge,
  Button,
  Card,
  Input,
  RefreshButton,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { FilterSection } from "@/app/components/common/FilterSection";
import { readNotificationTarget } from "@/lib/notificationTarget";
import { Pagination } from "@/app/components/common/Pagination";
import {
  formatInvoiceDate,
  invoicePatientDueAmount,
  invoiceSource,
  invoiceSourceOptions,
} from "./helpers";
import { pageSize } from "@/utils/constants";
import { InvoiceDetailPage } from "./components/InvoiceDetailPage";
import { capitalizeFirst, displayDateTime, money } from "@/utils/helper";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "@/app/components/common/CopyIdButton";
import { status_options } from "./contants";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";
import { useBillingActions, useBillingReports, usePaymentMethods } from "./api";
import {
  fetchInvoicePage,
  fetchPendingConsultationInvoicePage,
} from "./api/billing.api";
import { Column } from "@/utils/types";
import { DataTable } from "@/app/components/common/DataTable";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";

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
    source: "all",
    paidStatus: "all",
    fromDate: "",
    toDate: "",
  });
  const [page, setPage] = useState(1);
  const [invoiceRows, setInvoiceRows] = useState<any[]>([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoiceListLoading, setInvoiceListLoading] = useState(false);
  const invoiceLoadSequence = useRef(0);
  const [pendingConsultationRows, setPendingConsultationRows] = useState<any[]>(
    [],
  );
  const [pendingConsultationTotal, setPendingConsultationTotal] = useState(0);
  const [pendingConsultationPage, setPendingConsultationPage] = useState(1);
  const [pendingConsultationLoading, setPendingConsultationLoading] =
    useState(false);
  const pendingConsultationLoadSequence = useRef(0);
  const userPermissions = apiSession?.user?.permissions || [];
  const hasPermission = (...keys: string[]) =>
    Boolean(
      apiSession?.user?.is_super_admin ||
      userPermissions.includes("*") ||
      keys.some((key) => userPermissions.includes(key)),
    );
  const canCreateInvoices = hasPermission(
    "billing.manage",
    "billing.create",
    "invoices.create",
  );
  const canViewRevenueSummary = hasPermission(
    "billing.manage",
    "reports.revenue.read",
  );
  const canViewSettlementSummary = hasPermission(
    "billing.manage",
    "settlements.read",
  );
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;

  const { patientMap } = usePatientReferencesQuery(
    apiSession,
    invoiceRows.map((invoice: any) => invoice.patient_id),
  );

  async function loadInvoicePage(
    nextPage = page,
    filterOverrides: Partial<typeof filters> = {},
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
    if (effectiveFilters.source !== "all")
      params.set("source", effectiveFilters.source);
    if (effectiveFilters.paidStatus !== "all")
      params.set("payment_state", effectiveFilters.paidStatus);
    if (effectiveFilters.fromDate)
      params.set("from_date", effectiveFilters.fromDate);
    if (effectiveFilters.toDate) params.set("to_date", effectiveFilters.toDate);
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

  async function loadPendingConsultationPage(
    nextPage = pendingConsultationPage,
  ) {
    if (!apiSession) return;
    const requestSequence = ++pendingConsultationLoadSequence.current;
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((nextPage - 1) * pageSize),
    });
    if (branchId) params.set("branch_id", branchId);
    setPendingConsultationLoading(true);
    try {
      const result = await fetchPendingConsultationInvoicePage(
        apiSession,
        params,
      );
      if (requestSequence !== pendingConsultationLoadSequence.current) return;
      const rows = Array.isArray(result?.items) ? result.items : [];
      setPendingConsultationRows(
        rows.map((row: any) => ({
          id: row.appointment_id,
          consultationId: row.consultation_id,
          branchId: row.branch_id,
          patientId: row.patient_id,
          patient: row.patient_name,
          doctorId: row.practitioner_id,
          doctor: row.practitioner_name || "Unassigned",
          token: row.token_number,
          appointmentDate: row.appointment_date,
          appointmentTime: row.appointment_time,
          consultationSignedAt: row.consultation_signed_at,
          consultationCreatedAt: row.consultation_created_at,
        })),
      );
      setPendingConsultationTotal(Number(result?.total || 0));
    } catch (err: any) {
      if (requestSequence !== pendingConsultationLoadSequence.current) return;
      setMessage(
        err.message || "Could not load pending consultation invoices.",
      );
    } finally {
      if (requestSequence === pendingConsultationLoadSequence.current) {
        setPendingConsultationLoading(false);
      }
    }
  }

  const { invoicePaymentOptions, defaultPaymentMethod } =
    usePaymentMethods(apiSession);

  const {
    dueReport,
    currentMonthDueReport,
    revenueReport,
    collectionReport,
    settlement,
    setSettlement,
    loadReports,
  } = useBillingReports(apiSession, {
    branchId,
    invoiceCount: (liveInvoices || []).length,
    monthStart,
    monthEnd,
    canViewRevenueSummary,
    canViewSettlementSummary,
  });

  const {
    busy,
    message,
    setMessage,
    detail,
    setDetail,
    supplierOptions,
    detailLoading,
    generateInvoice,
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
    finalizeSettlement,
  } = useBillingActions(apiSession, {
    loadLiveData,
    refreshInvoices: () => loadInvoicePage(page),
    refreshPendingConsultations: () =>
      loadPendingConsultationPage(pendingConsultationPage),
    loadReports,
    setSettlement,
    branchId,
  });

  const invoices = invoiceRows;
  const totalPages = Math.max(1, Math.ceil(invoiceTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const invoicePageRows = invoices;

  const signedReady = pendingConsultationRows;
  const pendingConsultationTotalPages = Math.max(
    1,
    Math.ceil(pendingConsultationTotal / pageSize),
  );
  const safePendingConsultationPage = Math.min(
    pendingConsultationPage,
    pendingConsultationTotalPages,
  );
  const payableSettlement = Number(
    settlement?.payable_settlement_amount ??
      settlement?.doctor_share_paid_basis ??
      settlement?.settlement_amount ??
      0,
  );
  const finalizedSettlement = Number(
    settlement?.finalized_settlement_amount ?? 0,
  );
  const settlementRecovery = Number(
    settlement?.settlement_recovery_amount ?? 0,
  );
  const canFinalizeSettlement =
    hasPermission("billing.manage") &&
    Boolean(settlement?.can_finalize ?? payableSettlement > 0);

  useEffect(() => {
    setPage(1);
  }, [
    filters.query,
    filters.source,
    filters.paidStatus,
    filters.fromDate,
    filters.toDate,
  ]);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  useEffect(() => {
    setPendingConsultationPage(1);
  }, [apiSession?.tenantId, branchId]);
  useEffect(() => {
    if (pendingConsultationPage !== safePendingConsultationPage) {
      setPendingConsultationPage(safePendingConsultationPage);
    }
  }, [pendingConsultationPage, safePendingConsultationPage]);
  useEffect(() => {
    if (!apiSession || !canCreateInvoices) return;
    void loadPendingConsultationPage(pendingConsultationPage);
  }, [
    apiSession?.tenantId,
    branchId,
    canCreateInvoices,
    pendingConsultationPage,
  ]);
  useEffect(() => {
    if (!apiSession) return;
    const timer = window.setTimeout(() => {
      void loadInvoicePage(page);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    apiSession?.tenantId,
    branchId,
    page,
    filters.query,
    filters.source,
    filters.paidStatus,
    filters.fromDate,
    filters.toDate,
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
      source: "all",
      paidStatus: "all",
      fromDate: "",
      toDate: "",
    });
  }

  async function refreshBillingData() {
    if (!apiSession) return;
    setMessage("");
    try {
      await Promise.all([
        loadLiveData(apiSession),
        loadInvoicePage(page),
        loadPendingConsultationPage(pendingConsultationPage),
        loadReports(true),
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

  const invoiceColumns: Column<any>[] = [
    {
      key: "index",
      header: "S.No",
      width: "60px",
      render: (_, index) => (safePage - 1) * pageSize + index + 1,
      cellClassName: "font-semibold text-slate-500 text-center",
    },
    {
      key: "invoice_number",
      header: "Invoice",
      width: "200px",
      render: (invoice) => (
        <>
          <div className="flex items-center gap-2">
            <b>{invoice.invoice_number}</b>
            <CopyIdButton
              value={invoice.id}
              label="Invoice ID"
              allowed={canCopyIds}
            />
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            {formatInvoiceDate(invoice)}
          </p>
        </>
      ),
    },
    {
      key: "invoice_date",
      className: "text-center",
      header: "Date",
      width: "100px",
      render: (invoice) => (
        <>
          <p className="text-sm ">{formatInvoiceDate(invoice)}</p>
        </>
      ),
    },
    {
      key: "source",
      header: "Source",
      width: "160px",
      className: "text-center",
      render: (invoice) => {
        const source = invoiceSource(invoice);

        return (
          <Badge
            tone={source.tone as any}
            className="table-status text-xs text-center "
          >
            {source.label}
          </Badge>
        );
      },
    },
    {
      key: "patient",
      header: "Patient",
      width: "120px",
      render: (invoice) => {
        const p: any = patientMap.get(invoice.patient_id);

        return (
          <div>
            {capitalizeFirst(invoice.patient_name || p?.name || p?.full_name || "Patient")}
            <PatientFlagBadges patient={p} className="mt-1" />
          </div>
        );
      },
      cellClassName: "font-medium",
    },
    {
      key: "status",
      header: "Status",
      className: "text-center",
      width: "120px",
      render: (invoice) => (
        <Badge
          tone={
            invoice.status === "paid"
              ? "green"
              : invoice.status === "partially_refunded" ||
                  invoice.status === "refunded"
                ? "blue"
                : invoice.status === "partially_paid"
                  ? "amber"
                  : invoice.status == "cancelled"
                    ? "red"
                    : "slate"
          }
          className="table-status text-xs text-center"
        >
          {capitalizeFirst(
            invoice.status === "partially_paid"
              ? "Partially Paid"
              : invoice.status === "partially_refunded"
                ? "Partially Refunded"
                : invoice.status,
          )}
        </Badge>
      ),
    },
    {
      key: "total_amount",
      header: "Total",
      width: "100px",
      render: (invoice) => money(invoice.total_amount),
      cellClassName: "font-semibold tabular-nums",
    },
    {
      key: "paid_amount",
      header: "Paid",
      width: "100px",
      render: (invoice) => money(invoice.paid_amount),
      cellClassName: "tabular-nums",
    },
    {
      key: "due",
      header: "Due",
      width: "100px",
      render: (invoice) => money(invoicePatientDueAmount(invoice)),
    },
    {
      key: "actions",
      header: "Actions",
      width: "120px",
      disableRowClick: true,
      render: (invoice) => (
        <ActionButton
          onClick={() => openInvoiceDetail(invoice)}
          disabled={detailLoading === invoice.id}
        >
          <ButtonLoader loading={detailLoading === invoice.id}>
            {detailLoading === invoice.id ? "Loading..." : "View"}
          </ButtonLoader>
        </ActionButton>
      ),
    },
  ];

  const consulationPendingColumns: Column<any>[] = [
    {
      key: "consultation",
      header: "Consultation",
      render: (a: any) => <span className="font-bold">{a.token || "-"}</span>,
    },
    {
      key: "patient",
      header: "Patient",
      render: (a: any) => <span className="font-semibold">{a.patient}</span>,
    },
    {
      key: "doctor",
      header: "Doctor",
      cellClassName: "text-slate-600",
      render: (a: any) =>
        a.doctor && a.doctor !== "Unassigned" ? a.doctor : "-",
    },
    {
      key: "date",
      header: "Date & Time",
      cellClassName: "whitespace-nowrap text-slate-600",
      render: (a: any) =>
        displayDateTime(
          a.consultationSignedAt ||
            a.consultationCreatedAt ||
            a.appointmentDate,
        ),
    },
    {
      key: "action",
      header: "Action",
      cellClassName: "text-right",
      disableRowClick: true,
      render: (a: any) => (
        <Button
          disabled={busy === a.id}
          onClick={() => generateInvoice(a)}
          className="save-button"
        >
          <ButtonLoader loading={busy === a.id}>
            {busy === a.id ? "Generating..." : "Generate Invoice"}
          </ButtonLoader>
        </Button>
      ),
    },
  ];

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
      {(canViewRevenueSummary || canViewSettlementSummary) && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {canViewRevenueSummary && (
            <Card>
              <p className="text-xs lg:text-sm text-slate-500">
                Due Collection
              </p>
              <p className="mt-1 text-xl lg:text-2xl font-bold">
                {money(dueReport?.total_due_amount)}
              </p>
              <p className="text-[10px] lg:text-xs text-slate-500">
                Current month {money(currentMonthDueReport?.total_due_amount)} ·
                Carried forward{" "}
                {money(
                  Math.max(
                    Number(dueReport?.total_due_amount || 0) -
                      Number(currentMonthDueReport?.total_due_amount || 0),
                    0,
                  ),
                )}
              </p>
              <p className="text-[10px] lg:text-xs text-slate-500">
                {dueReport?.invoice_count ?? 0} outstanding invoices
              </p>
            </Card>
          )}
          {canViewRevenueSummary && (
            <Card>
              <p className="text-xs lg:text-sm text-slate-500">
                Billing Discounts
              </p>
              <p className="mt-1 text-xl lg:text-2xl font-bold">
                {money(revenueReport?.total_discount_amount)}
              </p>
              <p className="text-[10px] lg:text-xs text-slate-500">
                Approved {money(revenueReport?.total_approved_discount_amount)}{" "}
                · Offers {money(revenueReport?.total_offer_discount_amount)} ·
                Membership{" "}
                {money(revenueReport?.total_membership_discount_amount)}
              </p>
            </Card>
          )}
          {canViewRevenueSummary && (
            <Card>
              <p className="text-xs lg:text-sm text-slate-500">Revenue</p>
              <p className="mt-1 text-xl lg:text-2xl font-bold">
                {money(
                  revenueReport?.total_billed_amount ??
                    revenueReport?.total_invoice_amount,
                )}
              </p>
              <p className="text-[10px] lg:text-xs text-slate-500">
                Current-month billed value
              </p>
            </Card>
          )}
          {canViewRevenueSummary && (
            <Card>
              <p className="text-xs lg:text-sm text-slate-500">Paid</p>
              <p className="mt-1 text-xl lg:text-2xl font-bold">
                {money(collectionReport?.net_collected_amount)}
              </p>
              <p className="text-[10px] lg:text-xs text-slate-500">
                Collected {money(collectionReport?.collected_amount)} · Refunds{" "}
                {money(collectionReport?.refunded_amount)}
              </p>
            </Card>
          )}
          {canViewSettlementSummary && (
            <Card>
              <p className="text-xs lg:text-sm text-slate-500">Settlement</p>
              <p className="mt-1 text-xl font-bold lg:text-2xl">
                {money(payableSettlement)}
              </p>
              <p className="text-[10px] lg:text-xs text-slate-500">
                {settlementRecovery > 0
                  ? `Recover ${money(settlementRecovery)} after refunds`
                  : finalizedSettlement > 0
                    ? `Finalized ${money(finalizedSettlement)}`
                    : "No finalized settlement yet"}
              </p>
              {canFinalizeSettlement ? (
                <button
                  type="button"
                  onClick={finalizeSettlement}
                  className="mt-2 rounded-lg border px-3 py-2 text-xs font-bold"
                  disabled={busy === "settlement"}
                >
                  <ButtonLoader loading={busy === "settlement"}>
                    {busy === "settlement" ? "Finalizing..." : "Finalize"}
                  </ButtonLoader>
                </button>
              ) : (
                <Badge
                  tone={
                    settlementRecovery > 0
                      ? "red"
                      : payableSettlement > 0
                        ? "amber"
                        : "green"
                  }
                  className="inline w-2/3 rounded-lg text-[11px] table-status lg:text-sm"
                >
                  {settlementRecovery > 0
                    ? "Recovery due"
                    : payableSettlement > 0
                      ? "Pending finalization"
                      : "Finalized"}
                </Badge>
              )}
            </Card>
          )}
        </div>
      )}

      {canCreateInvoices && (
        <Card className="mt-3">
          <h3 className="card-title font-bold">
            Pending Consultation Invoices
          </h3>
          <p className="card-desc text-slate-500">
            Reception can generate the consultation-fee invoice after the doctor
            signs the consultation. Lab, pharmacy, IP, and physiotherapy each
            have their own invoices created by those modules.
          </p>
          <StatusToast message={message} onClose={() => setMessage("")} />
          <div className="mt-4">
            <DataTable
              columns={consulationPendingColumns}
              data={signedReady}
              emptyMessage={
                pendingConsultationLoading
                  ? "Loading pending consultation invoices..."
                  : "All completed consultations already have invoices."
              }
            />
            <Pagination
              page={safePendingConsultationPage}
              totalPages={pendingConsultationTotalPages}
              total={pendingConsultationTotal}
              onPage={setPendingConsultationPage}
            />
          </div>
        </Card>
      )}

      <Card className="mt-3">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h3 className="card-title font-bold">Invoices & Payments</h3>
            <p className="card-desc text-slate-500">
              Track invoice source, patient dues, settlement share, and payment
              collection in one list.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={refreshBillingData} />
            <Badge tone="slate" className="normal-badge">
              Showing {invoicePageRows.length} of {invoiceTotal} invoices
            </Badge>
          </div>
        </div>
        <FilterSection
          title="Invoices"
          query={filters.query}
          setQuery={(value: string) => updateFilter("query", value)}
          searchPlaceholder="Invoice, patient, source"
          className="lg:grid-cols-6 xl:grid-cols-6"
          filters={[
            {
              key: "source",
              label: "Source",
              options: [
                { value: "all", label: "All sources" },
                ...invoiceSourceOptions.map((s) => ({
                  value: s.key,
                  label: s.label,
                })),
              ],
            },
            {
              key: "paidStatus",
              label: "Paid Status",
              options: status_options,
            },
          ]}
          filterValues={filters}
          onFilterChange={updateFilter}
          onReset={clearFilters}
        >
          <FormField label="From">
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
          </FormField>
        </FilterSection>
        <div className="scrollbar-hidden mt-4 overflow-auto rounded-2xl border border-slate-200">
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
            onRowClick={openInvoiceDetail}
          />
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={invoiceTotal}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
