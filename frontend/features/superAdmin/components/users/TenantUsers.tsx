"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Input, RefreshButton } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { Pagination } from "@/app/components/common/Pagination";
import { TenantPicker } from "../shared/TenantPicker";
import { status_options } from "../../constants";
import { FormField } from "@/app/components/FormElements";
import {
  FilterSection,
  FilterConfig,
} from "@/app/components/common/FilterSection";
import { DataTable } from "@/app/components/common/DataTable";
import { SortState } from "@/utils/types";
import { getUserColumns } from "./Column";

const filterConfigs: FilterConfig[] = [
  {
    key: "status",
    label: "Status",
    options: status_options,
  },
  // {
  //   key: "dateField",
  //   label: "Date field",
  //   options: dateFieldOptions,
  // },
];

export function TenantUsers({
  tenants,
  selectedId,
  setSelectedId,
  users,
  canCopyIds = false,
  setSelectedUserId,
  setSection,
  setConfirmAction,
  onRefresh,
  busy,
}: any) {
  const [filters, setFilters] = useState({
    query: "",
    status: "all",
    fromDate: "",
    toDate: "",
    dateField: "updated_at",
  });
  const [sort, setSort] = useState<SortState>({ key: "updated_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 8;

  function updateFilter(key: string, value: string) {
    setFilters({ ...filters, [key]: value });
  }
  function resetFilters() {
    setFilters({
      query: "",
      status: "all",
      fromDate: "",
      toDate: "",
      dateField: "updated_at",
    });
  }
  function rowValue(user: any, key: string) {
    return key === "created_at" || key === "updated_at"
      ? new Date(user[key] || user.created_at || 0).getTime()
      : String(user[key] || "").toLowerCase();
  }

  const filtered = users
    .filter((user: any) => {
      const text = [
        user.name,
        user.email,
        user.mobile,
        user.user_type,
        user.roles,
        user.id,
      ]
        .join(" ")
        .toLowerCase();
      const dateValue = user[filters.dateField] || user.created_at;
      const timestamp = dateValue ? new Date(dateValue).getTime() : 0;
      const from = filters.fromDate ? new Date(filters.fromDate).getTime() : 0;
      const to = filters.toDate
        ? new Date(`${filters.toDate}T23:59:59`).getTime()
        : Number.MAX_SAFE_INTEGER;
      return (
        (!filters.query || text.includes(filters.query.toLowerCase())) &&
        (filters.status === "all" ||
          (filters.status === "active" ? user.is_active : !user.is_active)) &&
        (!filters.fromDate || timestamp >= from) &&
        (!filters.toDate || timestamp <= to)
      );
    })
    .sort((a: any, b: any) => {
      const left = rowValue(a, sort.key);
      const right = rowValue(b, sort.key);
      if (left < right) return sort.dir === "asc" ? -1 : 1;
      if (left > right) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filters, sort, users.length]);

  const userColumns = getUserColumns({
    canCopyIds,
    setSelectedUserId,
    setSection,
    setConfirmAction,
  });

  return (
    <div className="mt-3">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <div className="flex ">
              <h3 className="card-title font-bold mr-3">Users</h3>
              <Badge tone="blue" className="normal-badge">
                {filtered.length} users
              </Badge>
            </div>
            <p className="card-desc text-slate-500">
              Create, edit, activate/deactivate, and search tenant users.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh ? <RefreshButton onRefresh={onRefresh} /> : null}
            <CreateActionButton
              label="Create User"
              onClick={() => setSection("userCreate")}
            />
          </div>
        </div>
        <FilterSection
          title="User"
          query={filters.query}
          setQuery={(value) => updateFilter("query", value)}
          searchPlaceholder="Name, email, mobile, type"
          filters={filterConfigs}
          filterValues={filters}
          onFilterChange={updateFilter}
          onReset={resetFilters}
          className="lg:grid-cols-4 xl:grid-cols-6"
        >
          <TenantPicker
            tenants={tenants}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
          <FormField label="From">
            <Input
              type="date"
              value={filters.fromDate}
              onChange={(e: any) => updateFilter("fromDate", e.target.value)}
            />
          </FormField>
          <FormField label="To">
            <Input
              type="date"
              value={filters.toDate}
              onChange={(e: any) => updateFilter("toDate", e.target.value)}
            />
          </FormField>
        </FilterSection>
        <div className="mt-4 overflow-x-auto scrollbar-hidden rounded-2xl border border-slate-200 ">
          <div className="min-w-[1000px]">
            <DataTable
              columns={userColumns}
              data={rows}
              loading={busy && rows.length === 0}
              emptyMessage="No users match your search."
              onRowClick={(user) => {
                setSelectedUserId(user.id);
                setSection("userEdit");
              }}
              sort={sort}
              onSortChange={setSort}
            />
          </div>
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={pageSize}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
