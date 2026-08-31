import { Column } from "@/utils/types";
import { capitalizeFirst, displayDate } from "@/utils/helper";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import { Badge } from "@/app/components/common/ui";
import { RecordIdCell } from "@/app/components/common/RecordIdCell";
import { PatientFlagBadges } from "../patients/components/PatientFlagBadges";
import { RowActions } from "../admin/components/RowActions";
import { isCancelled, isReleased } from "@/features/lab/helpers";

const MAX_REPORT_DOCUMENTS = 5;

export function getLabColumns({
  safePage,
  patientMap,
  canCopyIds,
  invoicedOrderIds,
  reportDocuments,
  busy,
  addReportDocument,
  canBillLabOrder,
  canEditLabOrder,
  handleOrderAction,
  handleRemoveDocument,
  handleReuploadReport,
}: {
  safePage: number;
  patientMap: Map<string, any>;
  canCopyIds: boolean;
  invoicedOrderIds: Set<string>;
  reportDocuments: Record<string, any[]>;
  busy: string;
  addReportDocument: (order: any, file: File) => void;
  canBillLabOrder: boolean;
  canEditLabOrder: boolean;
  handleOrderAction: (order: any, action: string) => void;
  handleRemoveDocument: (order: any) => void;
  handleReuploadReport: (order: any) => void;
}): Column<any>[] {
  return [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (_, index: number) => index + 1,
    },
    {
      key: "lab_order_number",
      header: "Order ID",
      width: "190px",
      render: (o) => (
        <div>
          <RecordIdCell
            id={o.id}
            label="Lab / Service Order ID"
            allowed={canCopyIds}
            value={o.lab_order_number || publicDisplayValue(o.id, "Lab Order")}
          />

        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      className: "text-center",
      width: "110px",
      render: (o) => (
        <div>
          <b>{displayDate(o.created_at)}</b>
        </div>
      ),
    },

    {
      key: "patient",
      header: "Patient",
      width: "150px",
      render: (o) => {
        const p: any = patientMap.get(o.patient_id);

        return (
          <div className="max-w-[130px]">
            <p className="text-sm truncate font-semibold" title={capitalizeFirst(
                o.patient_name ||
                  p?.name ||
                  publicDisplayValue(o.patient_id, "Patient"),
              )}>
              {capitalizeFirst(
                o.patient_name ||
                  p?.name ||
                  publicDisplayValue(o.patient_id, "Patient"),
              )}
            </p>
            <PatientFlagBadges patient={p} className="mt-1" />
          </div>
        );
      },
    },

    {
      key: "source",
      header: "Source",
      width: "100px",
      sortable: true,
      render: (o) => (
        <Badge className="normal-label">
          {humanizeOptionLabel(o.acquisition_source || o.source)}
        </Badge>
      ),
    },

    {
      key: "status",
      header: "Status",
      width: "120px",
      className:'text-center',
      sortable: true,
      render: (o) => {
        const released = isReleased(o);
        const cancelled = isCancelled(o);
        const invoiced = invoicedOrderIds.has(o.id);

        const statusLabel = invoiced ? "Billed" : humanizeOptionLabel(o.status);

        const statusTone = invoiced
          ? "green"
          : released
            ? "green"
            : cancelled
              ? "red"
              : "amber";

        return (
          <Badge tone={statusTone as any} className="normal-label">
            {statusLabel}
          </Badge>
        );
      },
    },

    {
      key: "amount",
      header: "Amount",
      width: "90px",
      sortable: true,
      render: (o) => <>₹{o.amount}</>,
    },

    {
      key: "report",
      header: "Report",
      className: "text-center",
      width: "170px",
      disableRowClick: true,
      render: (o) => {
        const docs = reportDocuments[o.id] || [];
        const hasDocuments = docs.length > 0;
        const isBusy = busy === `report-${o.id}`;
        const released = isReleased(o);
        const cancelled = isCancelled(o);
        const disabled = released || cancelled;

        return (
          <div className="relative group">
            <label
              className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border px-3 py-3 text-xs font-bold transition-colors ${
                disabled || isBusy
                  ? "cursor-not-allowed bg-slate-50 text-slate-300"
                  : hasDocuments
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <input
                type="file"
                className="hidden"
                accept="application/pdf,image/*"
                disabled={disabled || isBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) addReportDocument(o, file);
                }}
              />

              {isBusy ? (
                <div className="flex w-full flex-col items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Uploading...
                  </span>
                  {/* Indeterminate progress bar */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full w-1/2 animate-[progress_1.2s_ease-in-out_infinite] rounded-full bg-blue-500" />
                  </div>
                </div>
              ) : hasDocuments ? (
                `File Uploaded (${docs.length})`
              ) : (
                "Upload Report"
              )}
            </label>

            {/* Tooltip */}
            {hasDocuments && !isBusy && (
              <div className="absolute -top-2 left-1/2 z-50 hidden w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg group-hover:block">
                <div className="mb-2 font-medium text-slate-700">
                  Uploaded Documents
                </div>
                <ul className="max-h-48 space-y-1 overflow-auto">
                  {docs.map((doc: any, idx: number) => (
                    <li
                      key={`${doc.id}-${idx}`}
                      className="flex justify-between text-slate-600"
                    >
                      <span>Document {idx + 1}</span>
                      <span className="max-w-[140px] truncate text-right">
                        {doc.file_name}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "action",
      header: "Action",
      className: "text-center",
      width: "140px",
      disableRowClick: true,
      render: (o) => {
        const docs = reportDocuments[o.id] || [];
        const released = isReleased(o);
        const cancelled = isCancelled(o);
        const invoiced = invoicedOrderIds.has(o.id);
        const rowBusy = busy === o.id;
        const invoiceBusy = busy === `invoice-${o.id}`;
        const sendReportBusy = busy === `send-report-${o.id}`;
        const actionsBusy = rowBusy || invoiceBusy || sendReportBusy;

        const canAddMore = docs.length < MAX_REPORT_DOCUMENTS;

        return (
          <div className="flex justify-center">
            <RowActions
              actions={[
                {
                  label: invoiced
                    ? "View Invoice"
                    : invoiceBusy
                      ? "Generating..."
                      : "Generate invoice",
                  onClick: () =>
                    handleOrderAction(o, invoiced ? "view-invoice" : "invoice"),
                  hidden: !canBillLabOrder,
                  disabled: actionsBusy || (!invoiced && cancelled),
                },
                {
                  label: "Remove Document",
                  onClick: () => handleRemoveDocument(o),
                  disabled:
                    actionsBusy ||
                    released ||
                    cancelled ||
                    (reportDocuments[o.id] || []).length === 0,
                  hidden: !canEditLabOrder,
                  danger: true,
                },
                {
                  label: "Download Report",
                  onClick: () => handleOrderAction(o, "pdf"),
                  disabled: actionsBusy || cancelled,
                },
                {
                  label: rowBusy ? "Releasing..." : "Release Result",
                  onClick: () => handleOrderAction(o, "release"),
                  hidden: released,
                  disabled: actionsBusy || cancelled,
                },
                {
                  label: sendReportBusy
                    ? "Sending..."
                    : "Send Report (WhatsApp)",
                  onClick: () => handleOrderAction(o, "send-report"),
                  disabled:
                    actionsBusy || cancelled || docs.length === 0 || !released,
                },
                {
                  label: "Reupload Report",
                  onClick: () => handleReuploadReport(o),
                  disabled: actionsBusy || released || cancelled,
                  hidden: !canEditLabOrder,
                },
                {
                  label: rowBusy ? "Cancelling..." : "Cancel order",
                  onClick: () => handleOrderAction(o, "cancel"),
                  hidden: !canEditLabOrder,
                  disabled: actionsBusy || cancelled || invoiced,
                  danger: true,
                },
              ]}
              // portal: renders the menu fixed-positioned into document.body
              // instead of absolutely inside this cell — otherwise the
              // worklist table's scroll/overflow container clips the menu
              // (half hidden) for rows near the top or bottom of the table,
              // e.g. the first row.
              portal
              width="w-48"
            />
          </div>
        );
      },
    },
  ];
}
