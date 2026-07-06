import {
  Button,
  ActionGroup,
  ActionButton,
  Card,
  Field,
  Input,
  RefreshButton,
  SearchableSelect,
} from "../common/ui";
import { useState, useMemo, useEffect, useRef } from "react";
import { FormField } from "../FormElements";
import { MoreHorizontal, MoreVertical, Plus } from "lucide-react";
import { isLocked } from "@/utils/tenantAdmin/helpers";
import { Empty } from "../admin/Empty";
import { Pagination } from "../common/Pagination";

export function Header({ title, subtitle, back }: any) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h3 className="card-title font-bold">{title}</h3>
        <p className="card-desc text-slate-500">{subtitle}</p>
      </div>
      <button type="button" onClick={back} className="close-button font-bold">
        Back
      </button>
    </div>
  );
}

export function Actions({ busy, back, disabled, label }: any) {
  return (
    <div className="flex flex-wrap gap-2 md:col-span-2">
      <Button disabled={busy || disabled} className="save-button">
        {busy ? "Saving..." : label}
      </Button>
      <button
        type="button"
        onClick={back}
        className="close-button border font-bold"
      >
        Cancel
      </button>
    </div>
  );
}

export function ClickableRow({ children, onClick, className }: any) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event: any) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      className={`
        flex cursor-pointer gap-0 px-4 py-4 text-sm transition
        hover:bg-slate-50 focus:bg-slate-50 focus:outline-none
        items-center
        ${className ?? ""}
      `}
    >
      {children}
    </div>
  );
}

type Action = {
  label: string;
  onClick: () => void;
  hidden?: boolean;
  disabled?: boolean;
  danger?: boolean;
};

type RowActionsProps = {
  actions: Action[];
  className?:string
};

export function RowActions({ actions,className="right-7 -bottom-5" }: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);

    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div
      ref={menuRef}
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && (
        <div className={`absolute ${className}  mb-2 w-24 rounded-lg border bg-white shadow-lg z-50`}>
          {actions
            .filter((a) => !a.hidden)
            .map((action) => (
              <button
                key={action.label}
                disabled={action.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                  setOpen(false);
                }}
                className={`block w-full px-4 py-1.5 text-left hover:bg-slate-100 ${
                  action.danger ? "text-red-600 hover:bg-red-50" : ""
                }`}
              >
                {action.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function RoleList({ labels }: { labels: string[] }) {
  if (!labels.length) return <span className="text-slate-400">-</span>;
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className="max-w-full truncate rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
          title={labels.join(", ")}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

const MUST_CHANGE_OPTIONS = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

export function PasswordResetModal({ user, busy, onSubmit, onCancel }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-md">
        <h3 className="text-lg font-bold">Reset Password</h3>

        <p className="mt-1 text-sm text-slate-500">
          {user.name} · {user.email}
        </p>

        <form onSubmit={onSubmit} className="mt-4 grid gap-3">
          <Field label="New Password">
            <Input name="newPassword" type="password" minLength={8} required />
          </Field>

          <Field label="Confirm Password">
            <Input
              name="confirmPassword"
              type="password"
              minLength={8}
              required
            />
          </Field>

          <Field label="Must Change On Login">
            <SearchableSelect
              name="mustChangePassword"
              searchable={false}
              options={MUST_CHANGE_OPTIONS}
              value="true"
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button disabled={busy}>
              {busy ? "Saving..." : "Reset Password"}
            </Button>

            <button
              type="button"
              onClick={onCancel}
              className="rounded-2xl border px-4 py-3 text-sm font-bold"
            >
              Cancel
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function MultiCheckSelect({
  options,
  selected,
  onChange,
  allLabel,
}: any) {
  const selectedSet = new Set(selected || []);
  const allSelected = options.every((option: any) =>
    selectedSet.has(option.value),
  );
  const summary = allSelected
    ? allLabel
    : options
        .filter((option: any) => selectedSet.has(option.value))
        .map((option: any) => option.label)
        .join(", ") || "Select options";
  function toggle(value: string, checked: boolean) {
    if (value === "__all") {
      onChange(checked ? options.map((option: any) => option.value) : []);
      return;
    }
    const next = new Set(selectedSet);
    if (checked) next.add(value);
    else next.delete(value);
    onChange(Array.from(next));
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <p className="truncate text-sm font-bold text-slate-800">{summary}</p>
        <label className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event: any) => toggle("__all", event.target.checked)}
            className="h-4 w-4"
          />
          {allLabel}
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {options.map((option: any) => (
          <label
            key={option.value}
            className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
              selectedSet.has(option.value)
                ? "border-blue-200 bg-blue-50 text-slate-900"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <input
              type="checkbox"
              checked={selectedSet.has(option.value)}
              onChange={(event: any) =>
                toggle(option.value, event.target.checked)
              }
              className="h-4 w-4"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function CheckboxList({
  title,
  name,
  rows,
  selected,
  valueKey,
  labelKey,
  onRowOpen,
  onSelectionChange,
}: any) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase text-slate-500">{title}</p>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row: any) => {
          const value = row[valueKey];
          const checked = (selected || []).includes(value);
          return (
            <div
              key={row.id}
              role={onRowOpen ? "button" : undefined}
              tabIndex={onRowOpen ? 0 : undefined}
              onClick={() => onRowOpen?.(row)}
              onKeyDown={(event: any) => {
                if (!onRowOpen || (event.key !== "Enter" && event.key !== " "))
                  return;
                event.preventDefault();
                onRowOpen(row);
              }}
              className={`flex items-start gap-2 rounded-2xl border border-slate-200 p-3 text-xs ${
                onRowOpen
                  ? "cursor-pointer transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300  border-red-400"
                  : ""
              }`}
            >
              <input
                name={name}
                type="checkbox"
                value={value}
                checked={onSelectionChange ? checked : undefined}
                defaultChecked={onSelectionChange ? undefined : checked}
                onClick={(event) => event.stopPropagation()}
                onChange={(event: any) => {
                  onSelectionChange?.(
                    event.target.checked
                      ? Array.from(new Set([...(selected || []), value]))
                      : (selected || []).filter((item: any) => item !== value),
                  );
                }}
                className=" lg:h-4 lg:w-4 h-5 w-5"
              />
              <span className="flex items-center gap-1 h-full">
                <b className="md:text-sm lg:text-xs">{row[labelKey]}</b>
                {row.branchLabel && (
                  <span className="block text-xs text-slate-500">
                    {row.branchLabel}
                  </span>
                )}
                {isLocked(row) && (
                  <span className=" inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">
                    Template
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ListCard({
  title,
  rows,
  searchKeys,
  createLabel,
  onCreate,
  filters = [],
  filterValues = {},
  onFilterChange,
  onRefresh,
  columns,
  render,
}: any) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filtered = useMemo(() => {
    return rows.filter((row: any) =>
      searchKeys.some((key: string) =>
        String(row[key] ?? "")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    );
  }, [rows, query, searchKeys]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageRows = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  useEffect(() => {
    setPage(1);
  }, [query, rows.length]);

  return (
    <Card>
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="card-title font-bold">{title}</h3>
          <p className="card-desc text-slate-500">
            Latest created or updated records appear first. Click a row to open
            it.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && <RefreshButton onRefresh={onRefresh} />}

          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-xs bg-slate-900 font-bold text-white"
          >
            <Plus size={16} />
            {createLabel}
          </button>
        </div>
      </div>

      {/* SEARCH */}
      {/* SEARCH & FILTERS */}
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {/* Search */}
        <FormField label={`${title}`}>
          <Input
            value={query}
            onChange={(e: any) => setQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}`}
            className="search-filter"
          />
        </FormField>

        {/* Dynamic Filters */}
        {filters.map((filter: any) => (
          <FormField key={filter.key} label={filter.label}>
            <SearchableSelect
              name={filter.key}
              value={filterValues[filter.key] ?? "all"}
              onChange={(value) => onFilterChange?.(filter.key, value)}
              options={filter.options}
              searchable={false}
              placeholder={`Select ${filter.label}`}
              className="w-full"
            />
          </FormField>
        ))}
      </div>

      {/* TABLE */}
      <div className="mt-4 overflow-x-auto w-lg rounded-2xl border border-slate-200 ">
        <table className="w-max min-w-full">
          <thead className="font-bold uppercase text-slate-500 ">
            <tr className="bg-slate-50">
              {columns.map((column: any) => (
                <th
                  key={column.label}
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase text-slate-500"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* ROWS */}
          <tbody className="divide-y divide-slate-200">
            {pageRows.length === 0 && (
              <Empty text="No records match your search." />
            )}

            {pageRows.map((row: any, index: number) => render(row, index))}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={filtered.length}
        pageSize={pageSize}
        onPage={setPage}
      />
    </Card>
  );
}
