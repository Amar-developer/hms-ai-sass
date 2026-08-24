"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge, Button } from "@/app/components/common/ui";
import { DataTable } from "@/app/components/common/DataTable";
import { RowActions } from "@/features/admin/components/RowActions";
import { StatusToast } from "@/app/components/common/ui";
import { money } from "@/utils/helper";
import { EXPENSE_CATEGORY_OPTIONS } from "../constants";
import {
  useExpenseSubcategoryActions,
  useExpenseSubcategoryConfigs,
} from "../api";
import type { ExpenseSubcategoryConfig } from "../types";
import type { ExpenseSubcategoryFormValues } from "../expenses.schema";
import { ExpenseSubcategoryForm } from "./ExpenseSubcategoryForm";

function categoryLabel(category: string) {
  return (
    EXPENSE_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ||
    category
  );
}

type ExpenseSubcategoriesAdminProps = {
  apiSession: any;
  onClose: () => void;
};

export function ExpenseSubcategoriesAdmin({
  apiSession,
  onClose,
}: ExpenseSubcategoriesAdminProps) {
  const [editing, setEditing] = useState<ExpenseSubcategoryConfig | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { subcategoryConfigs, loading, reload } =
    useExpenseSubcategoryConfigs(apiSession);
  const {
    busy,
    message,
    setMessage,
    createExpenseSubcategoryConfig,
    updateExpenseSubcategoryConfig,
    deleteExpenseSubcategoryConfig,
  } = useExpenseSubcategoryActions(apiSession, reload);

  const isBusy = Boolean(busy);

  async function handleCreate(values: ExpenseSubcategoryFormValues) {
    const ok = await createExpenseSubcategoryConfig({
      category: values.category,
      name: values.name,
      default_amount: values.defaultAmount ? Number(values.defaultAmount) : null,
      requires_quantity: values.requiresQuantity,
    });
    if (ok) setShowCreate(false);
  }

  async function handleUpdate(values: ExpenseSubcategoryFormValues) {
    if (!editing) return;
    const ok = await updateExpenseSubcategoryConfig(editing.id, {
      category: values.category,
      name: values.name,
      default_amount: values.defaultAmount ? Number(values.defaultAmount) : null,
      requires_quantity: values.requiresQuantity,
      is_active: values.isActive ? values.isActive === "true" : undefined,
    });
    if (ok) setEditing(null);
  }

  async function handleDeactivate(row: ExpenseSubcategoryConfig) {
    await deleteExpenseSubcategoryConfig(row.id);
  }

  const columns = [
    {
      key: "category",
      header: "Category",
      width: "50px",
      render: (row: ExpenseSubcategoryConfig) => (
        <span className="text-sm">{categoryLabel(row.category)}</span>
      ),
    },
    {
      key: "name",
      header: "Sub Category",
      width: "60px",
      render: (row: ExpenseSubcategoryConfig) => (
        <span className="text-sm font-bold">{row.name}</span>
      ),
    },
    {
      key: "defaultAmount",
      header: "Amount",
      width: "40px",
      render: (row: ExpenseSubcategoryConfig) => (
        <span className="text-sm">
          {row.defaultAmount != null ? money(row.defaultAmount) : "—"}
        </span>
      ),
    },
    {
      key: "requiresQuantity",
      header: "Requires Quantity",
      width: "60px",
      className: "text-center",
      cellClassName: "text-center",
      render: (row: ExpenseSubcategoryConfig) => (
        <span className="text-sm">{row.requiresQuantity ? "Yes" : "No"}</span>
      ),
    },
    {
      key: "isActive",
      header: "Status",
      width: "40px",
      className: "text-center",
      cellClassName: "text-center",
      render: (row: ExpenseSubcategoryConfig) => (
        <Badge
          tone={row.isActive ? "green" : "red"}
          className="normal-label text-sm"
        >
          {row.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "50px",
      className: "text-center",
      cellClassName: "text-right",
      render: (row: ExpenseSubcategoryConfig) => (
        <RowActions
          actions={[
            { label: "Edit", onClick: () => setEditing(row) },
            {
              label: "Deactivate",
              onClick: () => handleDeactivate(row),
              disabled: !row.isActive,
              danger: true,
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <div className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="card-title font-bold">Manage Expense Subcategories</h3>
            <p className="mt-1 card-desc text-slate-500">
              Assign subcategories to a category, set a fixed default amount, and
              flag whether it needs a quantity on the expense form.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border p-2 rounded-md hover:bg-slate-200 font-bold"
          >
            <X size={16} />
          </button>
        </div>

        <StatusToast message={message} onClose={() => setMessage("")} />

        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => setShowCreate(true)}
            className="save-button text-xs px-3 py-2"
          >
            Add Subcategory
          </Button>
        </div>

        <div className="mt-3 max-h-[55vh]  overflow-auto">
          <DataTable
            columns={columns}
            data={subcategoryConfigs}
            emptyMessage={loading ? "Loading..." : "No subcategories configured."}
            emptyDescription="Add a subcategory to give it a fixed default amount."
            minBodyHeight="160px"
            className="max-w-[800px]"
          />
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold">Add Subcategory</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-2 rounded-md border hover:bg-slate-200 font-bold"
              >
                <X size={16}/>
              </button>
            </div>
            <div className="mt-4">
              <ExpenseSubcategoryForm
                busy={isBusy}
                onCancel={() => setShowCreate(false)}
                onSubmit={handleCreate}
              />
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold">Edit Subcategory</h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="close-button font-bold"
              >
                Close
              </button>
            </div>
            <div className="mt-4">
              <ExpenseSubcategoryForm
                subcategory={editing}
                busy={isBusy}
                onCancel={() => setEditing(null)}
                onSubmit={handleUpdate}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
