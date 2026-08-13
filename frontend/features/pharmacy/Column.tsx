import { Column } from "@/utils/types";
import { displayDate, displayDateTime } from "@/utils/helper";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import { ActionButton, Badge, Button } from "@/app/components/common/ui";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";
import { RowActions } from "../admin/components/RowActions";
import { isBilledIssue, isCancelledIssue, isDispensed } from "./helpers";

export function getPrescriptionColumns({
  busy,
  canCreatePharmacyIssue,
  onView,
  onCreate,
  onDismiss,
}: {
  busy: string;
  canCreatePharmacyIssue: boolean;
  onView: (a: any) => void;
  onCreate: (a: any) => void;
  onDismiss: (a: any) => void;
}): Column<any>[] {
  return [
    {
      key: "prescription",
      header: "Prescription",
      render: (a: any) => <span className="font-bold">{a.token || "-"}</span>,
    },
    {
      key: "patient",
      header: "Patient",
      render: (a: any) => <span className="font-semibold">{a.patient}</span>,
    },
    {
      key: "doctor",
      header: "Doctor",
      cellClassName: "text-slate-600",
      render: (a: any) =>
        a.doctor && a.doctor !== "Unassigned" ? a.doctor : "-",
    },
    {
      key: "date",
      header: "Date & Time",
      cellClassName: "whitespace-nowrap text-slate-600",
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
          <ActionButton onClick={() => onView(a)} className="close-button">
            View
          </ActionButton>
          {canCreatePharmacyIssue && (
            <Button
              disabled={busy === a.consultationId}
              onClick={() => onCreate(a)}
              className="rounded-lg px-2 py-2 text-xs lg:px-4"
            >
              {busy === a.consultationId ? "Creating..." : "Create Issue"}
            </Button>
          )}
          <ActionButton onClick={() => onDismiss(a)} className="close-button">
            Remove
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
      header: "#",
      width: "80px",
      render: (_, index) => <b>{(safePage - 1) * pageSize + index + 1}</b>,
    },
    {
      key: "created_at",
      header: "Date & Time",
      width: "150px",
      render: (issue: any) => (
        <>
          <b className="text-xs">{displayDate(issue.created_at)}</b>
          <p className="text-xs text-slate-500">
            {new Date(issue.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </>
      ),
    },
    {
      key: "patient",
      header: "Patient",
      width: "150px",
      render: (issue: any) => {
        const p: any = patientMap.get(issue.patient_id);

        return (
          <div className="text-xs">
            <div className="flex items-center gap-2">
              <span>
                {issue.patient_name ||
                  p?.name ||
                  publicDisplayValue(issue.patient_id, "Patient")}
              </span>
              <CopyIdButton
                value={issue.id}
                label="Pharmacy Issue ID"
                allowed={canCopyIds}
              />
            </div>
            <PatientFlagBadges patient={p} className="mt-1" />
          </div>
        );
      },
    },
    {
      key: "source",
      header: "Source",
      width: "140px",
      render: (issue: any) => (
        <Badge className="normal-badge w-[70%] text-xs px-2">
          {humanizeOptionLabel(issue.source)}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "150px",
      render: (issue: any) => {
        const dispensed = isDispensed(issue);
        const cancelled = isCancelledIssue(issue);
        const invoiced = invoicedIssueIds.has(issue.id);
        const billed = isBilledIssue(issue) || invoiced;
        const statusLabel = billed ? "Billed" : humanizeOptionLabel(issue.status);
        const statusTone = billed
          ? "green"
          : dispensed
            ? "green"
            : cancelled
              ? "red"
              : "amber";

        return (
          <Badge tone={statusTone as any} className="normal-badge w-[60%] text-xs">
            {statusLabel}
          </Badge>
        );
      },
    },
    {
      key: "amount",
      header: "Amount",
      width: "100px",
      disableRowClick: true,
      render: (issue: any) => {
        const cancelled = isCancelledIssue(issue);
        const invoiced = invoicedIssueIds.has(issue.id);
        const billed = isBilledIssue(issue) || invoiced;
        const busyAmount = amountBusy(issue);

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
              className="w-20 rounded-xl border px-2 py-1 text-sm outline-none focus:border-slate-500"
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
            <b>₹{issue.amount}</b>
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
      width: "80px",
      className: "text-center",
      disableRowClick: true,
      render: (issue: any) => {
        const dispensed = isDispensed(issue);
        const cancelled = isCancelledIssue(issue);
        const invoiced = invoicedIssueIds.has(issue.id);
        const rowBusy = busy === issue.id;
        const invoiceBusy = busy === `invoice-${issue.id}`;

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
                    dispensed || cancelled || invoiced || rowBusy || invoiceBusy,
                  onClick: () => handleIssueAction(issue, "partial"),
                },
                {
                  label: "Dispense",
                  hidden: !canDispensePharmacyIssue,
                  disabled:
                    dispensed || cancelled || invoiced || rowBusy || invoiceBusy,
                  onClick: () => handleIssueAction(issue, "dispense"),
                },
                {
                  label: "Generate invoice",
                  hidden: invoiced || !canBillPharmacyIssue,
                  disabled: rowBusy || invoiceBusy,
                  onClick: () => handleIssueAction(issue, "invoice"),
                },
                {
                  label: "Cancel order",
                  hidden: !canDispensePharmacyIssue,
                  disabled:
                    dispensed || cancelled || invoiced || rowBusy || invoiceBusy,
                  danger: true,
                  onClick: () => handleIssueAction(issue, "cancel"),
                },
              ]}
            />
          </div>
        );
      },
    },
  ];
}
