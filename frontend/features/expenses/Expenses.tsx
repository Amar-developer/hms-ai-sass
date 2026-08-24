"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, PlusCircle, Wallet, CalendarRange, X } from "lucide-react";
import {
  Button,
  Card,
  Input,
  RefreshButton,
  StatusToast,
} from "@/app/components/common/ui";
import { DataTable } from "@/app/components/common/DataTable";
import { AdaptiveFilterTrigger } from "@/app/components/common/AdaptiveFilterTrigger";
import { AdaptiveSortTrigger } from "@/app/components/common/AdaptiveSortTrigger";
import { AdaptiveResultCount } from "@/app/components/common/AdaptiveResultCount";
import { BreadcrumbSlot } from "@/features/shell/AppShell";
import { FormField } from "@/app/components/FormElements";
import { getExpenseTableSchema, getExpenseQueryFields } from "./filterSchema";
import { sortRows } from "@/utils/sortRows";
import { applyQueryFilters, type QueryFilterRow } from "@/utils/queryFilter";
import type { QueryFieldOption } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";
import { ExpenseSummaryTiles } from "./components/ExpenseSummaryTiles";
import { ExpenseDetail } from "./components/ExpenseDetail";
import { ExpenseForm } from "./forms/ExpenseForm";
import { ExpenseSubcategoriesAdmin } from "./subcategories/ExpenseSubcategoriesAdmin";
import { getExpenseColumns } from "./columns";
import { getMonthColumns } from "./monthColumns";
import { groupExpensesByMonth, mapExpense, monthLabel } from "./helpers";
import {
  useExpenseActions,
  useExpensesData,
  useExpenseSubcategoryConfigs,
  useRecentSubcategories,
} from "./api";
import { fetchExpenseFilterOptions } from "./api/expenses.api";
import { canManageExpenseSubcategories } from "./permissions";
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
  const DEFAULT_SORT: SortState = { key: "updatedAt", dir: "desc" };
  const [sort, setSort] = useState<SortState | null>(DEFAULT_SORT);
  const [queryFilters, setQueryFilters] = useState<QueryFilterRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [receiptTargetExpense, setReceiptTargetExpense] =
    useState<Expense | null>(null);
  const [receiptFileId, setReceiptFileId] = useState("");
  const [showSubcategoryAdmin, setShowSubcategoryAdmin] = useState(false);
  const [filterOptions, setFilterOptions] = useState<
    Record<string, QueryFieldOption[]>
  >({});

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { rawExpenses, loading, error, reload } = useExpensesData(apiSession, {
    status: filterStatus,
    category: filterCategory,
    query: debouncedQuery,
    queryFilters: selectedMonth ? queryFilters : [],
    sort: selectedMonth ? sort : null,
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
  } = useExpenseActions(apiSession, reload);
  const { subcategoryConfigs, reload: reloadSubcategoryConfigs } =
    useExpenseSubcategoryConfigs(apiSession, { activeOnly: true });
  const { recentSubcategories, reload: reloadRecentSubcategories } =
    useRecentSubcategories(apiSession);
  const canManageSubcategories = canManageExpenseSubcategories(apiSession?.user);

  const branchNameById = useMemo(() => {
    const entries = (clinic?.branches || []).map((branch: any) => [
      branch.id,
      branch.name,
    ]);
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
    () =>
      rawExpenses.map((raw) =>
        mapExpense(raw, branchNameById, apiSession?.user?.id),
      ),
    [rawExpenses, branchNameById, apiSession?.user?.id],
  );

  const [selectedMonthNum, selectedYearNum] = useMemo(() => {
    if (!selectedMonth) return [undefined, undefined];
    const [year, month] = selectedMonth.split("-").map(Number);
    return [month, year];
  }, [selectedMonth]);

  const rawMonthGroups = useMemo(() => groupExpensesByMonth(rows), [rows]);
  const rawMonthRows = useMemo(
    () =>
      selectedMonth
        ? rows.filter(
            (expense) => expense.incurredOn.slice(0, 7) === selectedMonth,
          )
        : [],
    [rows, selectedMonth],
  );

  const expenseQueryFields = useMemo(
    () =>
      getExpenseQueryFields(
        selectedMonth ? "expenses" : "months",
        selectedMonth ? rawMonthRows : rawMonthGroups,
        filterOptions,
      ),
    [selectedMonth, rawMonthRows, rawMonthGroups, filterOptions],
  );

  // Query filters are field-key based and the two views have different
  // field sets — clear them on switching so a stale filter from one view
  // doesn't silently no-op in the other.
  useEffect(() => {
    setQueryFilters([]);
  }, [Boolean(selectedMonth)]);

  const monthGroups = useMemo(
    () =>
      sortRows(
        applyQueryFilters(rawMonthGroups, expenseQueryFields, queryFilters),
        selectedMonth ? null : sort,
      ),
    [rawMonthGroups, expenseQueryFields, queryFilters, selectedMonth, sort],
  );
  const monthRows = useMemo(
    () =>
      sortRows(selectedMonth ? rawMonthRows : [], selectedMonth ? sort : null),
    [rawMonthRows, selectedMonth, sort],
  );

  const expenseSchema = getExpenseTableSchema(
    selectedMonth ? "expenses" : "months",
  );

  const handleFilterChange = (key: string, value: string) => {
    if (key === "status") setFilterStatus(value);
    if (key === "category") setFilterCategory(value);
  };

  const handleReset = () => {
    setQuery("");
    setFilterStatus("all");
    setFilterCategory("all");
    setSort(DEFAULT_SORT);
    setQueryFilters([]);
  };

  useEffect(() => {
    if (!apiSession) return;
    const params = new URLSearchParams();
    void fetchExpenseFilterOptions(apiSession, params)
      .then((result) => setFilterOptions(result || {}))
      .catch(() => setFilterOptions({}));
  }, [apiSession?.tenantId]);

  async function handleCreate(values: ExpenseFormSchemaValues) {
    const ok = await createExpense({
      branch_id: values.branchId || null,
      category: values.category,
      subcategory: values.subcategory,
      amount: Number(values.amount),
      currency: "INR",
      incurred_on: values.incurredOn,
      description: values.description,
      quantity: values.quantity ? Number(values.quantity) : null,
    });
    if (ok) {
      setShowForm(false);
      void reloadRecentSubcategories();
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
      quantity: values.quantity ? Number(values.quantity) : null,
    });
    if (ok) {
      setEditingExpense(null);
      void reloadRecentSubcategories();
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

  async function handleAttachReceipt(id: string, fileId: string) {
    await attachReceipt(id, fileId);
  }

  async function handleQuickAttachReceipt() {
    if (!receiptTargetExpense || !receiptFileId.trim()) return;
    const ok = await attachReceipt(
      receiptTargetExpense.id,
      receiptFileId.trim(),
    );
    if (ok) {
      setReceiptTargetExpense(null);
      setReceiptFileId("");
    }
  }

  const isBusy = Boolean(busy);

  return (
    <div className="grid gap-4">
      <BreadcrumbSlot>
        <div className="flex items-center gap-2">
          <AdaptiveResultCount
            shown={selectedMonth ? monthRows.length : monthGroups.length}
            total={selectedMonth ? rawMonthRows.length : rawMonthGroups.length}
            noun={selectedMonth ? "expenses" : "months"}
          />
          <RefreshButton
            onRefresh={reload}
            className="h-auto rounded-md px-2.5 py-1 text-[11px]"
          />
          <AdaptiveFilterTrigger
            schema={expenseSchema}
            query={query}
            setQuery={setQuery}
            filterValues={{ status: filterStatus, category: filterCategory }}
            onFilterChange={handleFilterChange}
            sort={sort}
            onSortChange={setSort}
            showSort={false}
            onReset={handleReset}
            queryFields={expenseQueryFields}
            queryFilters={queryFilters}
            onQueryFiltersChange={setQueryFilters}
          />
          <AdaptiveSortTrigger
            fields={expenseSchema.sortFields}
            sort={sort}
            onSortChange={setSort}
          />
        </div>
      </BreadcrumbSlot>
      <StatusToast message={message || error} onClose={() => setMessage("")} />

      <ExpenseSummaryTiles expenses={rows} />

      <Card className="p-0">
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
          <div className="flex items-center gap-2">
            {canManageSubcategories && (
              <button
                type="button"
                onClick={() => setShowSubcategoryAdmin(true)}
                className="border rounded-lg px-3 py-2 text-xs font-bold hover:bg-slate-100"
              >
                Manage Subcategories
              </button>
            )}
            <Button
              onClick={() => setShowForm(true)}
              className="flex items-center justify-between rounded-lg gap-2 w-28 text-xs px-3 py-2 lg:px-4 lg:py-3"
            >
              <div className="flex items-center">
                <PlusCircle size={16} />
                <p className="pl-2">Add New</p>
              </div>
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-auto max-w-[975px]">
          {selectedMonth ? (
            <DataTable
              columns={getExpenseColumns(
                (row) => setEditingExpense(row),
                (row) => setReceiptTargetExpense(row),
              )}
              data={monthRows}
              emptyMessage={
                loading
                  ? "Loading expenses..."
                  : "No expenses found for this month."
              }
              emptyDescription="Staff expense claims submitted for this month will show up here."
              emptyIcon={Wallet}
              minBodyHeight="220px"
              onRowClick={(row: Expense) => setSelectedExpense(row)}
              className="max-w-[975px] overflow-auto"
              sort={sort ?? undefined}
              onSortChange={setSort}
            />
          ) : (
            <DataTable
              columns={getMonthColumns()}
              data={monthGroups}
              emptyMessage={
                loading ? "Loading expenses..." : "No expenses found."
              }
              emptyDescription="Monthly expense claim summaries across branches will show up here."
              emptyIcon={CalendarRange}
              minBodyHeight="220px"
              onRowClick={(row: { monthKey: string }) => {
                setSelectedMonth(row.monthKey);
              }}
              sort={sort ?? undefined}
              onSortChange={setSort}
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
                className="border p-2 rounded-md hover:bg-slate-200 font-bold"
              >
                <X size={16}/>
              </button>
            </div>
            <div className="mt-4">
              <ExpenseForm
                branchOptions={branchOptions}
                subcategoryConfigs={subcategoryConfigs}
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
                selectedMonth={selectedMonthNum}
                selectedYear={selectedYearNum}
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
                subcategoryConfigs={subcategoryConfigs}
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
                  quantity:
                    editingExpense.quantity != null
                      ? String(editingExpense.quantity)
                      : "",
                }}
                onCancel={() => setEditingExpense(null)}
                onSubmit={(values) => handleUpdate(editingExpense.id, values)}
                selectedMonth={selectedMonthNum}
                selectedYear={selectedYearNum}
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
          onAttachReceipt={handleAttachReceipt}
        />
      )}

      {showSubcategoryAdmin && (
        <ExpenseSubcategoriesAdmin
          apiSession={apiSession}
          onClose={() => {
            setShowSubcategoryAdmin(false);
            void reloadSubcategoryConfigs();
          }}
        />
      )}
    </div>
  );
}
