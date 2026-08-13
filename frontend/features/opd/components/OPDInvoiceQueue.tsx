"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, ReceiptText } from "lucide-react";

import {
  Button,
  Card,
  StatusToast,
} from "@/app/components/common/ui";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import {
  createInvoiceFromConsultation,
  fetchPendingConsultationInvoicePage,
} from "@/features/billing/api/billing.api";
import { displayDateTime } from "@/utils/helper";

export function OPDInvoiceQueue({ apiSession, branchId, onOpenInvoices }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const loadRows = useCallback(async () => {
    if (!apiSession) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", offset: "0" });
      if (branchId) params.set("branch_id", branchId);
      const result = await fetchPendingConsultationInvoicePage(
        apiSession,
        params,
      );
      setRows(Array.isArray(result?.items) ? result.items : []);
    } catch (error: any) {
      setMessage(error?.message || "Could not load completed consultations.");
    } finally {
      setLoading(false);
    }
  }, [apiSession, branchId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  async function generateInvoice(row: any) {
    if (!apiSession || !row?.consultation_id) return;
    setBusyId(row.consultation_id);
    setMessage("");
    try {
      const result = await createInvoiceFromConsultation(apiSession, {
        consultation_id: row.consultation_id,
        created_by_user_id: apiSession.user?.id,
      });
      setRows((current) =>
        current.filter(
          (item) => item.consultation_id !== row.consultation_id,
        ),
      );
      setMessage(
        `Invoice ${result?.invoice?.invoice_number || ""} generated for ${row.patient_name || "patient"}.`,
      );
    } catch (error: any) {
      setMessage(error?.message || "Could not generate consultation invoice.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="card-title font-bold">Consultation Invoices</h3>
          <p className="card-desc text-slate-500">
            Completed consultations ready for a consultation-fee invoice.
          </p>
        </div>
        <Button
          type="button"
          className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap bg-brand px-4 py-0 text-xs hover:bg-brand-hover"
          onClick={onOpenInvoices}
        >
          <ReceiptText className="mr-2 h-4 w-4" />
          View All Invoices
        </Button>
      </div>

      <StatusToast message={message} onClose={() => setMessage("")} />

      {loading ? (
        <div className="grid min-h-44 place-items-center text-sm text-slate-500">
          Loading completed consultations…
        </div>
      ) : rows.length === 0 ? (
        <div className="grid min-h-44 place-items-center px-6 text-center">
          <div>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-black text-slate-900">
              No invoices waiting
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Completed consultations will appear here until their invoice is generated.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_180px_180px] gap-4 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 md:grid">
            <span>Patient</span>
            <span>Doctor</span>
            <span>Completed</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((row) => (
              <div
                key={row.consultation_id}
                className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_180px_180px] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">
                    {row.patient_name || "Patient"}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    Token {row.token_number || "-"}
                  </p>
                </div>
                <p className="truncate text-xs font-semibold text-slate-700">
                  {row.practitioner_name || "Unassigned"}
                </p>
                <p className="text-xs text-slate-600">
                  {displayDateTime(
                    row.consultation_signed_at || row.consultation_created_at,
                  )}
                </p>
                <Button
                  type="button"
                  onClick={() => generateInvoice(row)}
                  disabled={busyId === row.consultation_id}
                  className="inline-flex h-9 w-full items-center justify-center whitespace-nowrap bg-brand px-3 py-0 text-xs hover:bg-brand-hover"
                >
                  <ButtonLoader loading={busyId === row.consultation_id}>
                    <span className="inline-flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {busyId === row.consultation_id
                        ? "Generating…"
                        : "Generate Invoice"}
                    </span>
                  </ButtonLoader>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
