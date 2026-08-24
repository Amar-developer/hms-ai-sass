"use client";

import { useState } from "react";
import { Badge, Button, Input } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { money } from "@/utils/helper";
import { isoToDisplayDate } from "@/utils/helper";
import {
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_STATUS_LABEL,
  EXPENSE_STATUS_TONE,
} from "../constants";
import type { Expense } from "../types";

type ExpenseDetailProps = {
  expense: Expense;
  canApprove: boolean;
  busy?: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onAttachReceipt?: (id: string, receiptFileId: string) => void;
};

function categoryLabel(category: Expense["category"]) {
  return (
    EXPENSE_CATEGORY_OPTIONS.find((option) => option.value === category)
      ?.label || category
  );
}

export function ExpenseDetail({
  expense,
  canApprove,
  busy,
  onClose,
  onApprove,
  onReject,
  onAttachReceipt,
}: ExpenseDetailProps) {
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectField, setShowRejectField] = useState(false);
  const [receiptFileId, setReceiptFileId] = useState("");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">{expense.description}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {categoryLabel(expense.category)} · {expense.branchName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="close-button font-bold"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Amount
            </p>
            <p className="mt-1 font-bold">{money(expense.amount)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Date Incurred
            </p>
            <p className="mt-1">{isoToDisplayDate(expense.incurredOn)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Submitted By
            </p>
            <p className="mt-1">{expense.submittedBy}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Status
            </p>
            <Badge
              tone={EXPENSE_STATUS_TONE[expense.status]}
              className="mt-1 inline-flex px-2 py-1 text-xs rounded-lg"
            >
              {EXPENSE_STATUS_LABEL[expense.status]}
            </Badge>
          </div>
        </div>

        {/* {expense.receiptName ? (
          <p className="mt-3 text-xs text-slate-500">
            Receipt:{" "}
            <span className="font-bold text-slate-700">
              {expense.receiptName}
            </span>
          </p>
        ) : (
          onAttachReceipt && (
            <div className="mt-3">
              <FormField label="Attach Receipt (File ID)">
                <div className="flex gap-2">
                  <Input
                    value={receiptFileId}
                    onChange={(e: any) => setReceiptFileId(e.target.value)}
                    placeholder="Uploaded file ID"
                  />
                  <Button
                    type="button"
                    disabled={!receiptFileId.trim() || busy}
                    onClick={() => {
                      onAttachReceipt(expense.id, receiptFileId.trim());
                      setReceiptFileId("");
                    }}
                    className="bg-slate-100 text-slate-700 rounded-lg px-4 py-2.5 lg:px-4 lg:py-2.5 md:text-base lg:text-xs border font-bold"
                  >
                    Attach
                  </Button>
                </div>
              </FormField>
            </div>
          )
        )} */}

        {expense.status === "rejected" && expense.rejectionReason && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-fg">
            Rejected: {expense.rejectionReason}
          </p>
        )}

        {canApprove && expense.status === "pending" && (
          <div className="mt-5">
            {showRejectField && (
              <FormField label="Rejection Reason" required>
                <Input
                  value={rejectionReason}
                  onChange={(e: any) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this claim is rejected"
                />
              </FormField>
            )}
            <div className="mt-3 flex justify-end gap-2">
              {!showRejectField ? (
                <Button
                  type="button"
                  onClick={() => setShowRejectField(true)}
                  className="close-button bg-slate-200 text-slate-900 hover:bg-slate-300 font-bold"
                >
                  Reject
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={!rejectionReason.trim() || busy}
                  onClick={() => onReject(expense.id, rejectionReason.trim())}
                  className="close-button bg-slate-200 text-slate-900 hover:bg-slate-300 font-bold"
                >
                  Confirm Reject
                </Button>
              )}
              <Button
                type="button"
                className="close-button"
                disabled={busy}
                onClick={() => onApprove(expense.id)}
              >
                Approve
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
