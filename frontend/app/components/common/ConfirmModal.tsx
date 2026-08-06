"use client";

import { useState } from "react";
import { Button, Card } from "@/app/components/common/ui";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";

interface ConfirmValues {
  reason: string;
  amount: number | null;
}

interface ConfirmModalProps {
  action?: any;
  busy?: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  requireReason?: boolean;
  showReason?: boolean;
  reasonLabel?: string;
  requireAmount?: boolean;
  amountLabel?: string;
  onCancel: () => void;
  onConfirm: (values: ConfirmValues) => void;
}

export function ConfirmModal({
  action,
  busy,
  title: titleProp,
  message: messageProp,
  confirmLabel,
  requireReason = false,
  showReason,
  reasonLabel = "Reason",
  requireAmount = false,
  amountLabel = "Amount",
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");

  const isDelete = action?.kind === "delete";
  const item =
    action?.branch ||
    action?.department ||
    action?.role ||
    action?.user ||
    action?.file ||
    action?.row;

  const label =
    action?.entity === "branch"
      ? "Branch"
      : action?.entity === "department"
        ? "Medical Department"
        : action?.entity === "role"
          ? "Role"
          : action?.entity === "user"
            ? "User"
            : action?.entity === "file"
              ? "File"
              : "Item";

  const name = item?.name || item?.email || item?.file_name || "this item";

  const isHardDelete = action?.entity === "file";

  const title =
    titleProp ??
    (action?.entity
      ? isDelete
        ? `Delete ${label}`
        : `Change ${label} Status`
      : `Confirm ${action?.kind}`);

  const message =
    messageProp ??
    (isHardDelete
      ? `Delete "${name}"? This action cannot be undone.`
      : action?.entity
        ? isDelete
          ? `Delete ${name}? This will deactivate the record and keep history for audit/reference.`
          : `${item?.is_active ? "Deactivate" : "Activate"} ${name}?`
        : `This will ${
            isDelete ? "deactivate/delete" : "change status for"
          } ${name}. Continue?`);

  const amountValue = amount === "" ? null : Number(amount);
  const canConfirm =
    !busy &&
    (!requireReason || reason.trim().length > 0) &&
    (!requireAmount || (amountValue !== null && amountValue > 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 ">
      <Card className="w-full max-w-sm">
        <h3 className="text-lg font-bold">{title}</h3>

        <p className="mt-3 text-sm text-slate-600">{message}</p>

        {(showReason ?? requireReason) && (
          <div className="mt-4">
            <label className="text-xs font-bold text-slate-600">
              {reasonLabel}
            </label>
            <textarea
              autoFocus
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={reasonLabel}
            />
          </div>
        )}

        {requireAmount && (
          <div className="mt-3">
            <label className="text-xs font-bold text-slate-600">
              {amountLabel}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={amountLabel}
            />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Cancel
          </button>
          <Button
            onClick={() =>
              onConfirm({ reason: reason.trim(), amount: amountValue })
            }
            disabled={!canConfirm}
          >
            <ButtonLoader loading={Boolean(busy)}>
              {busy
                ? "Working..."
                : (confirmLabel ??
                  (isDelete && action?.entity ? `Delete ${label}` : "Confirm"))}
            </ButtonLoader>
          </Button>
        </div>
      </Card>
    </div>
  );
}
