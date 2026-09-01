"use client";

import { apiFetch, type ApiSession } from "@/lib/api";
import * as labApi from "./lab.api";

type UseLabActionsParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
  loadLiveData?: (session: ApiSession) => Promise<void>;
  templates: any[];
  orderTests: any[];
  reportDocuments: Record<string, any[]>;
  setReportDocuments: (
    updater: (current: Record<string, any[]>) => Record<string, any[]>,
  ) => void;
  setBusy: (value: string) => void;
  setMessage: (value: string) => void;
  setOrderTests: (rows: any[]) => void;
  setSelectedAvailableTestId: (id: string) => void;
  setTestSearch: (value: string) => void;
  setLocalInvoicedOrderIds: (updater: (ids: string[]) => string[]) => void;
  setLocalInvoiceIdsByOrder: (
    updater: (current: Record<string, string>) => Record<string, string>,
  ) => void;
  setViewConsult: (value: any) => void;
  setConsultDetail: (value: any) => void;
  setLoadingDetail: (value: boolean) => void;
  load: () => Promise<void>;
};

const MAX_REPORT_DOCUMENTS = 5;
const MAX_REPORT_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Write / on-demand-read actions for the lab workspace: order lifecycle
 * (create, from consultation, sample collection, status update), report
 * document upload/replace and download, result release, invoice
 * generation, and loading a consultation's referral detail.
 */
export function useLabActions({
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
}: UseLabActionsParams) {
  async function handleCreateOrder(data: any) {
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
      await labApi.createOrder(apiSession, {
        branch_id: branchId,
        patient_id: data.patient_id,
        order_date: data.order_date,
        source:
          data.acquisition_source === "referral"
            ? "external_referral"
            : "op_direct",
        acquisition_source: data.acquisition_source,
        referrer_patient_id: data.referrer_patient_id || null,
        referrer_name: data.referrer_name || null,
        tests: testsText,
        test_ids: localTestIds,
        package_ids: packageIds,
        external_items: [],
        external_referrer:
          data.acquisition_source === "referral" ? data.referrer_name : null,
        amount: 0,
        ordered_by_user_id: apiSession.user?.id,
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

  async function createFromConsultation(a: any) {
    setBusy(a.consultationId);
    setMessage("");
    try {
      await labApi.createOrderFromConsultation(
        apiSession as ApiSession,
        a.consultationId,
        {
          amount: 0,
          priority: a.tokenType === "Emergency" ? "urgent" : "routine",
          ordered_by_user_id: (apiSession as ApiSession).user?.id,
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
      await labApi.collectSample(apiSession as ApiSession, order.id, {
        barcode: `${order.id}-S1`,
        sample_type: "Blood",
        collected_by_user_id: (apiSession as ApiSession).user?.id,
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
      await labApi.updateOrderStatus(apiSession as ApiSession, order.id, {
        status,
        actor_user_id: (apiSession as ApiSession).user?.id,
        reason:
          status === "cancelled" ? "Cancelled from lab screen" : undefined,
      });
      await load();
    } catch (err: any) {
      setMessage(err.message || "Could not update lab order.");
    } finally {
      setBusy("");
    }
  }

  async function uploadOrderDocument(order: any, file: File) {
    if (file.size > MAX_REPORT_UPLOAD_BYTES) {
      throw new Error("Lab report exceeds the 50 MB intake limit.");
    }
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
    return labApi.uploadOrderDocument(apiSession as ApiSession, upload);
  }

  // Best-effort: fires after a report upload/reupload so the patient gets
  // the WhatsApp copy immediately, without blocking the upload UI on it.
  // A 409 means the order isn't released yet (RESULT_READY/REPORT_DELIVERED)
  // — this function treats that as a silent no-op (returns null, doesn't
  // throw), but callers must not swallow it too: an uploaded-but-unreleased
  // report will never be delivered on its own, so they surface a warning
  // telling staff to release the result.
  async function autoSendReportAfterUpload(order: any) {
    if (!apiSession) return null;
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `lab-send-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await labApi.sendReport(apiSession, order.id, {
        channel: "whatsapp",
        idempotency_key: idempotencyKey,
      });
      return true;
    } catch (err: any) {
      if (Number(err?.status) === 409) return null;
      return false;
    }
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
      const document: any = await uploadOrderDocument(order, file);
      setReportDocuments((current) => ({
        ...current,
        [order.id]: [...(current[order.id] || []), document],
      }));
      const sent = await autoSendReportAfterUpload(order);
      setMessage(
        sent === true
          ? `Report uploaded and sent to patient on WhatsApp: ${document.file_name}`
          : sent === false
            ? `Report uploaded: ${document.file_name} (WhatsApp send failed — use Send Report to retry).`
            : `Warning: report uploaded but not sent — release the result to deliver ${document.file_name} to the patient.`,
      );
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
      const document: any = await uploadOrderDocument(order, file);
      if (oldDocument?.id) {
        try {
          await labApi.deleteFile(apiSession, oldDocument.id);
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
      const sent = await autoSendReportAfterUpload(order);
      setMessage(
        sent === true
          ? `Report replaced and sent to patient on WhatsApp: ${document.file_name}`
          : sent === false
            ? `Report replaced: ${document.file_name} (WhatsApp send failed — use Send Report to retry).`
            : `Warning: report replaced but not sent — release the result to deliver ${document.file_name} to the patient.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not replace report.");
    } finally {
      setBusy("");
    }
  }

  async function releaseResult(order: any) {
    setBusy(order.id);
    setMessage("");
    const reportDocument = (reportDocuments[order.id] || [])[0];
    try {
      await labApi.releaseResult(apiSession as ApiSession, order.id, {
        template_id: templates[0]?.id || null,
        result_summary: "Result released from MedizinHub lab screen.",
        abnormal_flag: false,
        report_url: reportDocument?.file_url || null,
        report_file_name: reportDocument?.file_name || null,
        released_by_user_id: (apiSession as ApiSession).user?.id,
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

  async function sendReport(order: any) {
    setBusy(`send-report-${order.id}`);
    setMessage("");
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `lab-send-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await labApi.sendReport(apiSession as ApiSession, order.id, {
        channel: "whatsapp",
        idempotency_key: idempotencyKey,
      });
      setMessage("Lab report queued for WhatsApp delivery.");
    } catch (err: any) {
      setMessage(err.message || "Could not send lab report.");
    } finally {
      setBusy("");
    }
  }

  async function openReport(
    order: any,
    downloadBlob: (blob: Blob, name: string) => void,
  ) {
    setBusy(order.id);
    const docs = reportDocuments[order.id] || [];
    try {
      if (docs.length === 1) {
        const doc = docs[0];
        const blob = await labApi.downloadFile(
          apiSession as ApiSession,
          doc.id,
        );
        downloadBlob(blob, doc.file_name || `lab-report-${order.id}`);
        return;
      }
      if (docs.length > 1) {
        const zipBlob = await labApi.downloadOrderReportsZip(
          apiSession as ApiSession,
          order.id,
        );
        downloadBlob(zipBlob, `lab-reports-${order.id}.zip`);
        return;
      }
      const blob = await labApi.downloadOrderReportPdf(
        apiSession as ApiSession,
        order.id,
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
      const detail: any = await labApi.createInvoiceFromLabOrder(
        apiSession as ApiSession,
        {
          lab_order_id: order.id,
          created_by_user_id: (apiSession as ApiSession).user?.id,
        },
      );
      setLocalInvoicedOrderIds((ids) =>
        ids.includes(order.id) ? ids : [...ids, order.id],
      );
      if (detail.invoice?.id) {
        setLocalInvoiceIdsByOrder((current) => ({
          ...current,
          [order.id]: detail.invoice.id,
        }));
      }
      await load();
      if (loadLiveData) await loadLiveData(apiSession as ApiSession);
      setMessage(
        `Lab invoice ${detail.invoice?.invoice_number || ""} generated.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not generate lab invoice.");
    } finally {
      setBusy("");
    }
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
      const detail = await labApi.getConsultation(
        apiSession as ApiSession,
        a.consultationId,
      );
      setConsultDetail(detail);
    } catch (err: any) {
      setMessage(err.message || "Could not load consultation.");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function removeReportDocument(order: any, doc: any) {
    if (!apiSession || !order?.id || !doc?.id) return;

    setBusy(`report-${order.id}`);
    setMessage("");

    try {
      await apiFetch(
        `/lab/orders/${order.id}/documents/${doc.id}`,
        apiSession,
        {
          method: "DELETE",
        },
      );

      // Update local state
      setReportDocuments((prev: any) => {
        const next = { ...prev };
        next[order.id] = (next[order.id] || []).filter(
          (d: any) => d.id !== doc.id,
        );
        return next;
      });

      setMessage("Document removed.");
    } catch (err: any) {
      setMessage(err.message || "Could not remove document.");
    } finally {
      setBusy("");
    }
  }

  return {
    handleCreateOrder,
    createFromConsultation,
    collectSample,
    updateStatus,
    addReportDocument,
    replaceReportDocument,
    releaseResult,
    sendReport,
    openReport,
    generateInvoice,
    loadConsultDetail,
    removeReportDocument
  };
}
