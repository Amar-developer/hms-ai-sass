"use client";

import { Button, Card } from "@/components/common/ui";

export function ConfirmModal({ action, busy, onCancel, onConfirm }: any) {
  const isDelete = action.kind === "delete";
  const item =
    action.entity === "branch"
      ? action.branch
      : action.entity === "department"
        ? action.department
        : action.entity === "role"
          ? action.role
          : action.user;
  const label =
    action.entity === "branch"
      ? "Branch"
      : action.entity === "department"
        ? "Medical Department"
        : action.entity === "role"
          ? "Role"
          : "User";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-md">
        <h3 className="text-lg font-bold">
          {isDelete ? `Delete ${label}` : `Change ${label} Status`}
        </h3>
        <p className="mt-3 text-sm text-slate-600">
          {isDelete
            ? `Delete ${item.name}? This will deactivate the record and keep history for audit/reference.`
            : `${item.is_active ? "Deactivate" : "Activate"} ${item.name}?`}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Working..." : isDelete ? `Delete ${label}` : "Confirm"}
          </Button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        </div>
      </Card>
    </div>
  );
}
