"use client";

import { Button, Card } from "@/app/components/common/ui";

interface ConfirmModalProps {
  action: any;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({
  action,
  busy,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const isDelete = action.kind === "delete";

  const item =
    action.branch ||
    action.department ||
    action.role ||
    action.user ||
    action.row;

  const label =
    action.entity === "branch"
      ? "Branch"
      : action.entity === "department"
        ? "Medical Department"
        : action.entity === "role"
          ? "Role"
          : action.entity === "user"
            ? "User"
            : "Item";

  const name = item?.name || item?.email || "this item";

  const title = action.entity
    ? isDelete
      ? `Delete ${label}`
      : `Change ${label} Status`
    : `Confirm ${action.kind}`;

  const message = action.entity
    ? isDelete
      ? `Delete ${name}? This will deactivate the record and keep history for audit/reference.`
      : `${item?.is_active ? "Deactivate" : "Activate"} ${name}?`
    : `This will ${
        isDelete ? "deactivate/delete" : "change status for"
      } ${name}. Continue?`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 ">
      <Card className="w-full max-w-sm">
        <h3 className="text-lg font-bold">{title}</h3>

        <p className="mt-3 text-sm text-slate-600">{message}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Cancel
          </button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy
              ? "Working..."
              : isDelete && action.entity
                ? `Delete ${label}`
                : "Confirm"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
