"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CreditCard } from "lucide-react";

import { Button, Card, StatusToast } from "@/app/components/common/ui";
import { DataTable } from "@/app/components/common/DataTable";
import { fetchOPDPaymentQueueRows } from "../opdBillingQueue";
import { displayDateTime, money } from "@/utils/helper";
import type { Column } from "@/utils/types";

function invoiceType(invoice: any) {
  if (invoice.lab_order_id) return "Lab";
  if (invoice.pharmacy_issue_id) return "Prescription";
  return "Consultation";
}

export function OPDPaymentQueue({ apiSession, branchId, onOpenInvoice }: any) {
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

  const columns: Column<any>[] = [
    {
      key: "patient_name",
      header: "Patient",
      width: "180px",
      cellClassName: "font-black text-slate-950 truncate",
      render: (invoice) => invoice.patient_name || "Patient",
    },
    {
      key: "invoice_number",
      header: "Invoice No",
      width: "150px",
      cellClassName: "text-xs font-medium text-slate-500",
      render: (invoice) => invoice.invoice_number,
    },
    {
      key: "type",
      header: "Type",
      width: "130px",
      render: (invoice) => (
        <span className="w-fit rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
          {invoiceType(invoice)}
        </span>
      ),
    },
    {
      key: "balance_amount",
      header: "Due",
      width: "100px",
      cellClassName: "text-sm font-black text-slate-950",
      render: (invoice) => money(invoice.balance_amount),
    },
    {
      key: "date",
      header: "Date",
      width: "150px",
      cellClassName: "text-xs text-slate-600",
      render: (invoice) => displayDateTime(invoice.created_at),
    },
    {
      key: "action",
      header: "Action",
      width: "180px",
      className: "text-right",
      disableRowClick: true,
      render: (invoice) => (
        <Button
          type="button"
          onClick={() => onOpenInvoice?.(invoice)}
          className="inline-flex h-9 w-full items-center justify-center whitespace-nowrap bg-brand px-3 py-0 text-xs hover:bg-brand-hover"
        >
          <CreditCard className="mr-2 h-4 w-4" />
          Collect Payment
        </Button>
      ),
    },
  ];

  return (
    <Card className="pt-2">
      <StatusToast message={message} onClose={() => setMessage("")} />

      {rows.length === 0 && !loading ? (
        <div className="grid min-h-44 place-items-center px-6 text-center">
          <div>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
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
        <div className="table-wrapper-width">
          <DataTable
            columns={columns}
            data={rows}
            loading={loading}
            emptyMessage="No payments pending"
            className="table-width"
          />
        </div>
      )}
    </Card>
  );
}
