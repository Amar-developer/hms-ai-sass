"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CreditCard, ReceiptText } from "lucide-react";

import { Button, Card, StatusToast } from "@/app/components/common/ui";
import { fetchOPDPaymentQueueRows } from "../opdBillingQueue";
import { displayDateTime, money } from "@/utils/helper";

function invoiceType(invoice: any) {
  if (invoice.lab_order_id) return "Lab";
  if (invoice.pharmacy_issue_id) return "Prescription";
  return "Consultation";
}

export function OPDPaymentQueue({
  apiSession,
  branchId,
  onOpenInvoice,
}: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadRows = useCallback(async () => {
    if (!apiSession) return;
    setLoading(true);
    try {
      setRows(await fetchOPDPaymentQueueRows({ apiSession, branchId }));
    } catch (error: any) {
      setMessage(error?.message || "Could not load OPD payment queue.");
    } finally {
      setLoading(false);
    }
  }, [apiSession, branchId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="card-title font-bold">OPD Payment Queue</h3>
          <p className="card-desc text-slate-500">
            Generated OPD invoices with pending payment.
          </p>
        </div>
      </div>

      <StatusToast message={message} onClose={() => setMessage("")} />

      {loading ? (
        <div className="grid min-h-44 place-items-center text-sm text-slate-500">
          Loading OPD payment queue...
        </div>
      ) : rows.length === 0 ? (
        <div className="grid min-h-44 place-items-center px-6 text-center">
          <div>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-black text-slate-900">
              No payments pending
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Unpaid OPD invoices appear here until payment is collected.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_130px_140px_120px_180px] gap-4 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 md:grid">
            <span>Patient</span>
            <span>Type</span>
            <span>Due</span>
            <span>Date</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((invoice) => (
              <div
                key={invoice.id}
                className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_130px_140px_120px_180px] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">
                    {invoice.patient_name || "Patient"}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    {invoice.invoice_number}
                  </p>
                </div>
                <span className="w-fit rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  {invoiceType(invoice)}
                </span>
                <p className="text-sm font-black text-slate-950">
                  {money(invoice.balance_amount)}
                </p>
                <p className="text-xs text-slate-600">
                  {displayDateTime(invoice.created_at)}
                </p>
                <Button
                  type="button"
                  onClick={() => onOpenInvoice?.(invoice)}
                  className="inline-flex h-9 w-full items-center justify-center whitespace-nowrap bg-brand px-3 py-0 text-xs hover:bg-brand-hover"
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Collect Payment
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
