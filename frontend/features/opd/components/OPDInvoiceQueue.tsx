"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, ReceiptText } from "lucide-react";

import { Button, Card, StatusToast } from "@/app/components/common/ui";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { createInvoiceFromConsultation } from "@/features/billing/api/billing.api";
import { createInvoiceFromLabOrder } from "@/features/lab/api/lab.api";
import { createInvoiceFromPharmacyIssue } from "@/features/pharmacy/api/pharmacy.api";
import { displayDateTime } from "@/utils/helper";
import {
  fetchOPDBillingQueueRows,
  type OPDBillingQueueRow,
} from "../opdBillingQueue";

function doctorFromConsultation(
  consultationId: string | null | undefined,
  appointments: any[],
) {
  if (!consultationId) return "";
  const row = appointments.find(
    (appointment: any) =>
      String(
        appointment.consultationId || appointment.consultation_id || "",
      ) === String(consultationId),
  );
  return String(
    row?.doctor || row?.practitioner_name || row?.practitionerName || "",
  ).trim();
}

export function OPDInvoiceQueue({
  apiSession,
  branchId,
  appointments = [],
  onOpenInvoices,
}: any) {
  const [rows, setRows] = useState<OPDBillingQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const loadRows = useCallback(async () => {
    if (!apiSession) return;
    setLoading(true);
    try {
      const queueRows = await fetchOPDBillingQueueRows({
        apiSession,
        branchId,
      });
      setRows(
        queueRows.map((row: any) =>
          row.queueType === "consultation"
            ? row
            : {
                ...row,
                practitioner_name:
                  row.practitioner_name ||
                  doctorFromConsultation(row.consultation_id, appointments),
              },
        ),
      );
    } catch (error: any) {
      setMessage(error?.message || "Could not load OPD billing queue.");
    } finally {
      setLoading(false);
    }
  }, [apiSession, appointments, branchId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  async function generateInvoice(row: OPDBillingQueueRow) {
    if (!apiSession) return;
    const rowId =
      row.queueType === "consultation" ? row.consultation_id : row.id;
    if (!rowId) return;
    setBusyId(`${row.queueType}-${rowId}`);
    setMessage("");
    try {
      const result =
        row.queueType === "lab"
          ? await createInvoiceFromLabOrder(apiSession, {
              lab_order_id: row.id,
              created_by_user_id: apiSession.user?.id,
            })
          : row.queueType === "pharmacy"
            ? await createInvoiceFromPharmacyIssue(apiSession, {
                pharmacy_issue_id: row.id,
                created_by_user_id: apiSession.user?.id,
              })
            : await createInvoiceFromConsultation(apiSession, {
                consultation_id: row.consultation_id,
                created_by_user_id: apiSession.user?.id,
              });
      setRows((current) =>
        current.filter(
          (item) =>
            !(
              item.queueType === row.queueType &&
              (item.queueType === "consultation"
                ? item.consultation_id === row.consultation_id
                : item.id === row.id)
            ),
        ),
      );
      setMessage(
        `Invoice ${result?.invoice?.invoice_number || ""} generated for ${row.patient_name || "patient"}.`,
      );
    } catch (error: any) {
      setMessage(error?.message || "Could not generate invoice.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="card-title font-bold">OPD Billing Queue</h3>
          <p className="card-desc text-slate-500">
            Completed consultations, lab orders and prescription issues ready
            for invoice.
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
          Loading OPD billing queue…
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
              Completed consultations, lab orders and prescription issues will
              appear here until their invoice is generated.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_180px_130px_minmax(0,1fr)_130px_180px] gap-4 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 md:grid">
            <span>Patient</span>
            <span>Token</span>
            <span>Type</span>
            <span>Doctor</span>
            <span>Date</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((row) => {
              const rowKey = `${row.queueType}-${
                row.queueType === "consultation" ? row.consultation_id : row.id
              }`;
              const rowBusy = busyId === rowKey;
              return (
                <div
                  key={rowKey}
                  className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_130px_130px_minmax(0,1fr)_180px_180px] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">
                      {row.patient_name || "Patient"}
                    </p>
                  </div>
                  <div className="">
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                      {row.queueType === "lab"
                        ? row.lab_order_number || "Lab order"
                        : row.queueType === "pharmacy"
                          ? row.issue_number || "Prescription issue"
                          : `Token ${row.token_number || "-"}`}
                    </p>
                  </div>
                  <span className="w-fit rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {row.queueType === "lab"
                      ? "Lab"
                      : row.queueType === "pharmacy"
                        ? "Prescription"
                        : "Consultation"}
                  </span>
                  <p className="truncate text-xs font-semibold text-slate-700">
                    {row.practitioner_name || "Unassigned"}
                  </p>
                  <p className="text-xs text-slate-600">
                    {displayDateTime(
                      row.consultation_signed_at ||
                        row.consultation_created_at ||
                        row.order_date ||
                        row.created_at,
                    )}
                  </p>
                  <Button
                    type="button"
                    onClick={() => generateInvoice(row)}
                    disabled={rowBusy}
                    className="inline-flex h-9 w-full items-center justify-center whitespace-nowrap bg-brand px-3 py-0 text-xs hover:bg-brand-hover"
                  >
                    <ButtonLoader loading={rowBusy}>
                      <span className="inline-flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        {rowBusy ? "Generating…" : "Generate Invoice"}
                      </span>
                    </ButtonLoader>
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
