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
import { FormField } from "@/app/components/FormElements";
import { apiFetch, apiUpload } from "@/lib/api";
import { readNotificationTarget } from "@/lib/notificationTarget";
import { paymentMethodOptions } from "@/lib/options";
import { Pagination } from "@/app/components/common/Pagination";
import {
  formatInvoiceDate,
  invoiceDateKey,
  invoicePaidStatus,
  invoiceSource,
  invoiceSourceKey,
} from "./helpers";
import { pageSize } from "@/utils/constants";
import { InvoiceDetailPage } from "./components/InvoiceDetailPage";
import {
  createInvoiceReceiptPdf,
  downloadInvoiceReceipt,
} from "./downloadInvoiceReceipt";
import { Column } from "../reports/types";
import { DataTable } from "../reports/components/DataTable";
import { displayDateTime, money } from "@/utils/helper";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "@/app/components/common/CopyIdButton";
import { status_options } from "./contants";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";

export function Billing({
  apiSession,
  loadLiveData,
  appointments,
  liveInvoices,
  branchId,
}: any) {
  const maxInvoicePdfUploadBytes = 5 * 1024 * 1024;
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, string>>({});
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<string[]>(
    paymentMethodOptions.map((option) => option.value),
  );
  const [references, setReferences] = useState<Record<string, string>>({});
  const [dueReport, setDueReport] = useState<any>(null);
  const [currentMonthDueReport, setCurrentMonthDueReport] = useState<any>(null);
  const [revenueReport, setRevenueReport] = useState<any>(null);
  const [collectionReport, setCollectionReport] = useState<any>(null);
  const [settlement, setSettlement] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [supplierOptions, setSupplierOptions] = useState<Record<string, any[]>>(
    {},
  );
  const [detailLoading, setDetailLoading] = useState("");
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
  const monthlyReportParams = new URLSearchParams({
    from_date: monthStart,
    to_date: monthEnd,
  });
  if (branchId) monthlyReportParams.set("branch_id", branchId);
  const monthlyReportQuery = monthlyReportParams.toString();
  const branchReportQuery = branchId
    ? `?branch_id=${encodeURIComponent(branchId)}`
    : "";

  const { patientMap } = usePatientReferencesQuery(
    apiSession,
    (liveInvoices || []).map((invoice: any) => invoice.patient_id),
  );

  useEffect(() => {
    let alive = true;
    apiFetch(
      "/settings/resolve?module=payment&key=payment.methods_enabled",
      apiSession,
    )
      .then((row: any) => {
        const values = Array.isArray(row?.value) ? row.value : [];
        const allowed = new Set<string>(
          paymentMethodOptions.map((option) => option.value),
        );
        const filtered = values.filter((value: string) => allowed.has(value));
        if (alive && filtered.length) setEnabledPaymentMethods(filtered);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [apiSession]);
  const invoicePaymentOptions = useMemo(() => {
    const selected = new Set(enabledPaymentMethods);
    const rows = paymentMethodOptions.filter((option) =>
      selected.has(option.value),
    );
    return rows.length ? rows : paymentMethodOptions;
  }, [enabledPaymentMethods]);
  const defaultPaymentMethod = invoicePaymentOptions[0]?.value || "cash";
  const invoices = useMemo(
    () =>
      [...(liveInvoices || [])].sort(
        (a: any, b: any) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime(),
      ),
    [liveInvoices],
  );
  const sourceOptions = useMemo(() => {
    const seen = new Set<string>();
    return invoices
      .map((invoice: any) => ({
        key: invoiceSourceKey(invoice),
        ...invoiceSource(invoice),
      }))
      .filter((source: any) => {
        if (seen.has(source.key)) return false;
        seen.add(source.key);
        return true;
      });
  }, [invoices]);
  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice: any) => {
        const source = invoiceSource(invoice);
        const patient: any = patientMap.get(invoice.patient_id);
        const haystack = [
          invoice.invoice_number,
          invoice.patient_name,
          invoice.patient_mobile,
          patient?.name,
          patient?.full_name,
          patient?.patient_number,
          patient?.mobile,
          patient?.alternate_mobile,
          patient?.guardian_mobile,
          patient?.guardianMobile,
          source.label,
          invoice.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const query = String(filters.query || "")
          .trim()
          .toLowerCase();
        if (query && !haystack.includes(query)) return false;
        if (
          filters.source !== "all" &&
          invoiceSourceKey(invoice) !== filters.source
        )
          return false;
        if (filters.paidStatus === "due") {
          if (Number(invoice.balance_amount || 0) <= 0) return false;
        } else if (
          filters.paidStatus !== "all" &&
          invoicePaidStatus(invoice) !== filters.paidStatus
        )
          return false;
        const dateKey = invoiceDateKey(invoice);
        if (filters.fromDate && (!dateKey || dateKey < filters.fromDate))
          return false;
        if (filters.toDate && (!dateKey || dateKey > filters.toDate))
          return false;
        return true;
      }),
    [filters, invoices, patientMap],
  );
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const invoicePageRows = filteredInvoices.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const consultationInvoices = invoices.filter((i: any) => {
    const key = invoiceSourceKey(i);
    return key === "consultation";
  });
  const invoicedConsultations = new Set(
    consultationInvoices.map((i: any) => i.consultation_id).filter(Boolean),
  );
  const invoicedAppointments = new Set(
    consultationInvoices
      .filter((i: any) => i.consultation_id)
      .map((i: any) => i.appointment_id)
      .filter(Boolean),
  );
  const signedReady = appointments.filter((a: any) => {
    const status = String(
      a.consultationStatus || a.consultation_status || "",
    ).toLowerCase();
    const consultationId = a.consultationId || a.consultation_id;
    return (
      consultationId &&
      status === "signed" &&
      !invoicedConsultations.has(consultationId) &&
      !invoicedAppointments.has(a.id)
    );
  });
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
    if (apiSession) loadReports();
  }, [
    apiSession?.tenantId,
    invoices.length,
    branchId,
    monthStart,
    monthEnd,
    canViewRevenueSummary,
    canViewSettlementSummary,
  ]);
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
    if (!apiSession || typeof window === "undefined") return;
    const invoiceId =
      window.sessionStorage.getItem("medizinhub.billingInvoiceId") ||
      readNotificationTarget("invoice")?.resourceId;
    if (!invoiceId) return;
    window.sessionStorage.removeItem("medizinhub.billingInvoiceId");
    openInvoiceDetail({ id: invoiceId });
  }, [apiSession?.tenantId]);
  useEffect(() => {
    const invoiceId = detail?.invoice?.id;
    if (!apiSession || !invoiceId) return;
    let active = true;
    let timer: number | null = null;
    const shouldPollDelivery = (delivery: any) =>
      ["queued", "processing"].includes(
        String(delivery?.status || "").toLowerCase(),
      );
    const refreshDelivery = async () => {
      const delivery = await apiFetch(
        `/billing/invoices/${encodeURIComponent(invoiceId)}/delivery`,
        apiSession,
      )
        .catch(() => null);
      if (!active || !delivery) return false;
      setDetail((current: any) =>
        current?.invoice?.id === invoiceId
          ? { ...current, invoice_delivery: delivery }
          : current,
      );
      return shouldPollDelivery(delivery);
    };
    const pollDelivery = () => {
      void refreshDelivery().then((keepPolling) => {
        if (active && keepPolling) {
          timer = window.setTimeout(pollDelivery, 5000);
        }
      });
    };
    pollDelivery();
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [apiSession?.tenantId, detail?.invoice?.id]);

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

  async function loadReports() {
    if (!apiSession) return;
    const [due, currentMonthDue, revenue, collections, summary] =
      await Promise.all([
      canViewRevenueSummary
        ? apiFetch(
            `/billing/reports/due-collection${branchReportQuery}`,
            apiSession,
          ).catch(() => null)
        : Promise.resolve(null),
      canViewRevenueSummary
        ? apiFetch(
            `/billing/reports/due-collection?${monthlyReportQuery}`,
            apiSession,
          ).catch(() => null)
        : Promise.resolve(null),
      canViewRevenueSummary
        ? apiFetch(
            `/billing/reports/revenue?group_by=doctor&${monthlyReportQuery}`,
            apiSession,
          ).catch(() => null)
        : Promise.resolve(null),
      canViewRevenueSummary
        ? apiFetch(
            `/billing/reports/collections?${monthlyReportQuery}`,
            apiSession,
          ).catch(() => null)
        : Promise.resolve(null),
      canViewSettlementSummary
        ? apiFetch(
            `/billing/doctor-settlements/summary${branchReportQuery}`,
            apiSession,
          ).catch(() => null)
        : Promise.resolve(null),
    ]);
    setDueReport(due);
    setCurrentMonthDueReport(currentMonthDue);
    setRevenueReport(revenue);
    setCollectionReport(collections);
    setSettlement(summary);
  }

  async function refreshBillingData() {
    if (!apiSession) return;
    setMessage("");
    try {
      await loadLiveData(apiSession);
      await loadReports();
      setMessage("Invoices refreshed.");
    } catch (err: any) {
      setMessage(err.message || "Could not refresh invoices.");
    }
  }

  async function generateInvoice(a: any) {
    if (!apiSession) return;
    setBusy(a.id);
    setMessage("");
    try {
      const row = await apiFetch(
        "/billing/invoices/from-consultation",
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            consultation_id: a.consultationId,
            created_by_user_id: apiSession.user?.id,
          }),
        },
      );
      await loadLiveData(apiSession);
      await loadReports();
      setDetail(row);
      setMessage(
        `Invoice ${row.invoice?.invoice_number || ""} generated for ${a.patient}.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not generate invoice.");
    } finally {
      setBusy("");
    }
  }

  async function sendInvoice(
    invoice: any,
    automatic = false,
    channel: "whatsapp" | "email" = "whatsapp",
  ) {
    if (!apiSession || !invoice?.id) return;
    if (!automatic) {
      setBusy(`send-invoice-${channel}-${invoice.id}`);
      setMessage("");
    }
    try {
      let artifact = await apiFetch(
        `/billing/invoices/${encodeURIComponent(invoice.id)}/document`,
        apiSession,
      );
      if (!artifact?.exists) {
        const { blob, filename } = await createInvoiceReceiptPdf(
          invoice.id,
          apiSession,
        );
        if (blob.size > maxInvoicePdfUploadBytes) {
          throw new Error(
            `The generated invoice PDF is ${(blob.size / (1024 * 1024)).toFixed(1)} MB. The maximum allowed size is 5 MB.`,
          );
        }
        const form = new FormData();
        form.append("file", blob, filename);
        artifact = await apiUpload(
          `/billing/invoices/${encodeURIComponent(invoice.id)}/document/finalize`,
          apiSession,
          form,
        );
      }
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `invoice-send-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await apiFetch(
        `/billing/invoices/${encodeURIComponent(invoice.id)}/send`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            channel,
            idempotency_key: idempotencyKey,
          }),
        },
      );
      const deliveries = await apiFetch(
        `/billing/invoices/${encodeURIComponent(invoice.id)}/deliveries`,
        apiSession,
      ).catch(() => []);
      setDetail((current: any) =>
        current?.invoice?.id === invoice.id
          ? {
              ...current,
              ...(channel === "whatsapp"
                ? { invoice_delivery: result }
                : {}),
              invoice_deliveries: deliveries,
              invoice_document: result?.artifact || artifact,
            }
          : current,
      );
      if (!automatic) {
        setMessage(
          result?.message ||
            `Invoice ${invoice.invoice_number} queued for ${channel} delivery.`,
        );
      }
      return result;
    } catch (err: any) {
      if (
        automatic &&
        Number(err?.status) === 503 &&
        String(err?.detail || err?.message || "").includes(
          "Permanent invoice delivery is temporarily disabled",
        )
      ) {
        return { disabled: true };
      }
      if (automatic) throw err;
      setMessage(err.message || "Could not send the invoice.");
      return null;
    } finally {
      if (!automatic) setBusy("");
    }
  }

  async function regenerateInvoiceDocument(reason: string) {
    const invoice = regeneratePrompt;
    if (!apiSession || !invoice?.id) return;
    setBusy(`regenerate-invoice-${invoice.id}`);
    setMessage("");
    try {
      const current = await apiFetch(
        `/billing/invoices/${encodeURIComponent(invoice.id)}/document`,
        apiSession,
      );
      if (!current?.exists) {
        throw new Error("Finalize the invoice before regenerating its PDF.");
      }
      const { blob, filename } = await createInvoiceReceiptPdf(
        invoice.id,
        apiSession,
      );
      if (blob.size > maxInvoicePdfUploadBytes) {
        throw new Error("The regenerated invoice PDF exceeds the 5 MB limit.");
      }
      const form = new FormData();
      form.append("file", blob, filename);
      form.append("reason", reason);
      form.append("expected_version", String(current.version));
      const artifact = await apiUpload(
        `/billing/invoices/${encodeURIComponent(invoice.id)}/document/regenerate`,
        apiSession,
        form,
      );
      setDetail((value: any) =>
        value?.invoice?.id === invoice.id
          ? { ...value, invoice_document: artifact }
          : value,
      );
      setRegeneratePrompt(null);
      setMessage(
        `Invoice PDF regenerated as version ${artifact.version}. Existing queued deliveries still use their original version.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not regenerate the invoice PDF.");
    } finally {
      setBusy("");
    }
  }

  async function openInvoiceDetail(invoice: any) {
    if (!apiSession) return;
    setDetailLoading(invoice.id);
    setMessage("");
    try {
      const row = await apiFetch(`/billing/invoices/${invoice.id}`, apiSession);
      const delivery = await apiFetch(
        `/billing/invoices/${encodeURIComponent(invoice.id)}/delivery`,
        apiSession,
      ).catch(() => ({ status: "not_sent" }));
      const document = await apiFetch(
        `/billing/invoices/${encodeURIComponent(invoice.id)}/document`,
        apiSession,
      ).catch(() => ({ exists: false }));
      const deliveries = await apiFetch(
        `/billing/invoices/${encodeURIComponent(invoice.id)}/deliveries`,
        apiSession,
      ).catch(() => []);
      setDetail({
        ...row,
        invoice_delivery: delivery,
        invoice_deliveries: deliveries,
        invoice_document: document,
      });
      await loadInvoiceSupplierOptions(row);
    } catch (err: any) {
      setMessage(err.message || "Could not load invoice details.");
    } finally {
      setDetailLoading("");
    }
  }
  async function loadInvoiceSupplierOptions(row: any) {
    if (!apiSession || !row?.invoice?.lab_order_id) {
      setSupplierOptions({});
      return;
    }
    const optionRows = await Promise.all(
      (row.items || []).map((item: any) =>
        apiFetch(
          `/billing/invoices/${row.invoice.id}/items/${item.id}/supplier-options`,
          apiSession,
        )
          .then((options: any) => [
            item.id,
            Array.isArray(options) ? options : [],
          ])
          .catch(() => [item.id, []]),
      ),
    );
    setSupplierOptions(Object.fromEntries(optionRows));
  }

  async function collectPayment(invoice: any) {
    if (!apiSession) return;
    const amount = Number(amounts[invoice.id] || invoice.balance_amount || 0);
    if (!amount) {
      setMessage("Enter payment amount.");
      return;
    }
    setBusy(invoice.id);
    setMessage("");
    try {
      const paymentResult = await apiFetch(`/billing/invoices/${invoice.id}/payments`, apiSession, {
        method: "POST",
        body: JSON.stringify({
          method: methods[invoice.id] || defaultPaymentMethod,
          amount,
          reference_number: references[invoice.id] || null,
          collected_by_user_id: apiSession.user?.id,
        }),
      });
      await loadLiveData(apiSession);
      await loadReports();
      setAmounts({ ...amounts, [invoice.id]: "" });
      setReferences({ ...references, [invoice.id]: "" });
      if (
        String(paymentResult?.invoice?.status || "").toLowerCase() === "paid" &&
        Number(paymentResult?.invoice?.balance_amount || 0) <= 0
      ) {
        try {
          const delivery = await sendInvoice(paymentResult.invoice, true);
          setMessage(
            delivery?.disabled
              ? "Payment recorded. Automatic invoice delivery is temporarily disabled."
              : `Payment recorded and invoice ${invoice.invoice_number} queued for delivery.`,
          );
        } catch (deliveryError: any) {
          setMessage(
            `Payment recorded, but automatic invoice delivery failed: ${
              deliveryError?.message || "Could not prepare the invoice PDF."
            }`,
          );
        }
      } else {
        setMessage(`Payment recorded for ${invoice.invoice_number}.`);
      }
    } catch (err: any) {
      setMessage(err.message || "Could not record payment.");
    } finally {
      setBusy("");
    }
  }

  async function collectSplitPayment(invoice: any, rows: any[]) {
    if (!apiSession) return;
    const valid = (rows || [])
      .map((row) => ({
        method: row.method || defaultPaymentMethod,
        amount: Number(row.amount || 0),
        reference_number: row.reference?.trim() ? row.reference.trim() : null,
      }))
      .filter((row) => row.amount > 0);
    if (!valid.length) {
      setMessage("Enter at least one payment amount.");
      return;
    }
    const total = valid.reduce((sum, row) => sum + row.amount, 0);
    const balance = Number(invoice.balance_amount || 0);
    if (total > balance) {
      setMessage(
        `Total ${money(total)} exceeds balance due ${money(balance)}.`,
      );
      return;
    }
    setBusy(invoice.id);
    setMessage("");
    try {
      let paymentResult: any = null;
      for (const row of valid) {
        paymentResult = await apiFetch(`/billing/invoices/${invoice.id}/payments`, apiSession, {
          method: "POST",
          body: JSON.stringify({
            ...row,
            collected_by_user_id: apiSession.user?.id,
          }),
        });
      }
      await loadLiveData(apiSession);
      await loadReports();
      await openInvoiceDetail(invoice);
      const modes =
        valid.length > 1 ? `${valid.length} payment modes` : valid[0].method;
      if (
        String(paymentResult?.invoice?.status || "").toLowerCase() === "paid" &&
        Number(paymentResult?.invoice?.balance_amount || 0) <= 0
      ) {
        try {
          const delivery = await sendInvoice(paymentResult.invoice, true);
          setMessage(
            delivery?.disabled
              ? `Recorded ${money(total)} (${modes}); automatic invoice delivery is temporarily disabled.`
              : `Recorded ${money(total)} (${modes}); invoice queued for delivery.`,
          );
        } catch (deliveryError: any) {
          setMessage(
            `Payment recorded, but automatic invoice delivery failed: ${
              deliveryError?.message || "Could not prepare the invoice PDF."
            }`,
          );
        }
      } else {
        setMessage(
          `Recorded ${money(total)} (${modes}) for ${invoice.invoice_number}.`,
        );
      }
    } catch (err: any) {
      setMessage(err.message || "Could not record payment.");
    } finally {
      setBusy("");
    }
  }

  async function applyMembershipBenefit(invoice: any) {
    if (!apiSession) return;
    setBusy(`membership-${invoice.id}`);
    setMessage("");
    try {
      const row = await apiFetch(
        `/billing/invoices/${invoice.id}/membership-benefit/apply`,
        apiSession,
        { method: "POST" },
      );
      setDetail(row);
      await loadLiveData(apiSession);
      await loadReports();
      setMessage(`Membership benefit applied to ${invoice.invoice_number}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not apply membership benefit.");
    } finally {
      setBusy("");
    }
  }

  async function issueCreditNote(invoice: any) {
    if (!apiSession) return;
    setCreditNotePrompt(invoice);
  }

  async function submitCreditNote(reason: string) {
    const invoice = creditNotePrompt;
    if (!apiSession || !invoice || !reason) return;
    setBusy(invoice.id);
    try {
      await apiFetch(
        `/billing/invoices/${invoice.id}/credit-notes`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            amount: Math.max(1, invoice.balance_amount || invoice.total_amount),
            reason,
            created_by_user_id: apiSession.user?.id,
          }),
        },
      );
      await loadLiveData(apiSession);
      await loadReports();
      await openInvoiceDetail(invoice);
      setMessage(`Credit note issued for ${invoice.invoice_number}.`);
      setCreditNotePrompt(null);
    } catch (err: any) {
      setMessage(err.message || "Could not issue credit note.");
    } finally {
      setBusy("");
    }
  }

  async function openReceipt(invoice: any) {
    if (!invoice?.id || !apiSession) return;
    setBusy(`receipt-${invoice.id}`);
    setMessage("");
    try {
      await downloadInvoiceReceipt(invoice.id, apiSession);
    } catch (err: any) {
      setMessage(err.message || "Could not generate the invoice PDF.");
    } finally {
      setBusy("");
    }
  }

  async function updateInvoiceItemSupplier(
    invoice: any,
    item: any,
    supplierId: string,
  ) {
    if (!apiSession) return;
    setBusy(`supplier-${item.id}`);
    setMessage("");
    try {
      const row = await apiFetch(
        `/billing/invoices/${invoice.id}/items/${item.id}/supplier`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({ supplier_id: supplierId || null }),
        },
      );
      setDetail(row);
      await loadInvoiceSupplierOptions(row);
      setMessage("Supplier updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update supplier.");
    } finally {
      setBusy("");
    }
  }

  async function cancelInvoice(invoice: any) {
    if (!apiSession) return;
    setInvoiceActionPrompt({ kind: "cancel", invoice });
  }

  async function amendInvoice(invoice: any) {
    if (!apiSession) return;
    setInvoiceActionPrompt({ kind: "amend", invoice });
  }

  async function submitInvoiceAction(reason: string) {
    if (!apiSession || !invoiceActionPrompt || !reason) return;
    const { kind, invoice } = invoiceActionPrompt;
    setBusy(`${kind}-${invoice.id}`);
    setMessage("");
    try {
      const row = await apiFetch(
        `/billing/invoices/${invoice.id}/${kind}`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({ reason, actor_user_id: apiSession.user?.id }),
        },
      );
      setDetail(row);
      await loadLiveData(apiSession);
      await loadReports();
      setMessage(
        kind === "cancel"
          ? `Invoice ${invoice.invoice_number} cancelled and ledger reversed.`
          : `Invoice ${invoice.invoice_number} amended and reopened.`,
      );
      setInvoiceActionPrompt(null);
    } catch (err: any) {
      setMessage(err.message || `Could not ${kind} invoice.`);
    } finally {
      setBusy("");
    }
  }

  async function requestAdjustment(invoice: any, type: string) {
    if (!apiSession) return;
    setAdjustmentPrompt({ invoice, type });
  }

  async function submitAdjustmentRequest(reason: string, amount: number | null) {
    if (!apiSession || !adjustmentPrompt || !reason) return;
    const { invoice, type } = adjustmentPrompt;
    setBusy(`request-${invoice.id}`);
    setMessage("");
    try {
      const row = await apiFetch(
        `/billing/invoices/${invoice.id}/adjustment-requests`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            request_type: type,
            amount,
            reason,
            requested_by_user_id: apiSession.user?.id,
          }),
        },
      );
      await openInvoiceDetail(invoice);
      setMessage(
        `${String(row.request_type).replaceAll("_", " ")} request raised.`,
      );
      setAdjustmentPrompt(null);
    } catch (err: any) {
      setMessage(err.message || "Could not raise request.");
    } finally {
      setBusy("");
    }
  }

  async function approveAdjustment(row: any) {
    if (!apiSession) return;
    setRequestActionPrompt({ kind: "approve", row });
  }

  async function rejectAdjustment(row: any) {
    if (!apiSession) return;
    setRequestActionPrompt({ kind: "reject", row });
  }

  async function executeAdjustment(row: any) {
    if (!apiSession) return;
    setRequestActionPrompt({ kind: "execute", row });
  }

  async function submitRequestAction(reason: string) {
    if (!apiSession || !requestActionPrompt) return;
    const { kind, row } = requestActionPrompt;
    if (kind === "reject" && !reason) return;
    setBusy(`${kind}-${row.id}`);
    setMessage("");
    try {
      if (kind === "execute") {
        const next = await apiFetch(
          `/billing/adjustment-requests/${row.id}/execute`,
          apiSession,
          {
            method: "POST",
            body: JSON.stringify({ actor_user_id: apiSession.user?.id }),
          },
        );
        setDetail(next);
        await loadLiveData(apiSession);
        await loadReports();
        setMessage("Request executed and ledger updated.");
      } else {
        await apiFetch(
          `/billing/adjustment-requests/${row.id}/${kind}`,
          apiSession,
          {
            method: "POST",
            body: JSON.stringify({
              reason: reason || null,
              actor_user_id: apiSession.user?.id,
            }),
          },
        );
        if (detail?.invoice) await openInvoiceDetail(detail.invoice);
        setMessage(kind === "approve" ? "Request approved." : "Request rejected.");
      }
      setRequestActionPrompt(null);
    } catch (err: any) {
      setMessage(err.message || `Could not ${kind} request.`);
    } finally {
      setBusy("");
    }
  }

  async function finalizeSettlement() {
    if (!apiSession) return;
    setBusy("settlement");
    try {
      const saved = await apiFetch(
        "/billing/doctor-settlements/finalize",
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            finalized_by_user_id: apiSession.user?.id,
            branch_id: branchId || null,
          }),
        },
      );
      setSettlement(saved);
      await loadReports();
      setMessage(
        `Doctor settlement finalized for ${money(saved.settlement_amount)}.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not finalize settlement.");
    } finally {
      setBusy("");
    }
  }
  const invoiceColumns: Column<any>[] = [
    {
      key: "index",
      header: "#",
      width: "60px",
      render: (_, index) => (safePage - 1) * pageSize + index + 1,
      cellClassName: "font-semibold text-slate-500",
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
      key: "source",
      header: "Source",
      width: "150px",
      render: (invoice) => {
        const source = invoiceSource(invoice);

        return (
          <Badge
            tone={source.tone as any}
            className="table-status text-sm text-center "
          >
            {source.label}
          </Badge>
        );
      },
    },
    {
      key: "patient",
      header: "Patient",
      width:'120px',
      render: (invoice) => {
        const p: any = patientMap.get(invoice.patient_id);

        return invoice.patient_name || p?.name || p?.full_name || "Patient";
      },
      cellClassName: "font-medium",
    },
    {
      key: "status",
      header: "Status",
      className: "text-center",
      width:'120px',
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
          className="table-status text-sm text-center"
        >
          {invoice.status === "partially_paid"
            ? "Partially Paid"
            : invoice.status === "partially_refunded"
              ? "Partially Refunded"
              : invoice.status}
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
      width: '100px',
      render: (invoice) => money(invoice.balance_amount)
    },
    {
      key: "actions",
      header: "Actions",
      width:'120px',
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
                Approved {money(revenueReport?.total_approved_discount_amount)} ·
                Offers {money(revenueReport?.total_offer_discount_amount)} ·
                Membership {money(revenueReport?.total_membership_discount_amount)}
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
        <Card>
          <h3 className="card-title font-bold">
            Pending Consultation Invoices
          </h3>
          <p className="card-desc text-slate-500">
            Reception can generate the consultation-fee invoice after the doctor
            signs the consultation. Lab, pharmacy, IP, and physiotherapy each
            have their own invoices created by those modules.
          </p>
          <StatusToast message={message} onClose={() => setMessage("")} />
          <div className="mt-4 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Consultation</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Date &amp; Time</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {signedReady.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-5 text-slate-500">
                      All completed consultations already have invoices.
                    </td>
                  </tr>
                ) : (
                  signedReady.map((a: any) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 font-bold">{a.token || "-"}</td>
                      <td className="px-4 py-3 font-semibold">{a.patient}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {a.doctor && a.doctor !== "Unassigned" ? a.doctor : "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {displayDateTime(
                          a.consultationSignedAt ||
                            a.consultationCreatedAt ||
                            a.appointmentDate,
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          disabled={busy === a.id}
                          onClick={() => generateInvoice(a)}
                        >
                          <ButtonLoader loading={busy === a.id}>
                            {busy === a.id ? "Generating..." : "Generate Invoice"}
                          </ButtonLoader>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
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
              {filteredInvoices.length} of {invoices.length} invoices
            </Badge>
          </div>
        </div>
        <div className="mt-4 grid gap-3 grid-cols-6 xl:grid-cols-[1.4fr_.85fr_.85fr_.65fr_.65fr_auto] xl:items-end items-end">
          <FormField label="Search">
            <Input
              value={filters.query}
              onChange={(event: any) =>
                updateFilter("query", event.target.value)
              }
              placeholder="Invoice, patient, source"
            />
          </FormField>
          <FormField label="Source">
            <SearchableSelect
              value={filters.source}
              onChange={(v) => updateFilter("source", v)}
              options={[
                { value: "all", label: "All sources" },
                ...sourceOptions.map((s: any) => ({
                  value: s.key,
                  label: s.label,
                })),
              ]}
              searchable={false}
            />
          </FormField>
          <FormField label="Paid Status">
            <SearchableSelect
              value={filters.paidStatus}
              onChange={(v) => updateFilter("paidStatus", v)}
              options={status_options}
              searchable={false}
            />
          </FormField>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg px-2 py-2.5 lg:px-4 lg:py-2.5 text-xs border font-bold text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
        <div className="scrollbar-hidden mt-4 overflow-auto rounded-2xl border border-slate-200">
          <DataTable
            columns={invoiceColumns}
            data={invoicePageRows}
            emptyMessage={
              invoices.length === 0
                ? "No invoices yet."
                : "No invoices match the selected filters."
            }
            onRowClick={openInvoiceDetail}
          />
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={filteredInvoices.length}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
