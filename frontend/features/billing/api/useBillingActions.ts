"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { mapWithConcurrency } from "@/lib/concurrency";
import type { ApiSession } from "@/lib/api";
import { money } from "@/utils/helper";
import {
  createInvoiceReceiptPdf,
  downloadInvoiceReceipt,
} from "../downloadInvoiceReceipt";
import {
  applyInvoiceMembershipBenefit,
  createInvoiceAdjustmentRequest,
  createInvoiceCreditNote,
  createInvoiceFromConsultation,
  createInvoicePayment,
  executeInvoiceAdjustmentRequest,
  fetchInvoiceDelivery,
  fetchInvoiceDeliveries,
  fetchInvoiceDetail,
  fetchInvoiceDocument,
  fetchInvoiceItemSupplierOptions,
  finalizeDoctorSettlement,
  finalizeInvoiceDocument,
  regenerateInvoiceDocument as regenerateInvoiceDocumentRequest,
  reviewInvoiceAdjustmentRequest,
  sendInvoiceDocument,
  updateInvoiceItemSupplierRequest,
  updateInvoiceLifecycle,
} from "./billing.api";

const MAX_INVOICE_PDF_UPLOAD_BYTES = 5 * 1024 * 1024;

export function useBillingActions(
  session: ApiSession | null | undefined,
  options: {
    loadLiveData: (session: ApiSession) => Promise<void>;
    refreshInvoices: () => Promise<void>;
    refreshPendingConsultations: () => Promise<void>;
    loadReports: () => Promise<void>;
    setSettlement: (value: any) => void;
    branchId?: string;
  },
) {
  const queryClient = useQueryClient();
  const {
    loadLiveData,
    refreshInvoices,
    refreshPendingConsultations,
    loadReports,
    setSettlement,
    branchId,
  } = options;
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [supplierOptions, setSupplierOptions] = useState<
    Record<string, any[]>
  >({});
  const [detailLoading, setDetailLoading] = useState("");

  useEffect(() => {
    const invoiceId = detail?.invoice?.id;
    if (!session || !invoiceId) return undefined;
    let active = true;
    let timer: number | null = null;
    const shouldPollDelivery = (delivery: any) =>
      ["queued", "processing"].includes(
        String(delivery?.status || "").toLowerCase(),
      );
    const refreshDelivery = async () => {
      const delivery = await fetchInvoiceDelivery(session, invoiceId).catch(
        () => null,
      );
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
  }, [session?.tenantId, detail?.invoice?.id]);

  async function loadInvoiceSupplierOptions(row: any) {
    if (!session || !row?.invoice?.lab_order_id) {
      setSupplierOptions({});
      return;
    }
    const optionRows = await mapWithConcurrency(
      row.items || [],
      (item: any) =>
        fetchInvoiceItemSupplierOptions(session, row.invoice.id, item.id)
          .then((opts: any) => [item.id, Array.isArray(opts) ? opts : []])
          .catch(() => [item.id, []]),
      4,
    );
    setSupplierOptions(Object.fromEntries(optionRows));
  }

  async function openInvoiceDetail(invoice: any) {
    if (!session) return;
    setDetailLoading(invoice.id);
    setMessage("");
    try {
      const [row, delivery, document, deliveries] = await Promise.all([
        fetchInvoiceDetail(session, invoice.id),
        fetchInvoiceDelivery(session, invoice.id).catch(() => ({
          status: "not_sent",
        })),
        fetchInvoiceDocument(session, invoice.id).catch(() => ({
          exists: false,
        })),
        fetchInvoiceDeliveries(session, invoice.id).catch(() => []),
      ]);
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

  async function generateInvoice(a: any) {
    if (!session) return;
    setBusy(a.id);
    setMessage("");
    try {
      const row = await createInvoiceFromConsultation(session, {
        consultation_id: a.consultationId,
        created_by_user_id: session.user?.id,
      });
      await Promise.all([
        loadLiveData(session),
        refreshInvoices(),
        refreshPendingConsultations(),
        loadReports(),
      ]);
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
    if (!session || !invoice?.id) return null;
    if (!automatic) {
      setBusy(`send-invoice-${channel}-${invoice.id}`);
      setMessage("");
    }
    try {
      let artifact = await fetchInvoiceDocument(session, invoice.id);
      if (!artifact?.exists) {
        const { blob, filename } = await createInvoiceReceiptPdf(
          invoice.id,
          session,
          queryClient,
        );
        if (blob.size > MAX_INVOICE_PDF_UPLOAD_BYTES) {
          throw new Error(
            `The generated invoice PDF is ${(blob.size / (1024 * 1024)).toFixed(1)} MB. The maximum allowed size is 5 MB.`,
          );
        }
        const form = new FormData();
        form.append("file", blob, filename);
        artifact = await finalizeInvoiceDocument(session, invoice.id, form);
      }
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `invoice-send-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await sendInvoiceDocument(session, invoice.id, {
        channel,
        idempotency_key: idempotencyKey,
      });
      const deliveries = await fetchInvoiceDeliveries(
        session,
        invoice.id,
      ).catch(() => []);
      setDetail((current: any) =>
        current?.invoice?.id === invoice.id
          ? {
              ...current,
              ...(channel === "whatsapp" ? { invoice_delivery: result } : {}),
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

  async function regenerateInvoiceDocument(invoice: any, reason: string) {
    if (!session || !invoice?.id) return;
    setBusy(`regenerate-invoice-${invoice.id}`);
    setMessage("");
    try {
      const current = await fetchInvoiceDocument(session, invoice.id);
      if (!current?.exists) {
        throw new Error("Finalize the invoice before regenerating its PDF.");
      }
      const { blob, filename } = await createInvoiceReceiptPdf(
        invoice.id,
        session,
        queryClient,
      );
      if (blob.size > MAX_INVOICE_PDF_UPLOAD_BYTES) {
        throw new Error("The regenerated invoice PDF exceeds the 5 MB limit.");
      }
      const form = new FormData();
      form.append("file", blob, filename);
      form.append("reason", reason);
      form.append("expected_version", String(current.version));
      const artifact = await regenerateInvoiceDocumentRequest(
        session,
        invoice.id,
        form,
      );
      setDetail((value: any) =>
        value?.invoice?.id === invoice.id
          ? { ...value, invoice_document: artifact }
          : value,
      );
      setMessage(
        `Invoice PDF regenerated as version ${artifact.version}. Existing queued deliveries still use their original version.`,
      );
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not regenerate the invoice PDF.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function collectPayment(
    invoice: any,
    input: { amount?: string | number; method?: string; reference?: string },
    defaultPaymentMethod: string,
  ) {
    if (!session) return false;
    const amount = Number(input.amount || invoice.balance_amount || 0);
    if (!amount) {
      setMessage("Enter payment amount.");
      return false;
    }
    setBusy(invoice.id);
    setMessage("");
    try {
      const paymentResult = await createInvoicePayment(session, invoice.id, {
        method: input.method || defaultPaymentMethod,
        amount,
        reference_number: input.reference || null,
        collected_by_user_id: session.user?.id,
      });
      await Promise.all([refreshInvoices(), loadReports()]);
      if (
        String(paymentResult?.invoice?.status || "").toLowerCase() ===
          "paid" &&
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
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not record payment.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function collectSplitPayment(
    invoice: any,
    rows: any[],
    defaultPaymentMethod: string,
  ) {
    if (!session) return;
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
      setMessage(`Total ${money(total)} exceeds balance due ${money(balance)}.`);
      return;
    }
    setBusy(invoice.id);
    setMessage("");
    try {
      let paymentResult: any = null;
      for (const row of valid) {
        paymentResult = await createInvoicePayment(session, invoice.id, {
          ...row,
          collected_by_user_id: session.user?.id,
        });
      }
      await Promise.all([refreshInvoices(), loadReports()]);
      await openInvoiceDetail(invoice);
      const modes =
        valid.length > 1 ? `${valid.length} payment modes` : valid[0].method;
      if (
        String(paymentResult?.invoice?.status || "").toLowerCase() ===
          "paid" &&
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
    if (!session) return;
    setBusy(`membership-${invoice.id}`);
    setMessage("");
    try {
      const row = await applyInvoiceMembershipBenefit(session, invoice.id);
      setDetail(row);
      await Promise.all([refreshInvoices(), loadReports()]);
      setMessage(`Membership benefit applied to ${invoice.invoice_number}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not apply membership benefit.");
    } finally {
      setBusy("");
    }
  }

  async function submitCreditNote(invoice: any, reason: string) {
    if (!session || !invoice || !reason) return false;
    setBusy(invoice.id);
    try {
      await createInvoiceCreditNote(session, invoice.id, {
        amount: Math.max(1, invoice.balance_amount || invoice.total_amount),
        reason,
        created_by_user_id: session.user?.id,
      });
      await Promise.all([refreshInvoices(), loadReports()]);
      await openInvoiceDetail(invoice);
      setMessage(`Credit note issued for ${invoice.invoice_number}.`);
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not issue credit note.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function openReceipt(invoice: any) {
    if (!invoice?.id || !session) return;
    setBusy(`receipt-${invoice.id}`);
    setMessage("");
    try {
      await downloadInvoiceReceipt(invoice.id, session, queryClient);
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
    if (!session) return;
    setBusy(`supplier-${item.id}`);
    setMessage("");
    try {
      const row = await updateInvoiceItemSupplierRequest(
        session,
        invoice.id,
        item.id,
        supplierId || null,
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

  async function submitInvoiceAction(
    invoice: any,
    kind: "cancel" | "amend",
    reason: string,
  ) {
    if (!session || !invoice || !reason) return false;
    setBusy(`${kind}-${invoice.id}`);
    setMessage("");
    try {
      const row = await updateInvoiceLifecycle(session, invoice.id, kind, {
        reason,
        actor_user_id: session.user?.id,
      });
      setDetail(row);
      await Promise.all([refreshInvoices(), loadReports()]);
      setMessage(
        kind === "cancel"
          ? `Invoice ${invoice.invoice_number} cancelled and ledger reversed.`
          : `Invoice ${invoice.invoice_number} amended and reopened.`,
      );
      return true;
    } catch (err: any) {
      setMessage(err.message || `Could not ${kind} invoice.`);
      return false;
    } finally {
      setBusy("");
    }
  }

  async function submitAdjustmentRequest(
    invoice: any,
    type: string,
    reason: string,
    amount: number | null,
  ) {
    if (!session || !invoice || !reason) return false;
    setBusy(`request-${invoice.id}`);
    setMessage("");
    try {
      const row = await createInvoiceAdjustmentRequest(session, invoice.id, {
        request_type: type,
        amount,
        reason,
        requested_by_user_id: session.user?.id,
      });
      await openInvoiceDetail(invoice);
      setMessage(
        `${String(row.request_type).replaceAll("_", " ")} request raised.`,
      );
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not raise request.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function submitRequestAction(
    row: any,
    kind: "approve" | "reject" | "execute",
    reason: string,
  ) {
    if (!session) return false;
    if (kind === "reject" && !reason) return false;
    setBusy(`${kind}-${row.id}`);
    setMessage("");
    try {
      if (kind === "execute") {
        const next = await executeInvoiceAdjustmentRequest(session, row.id, {
          actor_user_id: session.user?.id,
        });
        setDetail(next);
        await Promise.all([refreshInvoices(), loadReports()]);
        setMessage("Request executed and ledger updated.");
      } else {
        await reviewInvoiceAdjustmentRequest(session, row.id, kind, {
          reason: reason || null,
          actor_user_id: session.user?.id,
        });
        if (detail?.invoice) await openInvoiceDetail(detail.invoice);
        setMessage(kind === "approve" ? "Request approved." : "Request rejected.");
      }
      return true;
    } catch (err: any) {
      setMessage(err.message || `Could not ${kind} request.`);
      return false;
    } finally {
      setBusy("");
    }
  }

  async function finalizeSettlement() {
    if (!session) return;
    setBusy("settlement");
    try {
      const saved = await finalizeDoctorSettlement(session, {
        finalized_by_user_id: session.user?.id,
        branch_id: branchId || null,
      });
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

  return {
    busy,
    message,
    setMessage,
    detail,
    setDetail,
    supplierOptions,
    detailLoading,
    generateInvoice,
    sendInvoice,
    regenerateInvoiceDocument,
    openInvoiceDetail,
    collectPayment,
    collectSplitPayment,
    applyMembershipBenefit,
    submitCreditNote,
    openReceipt,
    updateInvoiceItemSupplier,
    submitInvoiceAction,
    submitAdjustmentRequest,
    submitRequestAction,
    finalizeSettlement,
  };
}
