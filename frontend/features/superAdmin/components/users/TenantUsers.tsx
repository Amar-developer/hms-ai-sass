"use client";

import { useEffect, useState } from "react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Card,
  Field,
  Input,
  RefreshButton,
  SearchableSelect,
  Select,
} from "@/app/components/common/ui";
import { formatDate } from "../../helpers";
import { CreateActionButton } from "../shared/CreateActionButton";
import { Empty } from "@/app/components/common/Empty";
import { Pagination } from "@/app/components/common/Pagination";
import { SortButton } from "../shared/SortButton";
import { TenantPicker } from "../shared/TenantPicker";
import { UserRoleList } from "./UserRoleList";
import { dateFieldOptions, status_options } from "../../constants";
import { RowActions } from "@/features/admin/components/RowActions";
import { FormField } from "@/app/components/FormElements";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";
import { DataTable } from "@/features/reports/components/DataTable";
import { Column } from "@/features/reports/types";

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
}: any) {
  const [filters, setFilters] = useState({
    query: "",
    status: "all",
    fromDate: "",
    toDate: "",
    dateField: "updated_at",
  });
  const [sort, setSort] = useState({ key: "updated_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 8;

  function updateFilter(key: string, value: string) {
    setFilters({ ...filters, [key]: value });
  }
  function changeSort(key: string) {
    setSort(
      sort.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
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

  const userColumns: Column<any>[] = [
    {
      key: "name",
      header: "User",
      width: "180px",
      render: (user: any) => (
        <div>
          <div className="flex items-center gap-2">
            <b className="text-xs lg:text-sm">{user.name}</b>

            <CopyIdButton
              value={user.id}
              label="User ID"
              allowed={canCopyIds}
            />
          </div>

          <p className="text-[10px] lg:text-xs text-slate-500">
            {user.user_number || "User account"}
          </p>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      width: "200px",
      render: (user: any) => (
        <span className="break-all text-xs lg:text-sm">{user.email}</span>
      ),
    },

    {
      key: "roles",
      header: "Roles",
      width: "150px",
      className: "text-center",
      render: (user: any) => <UserRoleList user={user} />,
    },

    {
      key: "mobile",
      header: "Mobile",
      width: "120px",
      className: "text-center",
      render: (user: any) => (
        <span className="text-xs lg:text-sm">{user.mobile || "-"}</span>
      ),
    },

    {
      key: "is_active",
      header: "Status",
      width: "120px",
      className: "text-center",
      render: (user: any) => (
        <Badge
          tone={user.is_active ? "green" : "red"}
          className="rounded-full py-1 px-1 text-xs"
        >
          {user.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },

    {
      key: "created_at",
      header: "Created",
      width: "120px",
      render: (user: any) => (
        <span className="text-xs lg:text-sm">
          {formatDate(user.created_at)}
        </span>
      ),
    },

    {
      key: "updated_at",
      header: "Modified",
      width: "120px",
      render: (user: any) => (
        <span className="text-xs lg:text-sm">
          {formatDate(user.updated_at)}
        </span>
      ),
    },

    {
      key: "actions",
      header: "Actions",
      width: "100px",
      disableRowClick: true,
      render: (user: any) => {
        const actions = [
          {
            label: "Edit",
            onClick: () => {
              setSelectedUserId(user.id);
              setSection("userEdit");
            },
          },
          {
            label: user.is_active ? "Inactive" : "Active",
            onClick: () =>
              setConfirmAction({
                entity: "user",
                kind: "status",
                user,
              }),
          },
          {
            label: "Delete",
            danger: true,
            onClick: () =>
              setConfirmAction({
                entity: "user",
                kind: "delete",
                user,
              }),
          },
        ];

        return <RowActions actions={actions} className="right-16 -bottom-5" />;
      },
    },
  ];

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <div className="flex ">
            <h3 className="card-title font-bold mr-3">Users</h3>
            <Badge tone="blue" className="table-status">
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
      <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        <TenantPicker
          tenants={tenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
        <FormField label="User">
          <Input
            value={filters.query}
            onChange={(e: any) => updateFilter("query", e.target.value)}
            placeholder="Name, email, mobile, type"
          />
        </FormField>
        <FormField label="Status">
          <SearchableSelect
            value={filters.status}
            onChange={(value: any) => updateFilter("status", value)}
            options={status_options}
            searchable={false}
          />
        </FormField>

        <FormField label="Date field">
          <SearchableSelect
            value={filters.dateField}
            onChange={(value) => updateFilter("dateField", value)}
            options={dateFieldOptions}
            searchable={false}
          />
        </FormField>
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
      </div>
      <div className="mt-4 overflow-x-auto scrollbar-hidden rounded-2xl border border-slate-200 ">
        <div className="min-w-[1000px]">
          <DataTable
            columns={userColumns}
            data={rows}
            emptyMessage="No users match your search."
            onRowClick={(user) => {
              setSelectedUserId(user.id);
              setSection("userEdit");
            }}
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
  );
}
