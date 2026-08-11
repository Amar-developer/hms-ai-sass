"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, PlusCircle } from "lucide-react";
import { Button, Card, Input, StatusToast } from "@/app/components/common/ui";
import { DataTable } from "@/app/components/common/DataTable";
import { FilterSection, FilterConfig } from "@/app/components/common/FilterSection";
import { FormField } from "@/app/components/FormElements";
import { ExpenseSummaryTiles } from "./components/ExpenseSummaryTiles";
import { ExpenseDetail } from "./components/ExpenseDetail";
import { ExpenseForm } from "./forms/ExpenseForm";
import { getExpenseColumns } from "./columns";
import { getMonthColumns } from "./monthColumns";
import { groupExpensesByMonth, mapExpense, monthLabel } from "./helpers";
import { useExpenseActions, useExpensesData, useRecentSubcategories } from "./api";
import {
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_STATUS_FILTER_OPTIONS,
} from "./constants";
import type { Expense } from "./types";
import type { ExpenseFormSchemaValues } from "./expenses.schema";

export default function Expense({ setActive, clinic, apiSession }: any) {
  useEffect(() => {
    setActive?.("expense");
  }, [setActive]);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [receiptTargetExpense, setReceiptTargetExpense] = useState<Expense | null>(null);
  const [receiptFileId, setReceiptFileId] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { rawExpenses, loading, error, reload } = useExpensesData(apiSession, {
    status: filterStatus,
    category: filterCategory,
    query: debouncedQuery,
  });
  const {
    busy,
    message,
    setMessage,
    createExpense,
    updateExpense,
    attachReceipt,
    approveExpense,
    rejectExpense,
    reimburseExpense,
  } = useExpenseActions(apiSession, reload);
  const { subcategories: recentSubcategories, reload: reloadSubcategories } =
    useRecentSubcategories(apiSession);

  const branchNameById = useMemo(() => {
    const entries = (clinic?.branches || []).map((branch: any) => [branch.id, branch.name]);
    return Object.fromEntries(entries) as Record<string, string>;
  }, [clinic]);

  const branchOptions = useMemo(
    () =>
      (clinic?.branches || []).map((branch: any) => ({
        value: branch.id,
        label: branch.name,
      })),
    [clinic],
  );

  const rows = useMemo(
    () => rawExpenses.map((raw) => mapExpense(raw, branchNameById, apiSession?.user?.id)),
    [rawExpenses, branchNameById, apiSession?.user?.id],
  );

  const monthGroups = useMemo(() => groupExpensesByMonth(rows), [rows]);
  const monthRows = selectedMonth
    ? rows.filter((expense) => expense.incurredOn.slice(0, 7) === selectedMonth)
    : [];

  const filters: FilterConfig[] = [
    {
      key: "status",
      label: "Status",
      options: EXPENSE_STATUS_FILTER_OPTIONS,
    },
    {
      key: "category",
      label: "Category",
      options: [
        { value: "all", label: "All Categories" },
        ...EXPENSE_CATEGORY_OPTIONS,
      ],
    },
  ];

  const handleFilterChange = (key: string, value: string) => {
    if (key === "status") setFilterStatus(value);
    if (key === "category") setFilterCategory(value);
  };

  const handleReset = () => {
    setQuery("");
    setFilterStatus("all");
    setFilterCategory("all");
  };

  async function handleCreate(values: ExpenseFormSchemaValues) {
    const ok = await createExpense({
      branch_id: values.branchId || null,
      category: values.category,
      subcategory: values.subcategory,
      amount: Number(values.amount),
      currency: "INR",
      incurred_on: values.incurredOn,
      description: values.description,
    });
    if (ok) {
      setShowForm(false);
      void reloadSubcategories();
    }
  }

  async function handleUpdate(id: string, values: ExpenseFormSchemaValues) {
    const ok = await updateExpense(id, {
      branch_id: values.branchId || null,
      category: values.category,
      subcategory: values.subcategory,
      amount: Number(values.amount),
      currency: "INR",
      incurred_on: values.incurredOn,
      description: values.description,
    });
    if (ok) {
      setEditingExpense(null);
      void reloadSubcategories();
    }
  }

  async function handleApprove(id: string) {
    const ok = await approveExpense(id);
    if (ok) setSelectedExpense(null);
  }

  async function handleReject(id: string, reason: string) {
    const ok = await rejectExpense(id, reason);
    if (ok) setSelectedExpense(null);
  }

  async function handleReimburse(id: string) {
    const ok = await reimburseExpense(id);
    if (ok) setSelectedExpense(null);
  }

  async function handleAttachReceipt(id: string, fileId: string) {
    await attachReceipt(id, fileId);
  }

  async function handleQuickAttachReceipt() {
    if (!receiptTargetExpense || !receiptFileId.trim()) return;
    const ok = await attachReceipt(receiptTargetExpense.id, receiptFileId.trim());
    if (ok) {
      setReceiptTargetExpense(null);
      setReceiptFileId("");
    }
  }

  const isBusy = Boolean(busy);

  return (
    <div className="grid gap-4">
      <StatusToast message={message || error} onClose={() => setMessage("")} />

      <ExpenseSummaryTiles expenses={rows} />

      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            {selectedMonth && (
              <button
                type="button"
                onClick={() => setSelectedMonth(null)}
                className="mb-1 flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                <ArrowLeft size={14} />
                All months
              </button>
            )}
            <h3 className="card-title font-bold">
              {selectedMonth ? monthLabel(selectedMonth) : "Expenses"}
            </h3>
            <p className="card-desc text-slate-500">
              {selectedMonth
                ? "Individual expense claims for this month."
                : "Track, approve, and reimburse staff expense claims across branches."}
            </p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="flex items-center justify-between rounded-lg gap-2 w-44 text-xs px-3 py-2 lg:px-4 lg:py-3"
          >
            <div className="flex items-center">
              <PlusCircle size={16} />
              <p className="pl-2">Add New</p>
            </div>
          </Button>
        </div>

        <FilterSection
          query={query}
          setQuery={setQuery}
          title="Expenses"
          className="lg:grid-cols-4"
          searchPlaceholder="Search description"
          filters={filters}
          filterValues={{ status: filterStatus, category: filterCategory }}
          onFilterChange={handleFilterChange}
          onReset={handleReset}
        />

        <div className="mt-4 overflow-auto max-w-[1000px]">
          {selectedMonth ? (
            <DataTable
              columns={getExpenseColumns(
                (row) => setEditingExpense(row),
                (row) => setReceiptTargetExpense(row),
              )}
              data={monthRows}
              emptyMessage={loading ? "Loading expenses..." : "No expenses found for this month."}
              onRowClick={(row: Expense) => setSelectedExpense(row)}
              className="max-w-[1000px] overflow-auto"
            />
          ) : (
            <DataTable
              columns={getMonthColumns()}
              data={monthGroups}
              emptyMessage={loading ? "Loading expenses..." : "No expenses found."}
              onRowClick={(row: { monthKey: string }) => setSelectedMonth(row.monthKey)}
            />
          )}
        </div>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold">New Expense</h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="close-button font-bold"
              >
                Close
              </button>
            </div>
            <div className="mt-4">
              <ExpenseForm
                branchOptions={branchOptions}
                recentSubcategories={recentSubcategories}
                busy={isBusy}
                initialValues={
                  selectedMonth
                    ? {
                        category: "supplies",
                        subcategory: "",
                        amount: "",
                        incurredOn: `${selectedMonth}-01`,
                        branchId: branchOptions[0]?.value ?? "",
                        description: "",
                      }
                    : undefined
                }
                onCancel={() => setShowForm(false)}
                onSubmit={handleCreate}
              />
            </div>
          </div>
        </div>
      )}

      {editingExpense && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold">Edit Expense</h3>
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="close-button font-bold"
              >
                Close
              </button>
            </div>
            <div className="mt-4">
              <ExpenseForm
                branchOptions={branchOptions}
                recentSubcategories={recentSubcategories}
                busy={isBusy}
                submitLabel="Save Changes"
                initialValues={{
                  category: editingExpense.category,
                  subcategory: editingExpense.subcategory ?? "",
                  amount: String(editingExpense.amount),
                  incurredOn: editingExpense.incurredOn,
                  branchId: editingExpense.branchId ?? "",
                  description: editingExpense.description,
                }}
                onCancel={() => setEditingExpense(null)}
                onSubmit={(values) => handleUpdate(editingExpense.id, values)}
              />
            </div>
          </div>
        </div>
      )}

      {receiptTargetExpense && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold">Add Receipt</h3>
              <button
                type="button"
                onClick={() => {
                  setReceiptTargetExpense(null);
                  setReceiptFileId("");
                }}
                className="close-button font-bold"
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {receiptTargetExpense.description}
            </p>
            <div className="mt-4">
              <FormField label="Receipt File ID" required>
                <Input
                  value={receiptFileId}
                  onChange={(e: any) => setReceiptFileId(e.target.value)}
                  placeholder="Uploaded file ID"
                />
              </FormField>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setReceiptTargetExpense(null);
                    setReceiptFileId("");
                  }}
                  className="bg-slate-100 text-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!receiptFileId.trim() || isBusy}
                  onClick={handleQuickAttachReceipt}
                >
                  Attach
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedExpense && (
        <ExpenseDetail
          expense={selectedExpense}
          canApprove
          busy={isBusy}
          onClose={() => setSelectedExpense(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onReimburse={handleReimburse}
          onAttachReceipt={handleAttachReceipt}
        />
      )}
    </div>
  );
}
