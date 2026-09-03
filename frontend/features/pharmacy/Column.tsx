import { Column } from "@/utils/types";
import { Trash2 } from "lucide-react";
import { capitalizeFirst, displayDate, displayDateTime } from "@/utils/helper";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import { ActionButton, Badge, Button } from "@/app/components/common/ui";
import { RecordIdCell } from "@/app/components/common/RecordIdCell";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";
import { RowActions } from "../admin/components/RowActions";
import { isBilledIssue, isCancelledIssue, isDispensed } from "./helpers";
import { displayDocumentNumber } from "@/lib/documentNumbers";

function hasPositiveIssueAmount(issue: any) {
  return Number(issue.amount || 0) > 0;
}

export function getPrescriptionColumns({
  busy,
  canCreatePharmacyIssue,
  numberingRules,
  onCreate,
  onDismiss,
}: {
  busy: string;
  canCreatePharmacyIssue: boolean;
  numberingRules: any;
  onCreate: (a: any) => void;
  onDismiss: (a: any) => void;
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
      key: "prescription",
      header: "Appointment ID",
      width:"180px",
      render: (a: any) => (
        <span className="font-bold">
          {displayDocumentNumber(
            a.appointmentNumber || a.appointment_number,
            numberingRules,
            "appointment",
          ) || "-"}
        </span>
      ),
    },
    {
      key: "patient",
      header: "Patient",
      width: "150px",
      render: (a: any) => <span className="font-semibold">{a.patient}</span>,
    },
    {
      key: "doctor",
      header: "Doctor",
      width: "120px",
      cellClassName: "text-slate-600",
      render: (a: any) =>
        a.doctor && a.doctor !== "Unassigned" ? a.doctor : "-",
    },
    {
      key: "date",
      header: "Date & Time",
      cellClassName: "whitespace-nowrap text-slate-600",
      width: "220px",
      render: (a: any) =>
        displayDateTime(
          a.consultationSignedAt ||
            a.consultationCreatedAt ||
            a.appointmentDate,
        ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      disableRowClick: true,
      render: (a: any) => (
        <div className="flex justify-end gap-2">
          {canCreatePharmacyIssue && (
            <Button
              disabled={busy === a.consultationId}
              onClick={() => onCreate(a)}
              className="rounded-lg px-2 py-2 text-xs lg:px-4"
            >
              {busy === a.consultationId ? "Creating..." : "Create Issue"}
            </Button>
          )}
          <ActionButton
            onClick={() => onDismiss(a)}
            className="close-button"
            aria-label="Remove"
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </ActionButton>
        </div>
      ),
    },
  ];
}

export function getPharmacyColumns({
  pageSize,
  safePage,
  patientMap,
  canCopyIds,
  invoicedIssueIds,
  editingAmountId,
  editingAmountValue,
  setEditingAmountValue,
  startEditAmount,
  cancelEditAmount,
  saveIssueAmount,
  amountBusy,
  canEditPharmacyIssue,
  canDispensePharmacyIssue,
  canBillPharmacyIssue,
  busy,
  handleIssueAction,
}: {
  pageSize: number;
  safePage: number;
  patientMap: Map<string, any>;
  canCopyIds: boolean;
  invoicedIssueIds: Set<string>;
  editingAmountId: string;
  editingAmountValue: string;
  setEditingAmountValue: (value: string) => void;
  startEditAmount: (issue: any) => void;
  cancelEditAmount: () => void;
  saveIssueAmount: (issue: any) => void;
  amountBusy: (issue: any) => boolean;
  canEditPharmacyIssue: boolean;
  canDispensePharmacyIssue: boolean;
  canBillPharmacyIssue: boolean;
  busy: string;
  handleIssueAction: (issue: any, action: string) => void;
}): Column<any>[] {
  return [
    {
      key: "index",
      header: "S.No",
      width: "50px",
      render: (_, index) => <b>{(safePage - 1) * pageSize + index + 1}</b>,
    },
    {
      key: "issue_number",
      header: "Issue ID",
      width: "190px",
      render: (issue: any) => (
        <div>
          <RecordIdCell
            id={issue.id}
            label="Pharmacy Issue ID"
            allowed={canCopyIds}
            value={issue.issue_number || publicDisplayValue(issue.id, "Issue")}
            valueClassName="text-sm"
          />
        </div>
      ),
    },
    {
      key: "patient",
      header: "Patient",
      width: "150px",
      render: (issue: any) => {
        const p: any = patientMap.get(issue.patient_id);

        return (
          <div className="text-sm max-w-[130px]">
            <p
              className="truncate"
              title={capitalizeFirst(
                issue.patient_name ||
                  p?.name ||
                  publicDisplayValue(issue.patient_id, "Patient"),
              )}
            >
              {capitalizeFirst(
                issue.patient_name ||
                  p?.name ||
                  publicDisplayValue(issue.patient_id, "Patient"),
              )}
            </p>
            <PatientFlagBadges patient={p} className="mt-1" />
          </div>
        );
      },
    },

    {
      key: "date",
      header: "Date",
      className: "text-center",
      width: "100px",
      render: (issue: any) => (
        <p className="text-sm">{displayDate(issue.created_at)}</p>
      ),
    },

    {
      key: "source",
      header: "Source",
      width: "120px",
      className: "text-center",
      sortable: true,
      render: (issue: any) => (
        <Badge className="normal-label">
          {humanizeOptionLabel(issue.source)}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "120px",
      className: "text-center",
      sortable: true,
      render: (issue: any) => {
        const dispensed = isDispensed(issue);
        const cancelled = isCancelledIssue(issue);
        const invoiced = invoicedIssueIds.has(issue.id);
        const billed = isBilledIssue(issue) || invoiced;
        const statusLabel = billed
          ? "Billed"
          : humanizeOptionLabel(issue.status);
        const statusTone = billed
          ? "green"
          : dispensed
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
      width: "180px",
      disableRowClick: true,
      sortable: true,
      render: (issue: any) => {
        const cancelled = isCancelledIssue(issue);
        const invoiced = invoicedIssueIds.has(issue.id);
        const billed = isBilledIssue(issue) || invoiced;
        const busyAmount = amountBusy(issue);
        const hasAmount = hasPositiveIssueAmount(issue);

        return editingAmountId === issue.id ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              autoFocus
              value={editingAmountValue}
              onChange={(event: any) =>
                setEditingAmountValue(event.target.value)
              }
              onKeyDown={(event: any) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveIssueAmount(issue);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEditAmount();
                }
              }}
              className="w-16 rounded-xl border px-2 py-1 text-sm outline-none focus:border-slate-500"
            />
            <button
              type="button"
              disabled={busyAmount}
              onClick={() => saveIssueAmount(issue)}
              className="rounded-xl border px-2 py-1 text-xs font-bold disabled:bg-slate-50 disabled:text-slate-300"
            >
              {busyAmount ? "Saving" : "Save"}
            </button>
            <button
              type="button"
              onClick={cancelEditAmount}
              className="rounded-xl border px-2 py-1 text-xs font-bold"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <b className={`text-xs ${hasAmount ? "" : "text-amber-700"}`}>
              {hasAmount ? `₹${issue.amount}` : "Enter amount"}
            </b>
            {canEditPharmacyIssue && (
              <button
                type="button"
                disabled={cancelled || billed}
                onClick={() => startEditAmount(issue)}
                className="rounded-xl border px-2 py-1 text-xs font-bold disabled:bg-slate-50 disabled:text-slate-300"
              >
                Edit
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: "action",
      header: "Action",
      width: "100px",
      className: "text-center",
      disableRowClick: true,
      render: (issue: any) => {
        const dispensed = isDispensed(issue);
        const cancelled = isCancelledIssue(issue);
        const invoiced = invoicedIssueIds.has(issue.id);
        const rowBusy = busy === issue.id;
        const invoiceBusy = busy === `invoice-${issue.id}`;
        const hasAmount = hasPositiveIssueAmount(issue);

        return (
          <div className="ml-auto flex justify-center">
            <RowActions
              className="right-8 top-0"
              width="w-48"
              actions={[
                {
                  label: "Partial dispense",
                  hidden: !canDispensePharmacyIssue,
                  disabled:
                    dispensed ||
                    cancelled ||
                    invoiced ||
                    rowBusy ||
                    invoiceBusy,
                  onClick: () => handleIssueAction(issue, "partial"),
                },
                {
                  label: "Dispense",
                  hidden: !canDispensePharmacyIssue,
                  disabled:
                    dispensed ||
                    cancelled ||
                    invoiced ||
                    rowBusy ||
                    invoiceBusy,
                  onClick: () => handleIssueAction(issue, "dispense"),
                },
                {
                  label: hasAmount
                    ? "Generate invoice"
                    : "Generate invoice (enter amount)",
                  hidden: invoiced || !canBillPharmacyIssue,
                  disabled: !hasAmount || rowBusy || invoiceBusy,
                  onClick: () => handleIssueAction(issue, "invoice"),
                },
                {
                  label: "Cancel order",
                  hidden: !canDispensePharmacyIssue,
                  disabled:
                    dispensed ||
                    cancelled ||
                    invoiced ||
                    rowBusy ||
                    invoiceBusy,
                  danger: true,
                  onClick: () => handleIssueAction(issue, "confirm-cancel"),
                },
              ]}
            />
          </div>
        );
      },
    },
  ];
}
