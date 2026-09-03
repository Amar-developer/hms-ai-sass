"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText } from "lucide-react";

import { Button, Card, StatusToast } from "@/app/components/common/ui";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { DataTable } from "@/app/components/common/DataTable";
import { createInvoiceFromConsultation } from "@/features/billing/api/billing.api";
import { createInvoiceFromLabOrder } from "@/features/lab/api/lab.api";
import { createInvoiceFromPharmacyIssue } from "@/features/pharmacy/api/pharmacy.api";
import { displayDateTime } from "@/utils/helper";
import type { Column } from "@/utils/types";
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
      const invoiceId = result?.invoice?.id;
      if (invoiceId && typeof window !== "undefined") {
        // Land straight on the Payments tab — the reception flow right
        // after generating an OPD invoice is almost always "collect
        // payment now", not reviewing line items.
        window.sessionStorage.setItem("medizinhub.billingInvoiceId", invoiceId);
        window.sessionStorage.setItem(
          "medizinhub.billingInvoiceSection",
          "invoice-payment",
        );
        onOpenInvoices?.();
      }
    } catch (error: any) {
      setMessage(error?.message || "Could not generate invoice.");
    } finally {
      setBusyId("");
    }
  }

  function queueRowKey(row: OPDBillingQueueRow) {
    return `${row.queueType}-${
      row.queueType === "consultation" ? row.consultation_id : row.id
    }`;
  }

  const columns: Column<OPDBillingQueueRow>[] = [
    {
      key: "patient_name",
      header: "Patient",
      width: "180px",
      cellClassName: "font-black text-slate-950 truncate",
      render: (row) => row.patient_name || "Patient",
    },
    {
      key: "id",
      header: "ID",
      width: "130px",
      cellClassName: "text-xs font-medium text-slate-500",
      render: (row) =>
        row.queueType === "lab"
          ? row.lab_order_number || "Lab order"
          : row.queueType === "pharmacy"
            ? row.issue_number || "Prescription issue"
            : `Token ${row.token_number || "-"}`,
    },
    {
      key: "type",
      header: "Type",
      width: "130px",
      render: (row) => (
        <span className="w-fit rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
          {row.queueType === "lab"
            ? "Lab"
            : row.queueType === "pharmacy"
              ? "Prescription"
              : "Consultation"}
        </span>
      ),
    },
    {
      key: "practitioner_name",
      header: "Doctor",
      width: "150px",
      cellClassName: "truncate text-xs font-semibold text-slate-700",
      render: (row) => row.practitioner_name || "Unassigned",
    },
    {
      key: "date",
      header: "Date",
      width: "160px",
      cellClassName: "text-xs text-slate-600",
      render: (row) =>
        displayDateTime(
          row.consultation_signed_at ||
            row.consultation_created_at ||
            row.order_date ||
            row.created_at,
        ),
    },
    {
      key: "action",
      header: "Action",
      width: "180px",
      className: "text-right",
      disableRowClick: true,
      render: (row) => {
        const rowBusy = busyId === queueRowKey(row);
        return (
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
        );
      },
    },
  ];

  return (
    <Card className="pt-2">
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="table-wrapper-width">
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          emptyMessage="No invoices waiting"
          emptyDescription="Completed consultations, lab orders and prescription issues will appear here until their invoice is generated."
          emptyIcon={CheckCircle2}
          minBodyHeight={`${rows.length > 0 ? "" : "220px"}`}
          className="table-width"
        />
      </div>
    </Card>
  );
}
