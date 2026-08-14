import { Badge } from "@/app/components/common/ui";
import { RowActions } from "@/features/admin/components/RowActions";
import { money } from "@/utils/helper";
import { isoToDisplayDate } from "@/utils/helper";
import {
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_STATUS_LABEL,
  EXPENSE_STATUS_TONE,
} from "./constants";
import type { Expense } from "./types";

function categoryLabel(category: Expense["category"]) {
  return (
    EXPENSE_CATEGORY_OPTIONS.find((option) => option.value === category)
      ?.label || category
  );
}

export function getExpenseColumns(
  onEdit?: (row: Expense) => void,
  onAddReceipt?: (row: Expense) => void,
) {
  return [
    {
      key: "incurredOn",
      header: "Date",
      width: "110px",
      sortable: true,
      render: (row: Expense) => (
        <span className="text-sm">{isoToDisplayDate(row.incurredOn)}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: "130px",
      sortable: true,
      render: (row: Expense) => (
        <span className="text-sm">{categoryLabel(row.category)}</span>
      ),
    },
    {
      key: "subcategory",
      header: "Sub Category",
      width: "150px",
      render: (row: Expense) => (
        <span className="text-sm">{row.subcategory || "—"}</span>
      ),
    },
    {
      key: "description",
      header: "Description",
      width:"180px",
      render: (row: Expense) => (
        <span className="text-sm">{row.description}</span>
      ),
    },
    {
      key: "branchName",
      header: "Branch",
      width: "200px",
      render: (row: Expense) => (
        <span className="text-sm">{row.branchName}</span>
      ),
    },
    {
      key: "submittedBy",
      header: "Submitted By",
      width: "140px",
      render: (row: Expense) => (
        <span className="text-sm">{row.submittedBy}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      width: "110px",
      sortable: true,
      render: (row: Expense) => (
        <b className="text-sm">{money(row.amount)}</b>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "150px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (row: Expense) => (
        <Badge tone={EXPENSE_STATUS_TONE[row.status]} className="normal-badge text-sm">
          {EXPENSE_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      className: "text-center",
      cellClassName: "text-center",
      render: (row: Expense) => (
        <RowActions
          className="right-12 -bottom-3"
          actions={[
            {
              label: "Edit",
              onClick: () => onEdit?.(row),
              disabled: row.status !== "pending",
            },
            // {
            //   label: "Approve",
            //   onClick: () => {},
            //   disabled: row.status !== "pending",
            // },
            // {
            //   label: "Reimburse",
            //   onClick: () => {},
            //   disabled: row.status !== "approved",
            // },
            // {
            //   label: "Add Receipt",
            //   onClick: () => onAddReceipt?.(row),
            // },
          ]}
        />
      ),
    },
  ];
}
